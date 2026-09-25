"""Publish the current active ERP product baseline once.

Future ERP products are unaffected because the normal synchronizer continues to
create CatalogueEntry records in Draft. The audit marker prevents an accidental
second baseline run from publishing products imported later.

Usage:
    python -m app.scripts.publish_erp_product_baseline
    python -m app.scripts.publish_erp_product_baseline --apply
    python -m app.scripts.publish_erp_product_baseline --rollback
"""

from __future__ import annotations

import argparse
from datetime import UTC, datetime

from sqlalchemy import func, select, update

from app.database import SessionLocal
from app.models import AuditLog, CatalogueEntry, Product, User


AUDIT_ACTION = "erp_product_baseline_published"


def _actor(db) -> User:
    users = db.scalars(select(User).where(User.is_active.is_(True))).all()
    actor = next(
        (
            user
            for user in users
            if user.username.casefold() == "superadmin"
            and any(role.name == "superadmin" for role in user.roles)
        ),
        None,
    )
    if actor is None:
        actor = next(
            (
                user
                for user in users
                if any(role.name == "superadmin" for role in user.roles)
            ),
            None,
        )
    if actor is None:
        raise RuntimeError("No active SuperAdmin account is available for attribution.")
    return actor


def _marker(db) -> AuditLog | None:
    return db.scalar(
        select(AuditLog)
        .where(AuditLog.action == AUDIT_ACTION, AuditLog.status == "success")
        .order_by(AuditLog.created_at.desc())
        .limit(1)
    )


def _eligible_product_ids(cutoff: datetime):
    return select(Product.id).where(
        Product.source_system == "gms_erp",
        Product.source_record_exists.is_(True),
        Product.status == "active",
        Product.last_source_sync_at <= cutoff,
    )


def preview() -> dict[str, int | str | bool]:
    with SessionLocal() as db:
        marker = _marker(db)
        cutoff = datetime.now(UTC)
        eligible = _eligible_product_ids(cutoff)
        count = db.scalar(
            select(func.count())
            .select_from(CatalogueEntry)
            .where(
                CatalogueEntry.product_id.in_(eligible),
                CatalogueEntry.workflow_status != "published",
            )
        ) or 0
        return {
            "already_applied": marker is not None,
            "eligible_to_publish": count,
            "cutoff": cutoff.isoformat(),
        }


def apply() -> dict[str, int | str]:
    with SessionLocal() as db:
        marker = _marker(db)
        if marker is not None:
            raise RuntimeError(
                f"The ERP baseline was already published at {marker.created_at.isoformat()}."
            )
        actor = _actor(db)
        published_at = datetime.now(UTC)
        eligible = _eligible_product_ids(published_at)
        result = db.execute(
            update(CatalogueEntry)
            .where(
                CatalogueEntry.product_id.in_(eligible),
                CatalogueEntry.workflow_status != "published",
            )
            .values(
                workflow_status="published",
                visibility="public",
                submitted_at=func.coalesce(CatalogueEntry.submitted_at, published_at),
                approved_at=func.coalesce(CatalogueEntry.approved_at, published_at),
                approved_by_id=func.coalesce(CatalogueEntry.approved_by_id, actor.id),
                published_at=published_at,
                published_by_id=actor.id,
                updated_by_id=actor.id,
                updated_at=published_at,
            )
        )
        changed = int(result.rowcount or 0)
        db.add(
            AuditLog(
                user_id=actor.id,
                action=AUDIT_ACTION,
                module="catalogue",
                status="success",
                identifier="active-gms-erp-products",
                details={
                    "published_count": changed,
                    "cutoff": published_at.isoformat(),
                    "scope": "active ERP products existing at the cutoff",
                    "future_products": "remain draft",
                },
            )
        )
        db.commit()
        return {
            "published_count": changed,
            "cutoff": published_at.isoformat(),
            "actor": actor.username,
        }


def rollback() -> dict[str, int | str]:
    with SessionLocal() as db:
        marker = _marker(db)
        if marker is None or not marker.details:
            raise RuntimeError("No ERP baseline publication marker was found.")
        cutoff_text = str(marker.details.get("cutoff") or "")
        cutoff = datetime.fromisoformat(cutoff_text)
        actor_id = marker.user_id
        result = db.execute(
            update(CatalogueEntry)
            .where(
                CatalogueEntry.product_id.in_(_eligible_product_ids(cutoff)),
                CatalogueEntry.workflow_status == "published",
                CatalogueEntry.published_at == cutoff,
                CatalogueEntry.published_by_id == actor_id,
            )
            .values(
                workflow_status="draft",
                visibility="hidden",
                submitted_at=None,
                approved_at=None,
                approved_by_id=None,
                published_at=None,
                published_by_id=None,
                updated_by_id=actor_id,
                updated_at=datetime.now(UTC),
            )
        )
        reverted = int(result.rowcount or 0)
        marker.status = "rolled_back"
        marker.details = {**marker.details, "rolled_back_count": reverted}
        db.commit()
        return {"rolled_back_count": reverted, "baseline_cutoff": cutoff_text}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--rollback", action="store_true")
    args = parser.parse_args()
    if args.apply:
        print(apply())
    elif args.rollback:
        print(rollback())
    else:
        print(preview())


if __name__ == "__main__":
    main()
