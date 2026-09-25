import csv
import io
import math
import uuid
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.access import has_permission, require_permission
from app.config import settings
from app.database import get_db
from app.feedback_models import Feedback
from app.feedback_schemas import (
    FeedbackCreate,
    FeedbackManageUpdate,
    FeedbackPage,
    FeedbackResponse,
    FeedbackType,
)
from app.models import AuditLog, User


router = APIRouter(prefix="/feedback", tags=["Demo Feedback"])

ALLOWED_SCREENSHOT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


def _client_ip(request: Request) -> str | None:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", maxsplit=1)[0].strip()
    return request.client.host if request.client else None


def _audit(
    db: Session,
    request: Request,
    actor: User,
    *,
    action: str,
    feedback: Feedback | None = None,
    details: dict | None = None,
) -> None:
    audit_details = dict(details or {})
    if feedback:
        audit_details.update(
            {"feedback_id": str(feedback.id), "feedback_title": feedback.title}
        )
    db.add(
        AuditLog(
            user_id=actor.id,
            action=action,
            module="feedback",
            status="success",
            identifier=str(feedback.id) if feedback else None,
            ip_address=_client_ip(request),
            user_agent=request.headers.get("user-agent"),
            details=audit_details or None,
        )
    )


def _feedback_response(item: Feedback) -> FeedbackResponse:
    return FeedbackResponse(
        id=item.id,
        module_page=item.module_page,
        feedback_type=item.feedback_type,
        title=item.title,
        description=item.description,
        suggested_change=item.suggested_change,
        priority=item.priority,
        status=item.status,
        internal_note=item.internal_note,
        screenshot_original_name=item.screenshot_original_name,
        screenshot_url=item.screenshot_url,
        screenshot_content_type=item.screenshot_content_type,
        screenshot_size=item.screenshot_size,
        submitted_by_id=item.submitted_by_id,
        submitted_by_name=(
            item.submitted_by.full_name if item.submitted_by else "Former user"
        ),
        assigned_to_id=item.assigned_to_id,
        assigned_to_name=item.assigned_to.full_name if item.assigned_to else None,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def _get_feedback(db: Session, feedback_id: uuid.UUID) -> Feedback:
    item = db.get(Feedback, feedback_id)
    if not item:
        raise HTTPException(status_code=404, detail="Feedback was not found.")
    return item


def _new_feedback(payload: FeedbackCreate, actor: User) -> Feedback:
    return Feedback(
        module_page=payload.module_page,
        feedback_type=payload.feedback_type,
        title=payload.title,
        description=payload.description,
        suggested_change=payload.suggested_change,
        priority=payload.priority,
        status="new",
        submitted_by_id=actor.id,
        submitted_by=actor,
    )


def _detected_image_type(content: bytes) -> str | None:
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    return None


async def _save_screenshot(file: UploadFile, item: Feedback) -> Path:
    declared_type = (file.content_type or "").casefold()
    if declared_type not in ALLOWED_SCREENSHOT_TYPES:
        raise HTTPException(
            status_code=415,
            detail="Screenshots must be JPEG, PNG or WebP images.",
        )
    max_bytes = settings.max_upload_mb * 1024 * 1024
    content = await file.read(max_bytes + 1)
    if not content:
        raise HTTPException(status_code=400, detail="The screenshot is empty.")
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Screenshots must be {settings.max_upload_mb} MB or smaller.",
        )
    detected_type = _detected_image_type(content)
    if detected_type != declared_type:
        raise HTTPException(
            status_code=415,
            detail="The screenshot content does not match its image type.",
        )

    upload_root = Path(settings.upload_dir).resolve()
    feedback_directory = (upload_root / "feedback").resolve()
    feedback_directory.mkdir(parents=True, exist_ok=True)
    storage_name = f"{item.id.hex}-{uuid.uuid4().hex}{ALLOWED_SCREENSHOT_TYPES[detected_type]}"
    target = (feedback_directory / storage_name).resolve()
    if feedback_directory not in target.parents:
        raise HTTPException(status_code=400, detail="Invalid screenshot path.")
    target.write_bytes(content)

    item.screenshot_original_name = Path(file.filename or "screenshot").name[:255]
    item.screenshot_storage_name = storage_name
    item.screenshot_url = f"/uploads/feedback/{storage_name}"
    item.screenshot_content_type = detected_type
    item.screenshot_size = len(content)
    return target


def _remove_replaced_file(storage_name: str | None) -> None:
    if not storage_name:
        return
    feedback_directory = (Path(settings.upload_dir).resolve() / "feedback").resolve()
    target = (feedback_directory / storage_name).resolve()
    if feedback_directory in target.parents and target.is_file():
        target.unlink(missing_ok=True)


@router.post("", response_model=FeedbackResponse, status_code=status.HTTP_201_CREATED)
def submit_feedback(
    payload: FeedbackCreate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission("feedback.create")),
) -> FeedbackResponse:
    item = _new_feedback(payload, actor)
    db.add(item)
    db.flush()
    _audit(db, request, actor, action="feedback_submitted", feedback=item)
    db.commit()
    db.refresh(item)
    return _feedback_response(item)


@router.post(
    "/with-screenshot",
    response_model=FeedbackResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_feedback_with_screenshot(
    request: Request,
    module_page: str = Form(min_length=2, max_length=160),
    feedback_type: FeedbackType = Form(),
    title: str = Form(min_length=3, max_length=220),
    description: str = Form(min_length=5, max_length=20_000),
    suggested_change: str = Form(default="", max_length=20_000),
    priority: str = Form(default="medium"),
    screenshot: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission("feedback.create")),
) -> FeedbackResponse:
    payload = FeedbackCreate(
        module_page=module_page,
        feedback_type=feedback_type,
        title=title,
        description=description,
        suggested_change=suggested_change,
        priority=priority,
    )
    item = _new_feedback(payload, actor)
    db.add(item)
    db.flush()
    saved_path: Path | None = None
    try:
        if screenshot and screenshot.filename:
            saved_path = await _save_screenshot(screenshot, item)
        _audit(
            db,
            request,
            actor,
            action="feedback_submitted",
            feedback=item,
            details={"has_screenshot": saved_path is not None},
        )
        db.commit()
    except Exception:
        db.rollback()
        if saved_path:
            saved_path.unlink(missing_ok=True)
        raise
    db.refresh(item)
    return _feedback_response(item)


def _filtered_feedback_statement(
    *,
    search: str | None,
    feedback_status: str | None,
    priority: str | None,
    feedback_type: str | None,
    module_page: str | None,
    assigned_to_id: uuid.UUID | None,
    submitted_by_id: uuid.UUID | None,
):
    statement = select(Feedback)
    if search and search.strip():
        term = f"%{search.strip().casefold()}%"
        statement = statement.where(
            or_(
                func.lower(Feedback.title).like(term),
                func.lower(Feedback.description).like(term),
                func.lower(Feedback.suggested_change).like(term),
                func.lower(Feedback.module_page).like(term),
            )
        )
    if feedback_status:
        statement = statement.where(Feedback.status == feedback_status)
    if priority:
        statement = statement.where(Feedback.priority == priority)
    if feedback_type:
        statement = statement.where(Feedback.feedback_type == feedback_type)
    if module_page and module_page.strip():
        statement = statement.where(
            func.lower(Feedback.module_page) == module_page.strip().casefold()
        )
    if assigned_to_id:
        statement = statement.where(Feedback.assigned_to_id == assigned_to_id)
    if submitted_by_id:
        statement = statement.where(Feedback.submitted_by_id == submitted_by_id)
    return statement


@router.get("", response_model=FeedbackPage)
def list_feedback(
    search: str | None = Query(default=None, max_length=200),
    feedback_status: str | None = Query(default=None, alias="status"),
    priority: str | None = None,
    feedback_type: str | None = Query(default=None, alias="type"),
    module_page: str | None = Query(default=None, max_length=160),
    assigned_to_id: uuid.UUID | None = None,
    submitted_by_id: uuid.UUID | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("feedback.view")),
) -> FeedbackPage:
    statement = _filtered_feedback_statement(
        search=search,
        feedback_status=feedback_status,
        priority=priority,
        feedback_type=feedback_type,
        module_page=module_page,
        assigned_to_id=assigned_to_id,
        submitted_by_id=submitted_by_id,
    )
    total = db.scalar(select(func.count()).select_from(statement.subquery())) or 0
    items = db.scalars(
        statement.order_by(Feedback.updated_at.desc(), Feedback.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return FeedbackPage(
        items=[_feedback_response(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total else 0,
    )


def _export_rows(db: Session) -> list[Feedback]:
    return list(
        db.scalars(
            select(Feedback).order_by(
                Feedback.created_at.desc(), Feedback.updated_at.desc()
            )
        ).all()
    )


def _safe_spreadsheet_cell(value: object) -> object:
    if isinstance(value, str) and value.startswith(("=", "+", "-", "@")):
        return f"'{value}"
    return value


def _row_values(item: Feedback) -> list[object]:
    response = _feedback_response(item)
    return [
        str(response.id),
        response.module_page,
        response.feedback_type,
        response.title,
        response.description,
        response.suggested_change,
        response.priority,
        response.status,
        response.submitted_by_name,
        response.created_at.isoformat(),
        response.assigned_to_name or "",
        response.internal_note,
        response.screenshot_url or "",
    ]


EXPORT_HEADERS = [
    "ID",
    "Module or page",
    "Type",
    "Title",
    "Description",
    "Suggested change",
    "Priority",
    "Status",
    "Submitted by",
    "Submitted date",
    "Assigned to",
    "Internal note",
    "Screenshot URL",
]


@router.get("/export.csv")
def export_feedback_csv(
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission("feedback.view")),
) -> StreamingResponse:
    items = _export_rows(db)
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(EXPORT_HEADERS)
    writer.writerows(
        [_safe_spreadsheet_cell(value) for value in _row_values(item)]
        for item in items
    )
    _audit(
        db,
        request,
        actor,
        action="feedback_exported_csv",
        details={"row_count": len(items)},
    )
    db.commit()
    content = ("\ufeff" + output.getvalue()).encode("utf-8")
    return StreamingResponse(
        iter([content]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="demo-feedback.csv"'},
    )


@router.get("/export.xlsx")
def export_feedback_xlsx(
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission("feedback.view")),
) -> StreamingResponse:
    items = _export_rows(db)
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "Demo Feedback"
    worksheet.append(EXPORT_HEADERS)
    for item in items:
        worksheet.append(
            [_safe_spreadsheet_cell(value) for value in _row_values(item)]
        )
    worksheet.freeze_panes = "A2"
    worksheet.auto_filter.ref = worksheet.dimensions
    for column in worksheet.columns:
        letter = column[0].column_letter
        worksheet.column_dimensions[letter].width = min(
            max(len(str(cell.value or "")) for cell in column) + 2, 45
        )
    output = io.BytesIO()
    workbook.save(output)
    output.seek(0)
    _audit(
        db,
        request,
        actor,
        action="feedback_exported_xlsx",
        details={"row_count": len(items)},
    )
    db.commit()
    return StreamingResponse(
        output,
        media_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        headers={"Content-Disposition": 'attachment; filename="demo-feedback.xlsx"'},
    )


@router.get("/{feedback_id}", response_model=FeedbackResponse)
def get_feedback(
    feedback_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("feedback.view")),
) -> FeedbackResponse:
    return _feedback_response(_get_feedback(db, feedback_id))


@router.patch("/{feedback_id}", response_model=FeedbackResponse)
def manage_feedback(
    feedback_id: uuid.UUID,
    payload: FeedbackManageUpdate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission("feedback.manage")),
) -> FeedbackResponse:
    item = _get_feedback(db, feedback_id)
    changed: dict[str, object] = {}
    if payload.priority is not None and payload.priority != item.priority:
        changed["priority"] = {"from": item.priority, "to": payload.priority}
        item.priority = payload.priority
    if payload.status is not None and payload.status != item.status:
        changed["status"] = {"from": item.status, "to": payload.status}
        item.status = payload.status
    if payload.internal_note is not None and payload.internal_note != item.internal_note:
        changed["internal_note_updated"] = True
        item.internal_note = payload.internal_note
    if payload.clear_assignment:
        if item.assigned_to_id is not None:
            changed["assigned_to_id"] = {"from": str(item.assigned_to_id), "to": None}
        item.assigned_to_id = None
        item.assigned_to = None
    elif payload.assigned_to_id is not None:
        assignee = db.get(User, payload.assigned_to_id)
        if not assignee or not assignee.is_active:
            raise HTTPException(status_code=422, detail="Assignee is not an active user.")
        if payload.assigned_to_id != item.assigned_to_id:
            changed["assigned_to_id"] = {
                "from": str(item.assigned_to_id) if item.assigned_to_id else None,
                "to": str(payload.assigned_to_id),
            }
        item.assigned_to_id = assignee.id
        item.assigned_to = assignee
    _audit(
        db,
        request,
        actor,
        action="feedback_managed",
        feedback=item,
        details={"changes": changed},
    )
    db.commit()
    db.refresh(item)
    return _feedback_response(item)


@router.post("/{feedback_id}/screenshot", response_model=FeedbackResponse)
async def upload_feedback_screenshot(
    feedback_id: uuid.UUID,
    request: Request,
    screenshot: UploadFile = File(),
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission("feedback.create")),
) -> FeedbackResponse:
    item = _get_feedback(db, feedback_id)
    if item.submitted_by_id != actor.id and not has_permission(actor, "feedback.manage"):
        raise HTTPException(
            status_code=403,
            detail="You may attach a screenshot only to your own feedback.",
        )
    previous_storage_name = item.screenshot_storage_name
    saved_path: Path | None = None
    try:
        saved_path = await _save_screenshot(screenshot, item)
        _audit(
            db,
            request,
            actor,
            action="feedback_screenshot_uploaded",
            feedback=item,
        )
        db.commit()
    except Exception:
        db.rollback()
        if saved_path:
            saved_path.unlink(missing_ok=True)
        raise
    _remove_replaced_file(previous_storage_name)
    db.refresh(item)
    return _feedback_response(item)
