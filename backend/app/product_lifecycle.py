from __future__ import annotations

from datetime import datetime
import uuid

from app.models import Product, ProductStatusHistory


AUTOMATIC_INACTIVE_REASONS = {"erp_discontinued", "missing_from_erp"}


def apply_erp_lifecycle(
    product: Product,
    *,
    is_discontinued: bool,
    changed_at: datetime,
    actor_id: uuid.UUID | None = None,
) -> ProductStatusHistory | None:
    """Apply ERP lifecycle state while preserving deliberate manual inactivation."""
    previous = product.status
    history: ProductStatusHistory | None = None
    if is_discontinued:
        product.lifecycle_status_source = "erp_discontinued"
        if previous != "inactive":
            product.status = "inactive"
            product.inactive_reason = "erp_discontinued"
            product.inactive_note = "ERP marks this product as blocked/discontinued."
            product.inactivated_at = changed_at
            product.inactivated_by_user_id = actor_id
            product.status_updated_at = changed_at
            history = ProductStatusHistory(
                product_id=product.id,
                old_status=previous,
                new_status="inactive",
                reason="erp_discontinued",
                note=product.inactive_note,
                changed_by_user_id=actor_id,
                changed_at=changed_at,
            )
    elif previous == "inactive" and product.inactive_reason in AUTOMATIC_INACTIVE_REASONS:
        product.status = "active"
        product.lifecycle_status_source = "erp_active"
        product.reactivated_at = changed_at
        product.reactivated_by_user_id = actor_id
        product.status_updated_at = changed_at
        history = ProductStatusHistory(
            product_id=product.id,
            old_status=previous,
            new_status="active",
            reason="erp_reactivated",
            note="ERP record is active again.",
            changed_by_user_id=actor_id,
            changed_at=changed_at,
        )
        product.inactive_reason = None
        product.inactive_note = ""
    elif previous == "inactive":
        product.lifecycle_status_source = "manual"
    else:
        product.lifecycle_status_source = "erp_active"
    return history


def apply_missing_lifecycle(
    product: Product,
    *,
    changed_at: datetime,
) -> ProductStatusHistory | None:
    """Retain a missing ERP record but hide it from customer-facing catalogues."""
    product.lifecycle_status_source = "missing_from_erp"
    if product.status == "inactive":
        return None
    product.status = "inactive"
    product.inactive_reason = "missing_from_erp"
    product.inactive_note = "Product was not present in the latest complete ERP synchronization."
    product.inactivated_at = changed_at
    product.status_updated_at = changed_at
    return ProductStatusHistory(
        product_id=product.id,
        old_status="active",
        new_status="inactive",
        reason="missing_from_erp",
        note=product.inactive_note,
        changed_by_user_id=None,
        changed_at=changed_at,
    )
