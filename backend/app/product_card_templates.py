import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.access import has_permission, require_any_permission, require_permission
from app.database import get_db
from app.design_studio_models import ProductCardTemplate, ProductCardTemplateVersion
from app.design_studio_schemas import (
    ProductCardTemplatePayload,
    ProductCardTemplateResponse,
    ProductCardTemplateUpdate,
    ProductCardTemplateVersionPayload,
    ProductCardTemplateVersionResponse,
)
from app.models import AuditLog, User
from app.product_card_template_service import (
    add_version,
    create_template,
    duplicate_template,
    ensure_system_templates,
    get_visible_template,
    restore_version,
    soft_delete,
    update_template,
    visible_query,
)


router = APIRouter(prefix="/product-card-templates", tags=["Product Card Templates"])


def _audit(db: Session, request: Request, actor: User, action: str, item: ProductCardTemplate, details: dict | None = None):
    db.add(AuditLog(
        user_id=actor.id,
        action=action,
        module="product_card_templates",
        status="success",
        identifier=str(item.id),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        details=details or {},
    ))


@router.get("", response_model=list[ProductCardTemplateResponse])
def list_templates(
    include_inactive: bool = False,
    actor: User = Depends(require_permission("product_card_templates.view")),
    db: Session = Depends(get_db),
):
    ensure_system_templates(db)
    query = select(ProductCardTemplate).where(visible_query(actor))
    if not include_inactive:
        query = query.where(ProductCardTemplate.is_active.is_(True))
    return list(db.scalars(query.order_by(ProductCardTemplate.is_company_template.desc(), ProductCardTemplate.name)))


@router.post("", response_model=ProductCardTemplateResponse, status_code=status.HTTP_201_CREATED)
def create(
    payload: ProductCardTemplatePayload,
    request: Request,
    actor: User = Depends(require_permission("product_card_templates.create")),
    db: Session = Depends(get_db),
):
    item = create_template(db, actor, payload)
    _audit(db, request, actor, "product_card_template_created", item, {"version": 1})
    db.commit()
    db.refresh(item)
    return item


@router.get("/{template_id}", response_model=ProductCardTemplateResponse)
def get_one(
    template_id: uuid.UUID,
    actor: User = Depends(require_permission("product_card_templates.view")),
    db: Session = Depends(get_db),
):
    return get_visible_template(db, actor, template_id)


@router.patch("/{template_id}", response_model=ProductCardTemplateResponse)
def update(
    template_id: uuid.UUID,
    payload: ProductCardTemplateUpdate,
    request: Request,
    actor: User = Depends(require_any_permission("product_card_templates.edit_own", "product_card_templates.edit_all")),
    db: Session = Depends(get_db),
):
    item = update_template(db, actor, get_visible_template(db, actor, template_id), payload)
    _audit(db, request, actor, "product_card_template_updated", item, {"version": item.current_version})
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(
    template_id: uuid.UUID,
    request: Request,
    actor: User = Depends(require_any_permission("product_card_templates.delete_own", "product_card_templates.delete_all")),
    db: Session = Depends(get_db),
):
    item = get_visible_template(db, actor, template_id)
    soft_delete(item, actor)
    _audit(db, request, actor, "product_card_template_deleted", item)
    db.commit()


@router.post("/{template_id}/duplicate", response_model=ProductCardTemplateResponse, status_code=status.HTTP_201_CREATED)
def duplicate(
    template_id: uuid.UUID,
    request: Request,
    actor: User = Depends(require_permission("product_card_templates.duplicate")),
    db: Session = Depends(get_db),
):
    source = get_visible_template(db, actor, template_id)
    item = duplicate_template(db, actor, source)
    _audit(db, request, actor, "product_card_template_duplicated", item, {"source_template_id": str(source.id)})
    db.commit()
    db.refresh(item)
    return item


@router.get("/{template_id}/versions", response_model=list[ProductCardTemplateVersionResponse])
def versions(
    template_id: uuid.UUID,
    actor: User = Depends(require_permission("product_card_templates.view_versions")),
    db: Session = Depends(get_db),
):
    item = get_visible_template(db, actor, template_id)
    return list(db.scalars(
        select(ProductCardTemplateVersion)
        .where(ProductCardTemplateVersion.template_id == item.id)
        .order_by(ProductCardTemplateVersion.version_number.desc())
    ))


@router.post("/{template_id}/versions", response_model=ProductCardTemplateVersionResponse, status_code=status.HTTP_201_CREATED)
def save_version(
    template_id: uuid.UUID,
    payload: ProductCardTemplateVersionPayload,
    request: Request,
    actor: User = Depends(require_any_permission("product_card_templates.edit_own", "product_card_templates.edit_all")),
    db: Session = Depends(get_db),
):
    item = get_visible_template(db, actor, template_id)
    # Updating with an empty patch performs the ownership/system-template check.
    update_template(db, actor, item, ProductCardTemplateUpdate(change_note=payload.change_note, template_data=payload.template_data) if payload.template_data is not None else ProductCardTemplateUpdate(change_note=payload.change_note))
    version = db.scalar(select(ProductCardTemplateVersion).where(
        ProductCardTemplateVersion.template_id == item.id,
        ProductCardTemplateVersion.version_number == item.current_version,
    ))
    _audit(db, request, actor, "product_card_template_version_created", item, {"version": item.current_version})
    db.commit()
    db.refresh(version)
    return version


@router.post("/{template_id}/restore/{version_id}", response_model=ProductCardTemplateResponse)
def restore(
    template_id: uuid.UUID,
    version_id: uuid.UUID,
    request: Request,
    actor: User = Depends(require_permission("product_card_templates.restore_version")),
    db: Session = Depends(get_db),
):
    item = get_visible_template(db, actor, template_id)
    version = db.scalar(select(ProductCardTemplateVersion).where(
        ProductCardTemplateVersion.id == version_id,
        ProductCardTemplateVersion.template_id == item.id,
    ))
    if version is None:
        raise HTTPException(status_code=404, detail="Template version not found.")
    restore_version(db, actor, item, version)
    _audit(db, request, actor, "product_card_template_version_restored", item, {"restored_version": version.version_number, "new_version": item.current_version})
    db.commit()
    db.refresh(item)
    return item


@router.post("/{template_id}/approve", response_model=ProductCardTemplateResponse)
def approve(
    template_id: uuid.UUID,
    request: Request,
    actor: User = Depends(require_permission("product_card_templates.approve")),
    db: Session = Depends(get_db),
):
    item = db.get(ProductCardTemplate, template_id)
    if item is None or item.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Product card template not found.")
    item.approval_status = "approved"
    item.is_company_template = True
    item.visibility_scope = "company"
    item.updated_by_id = actor.id
    _audit(db, request, actor, "product_card_template_approved", item)
    db.commit()
    db.refresh(item)
    return item
