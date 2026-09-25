"""Read and aggregate purchase-order quantities for catalogue product cards."""

from __future__ import annotations

import logging
import re
import threading
import time
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable

import httpx

from app.config import settings


logger = logging.getLogger(__name__)

_cache_lock = threading.Lock()
_cached_rows: list[dict[str, Any]] | None = None
_cache_expires_at = 0.0


def _parse_quantity(value: Any) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    match = re.search(r"[-+]?\d[\d,]*(?:\.\d+)?", str(value))
    if match is None:
        return None
    try:
        quantity = Decimal(match.group(0).replace(",", ""))
    except InvalidOperation:
        return None
    return quantity if quantity >= 0 else None


def _format_quantity(value: Decimal) -> str:
    if value == value.to_integral_value():
        return f"{int(value):,}"
    return format(value, ",f").rstrip("0").rstrip(".")


def _status_bucket(value: Any) -> str | None:
    status = re.sub(r"[\s_-]+", " ", str(value or "").strip().casefold())
    if not status:
        return None
    if any(word in status for word in ("cancel", "received", "arrived", "complete", "closed")):
        return None
    if "not shipped" in status:
        return "ordered"
    if any(word in status for word in ("in transit", "intransit", "shipped", "on water")):
        return "in_transit"
    if any(word in status for word in ("ordered", "order placed", "purchase order", "pending shipment")):
        return "ordered"
    return None


def _request_rows() -> list[dict[str, Any]]:
    response = httpx.get(
        settings.purchase_order_api_url,
        timeout=settings.purchase_order_api_timeout_seconds,
    )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict) or str(payload.get("status", "")).casefold() != "success":
        raise ValueError("Purchase-order API returned an unsuccessful response.")
    data = payload.get("data")
    if not isinstance(data, list):
        raise ValueError("Purchase-order API response does not contain a data list.")
    return [row for row in data if isinstance(row, dict)]


def _purchase_order_rows() -> list[dict[str, Any]]:
    """Return a short-lived cached full list, retaining stale data on API errors."""

    global _cached_rows, _cache_expires_at

    now = time.monotonic()
    if _cached_rows is not None and now < _cache_expires_at:
        return _cached_rows

    with _cache_lock:
        now = time.monotonic()
        if _cached_rows is not None and now < _cache_expires_at:
            return _cached_rows
        try:
            rows = _request_rows()
        except (httpx.HTTPError, TypeError, ValueError) as exc:
            logger.warning("Purchase-order API unavailable: %s", exc)
            return _cached_rows or []
        _cached_rows = rows
        _cache_expires_at = now + settings.purchase_order_api_cache_seconds
        return rows


def purchase_order_quantities() -> dict[str, dict[str, str]]:
    totals: dict[str, dict[str, Decimal]] = {}
    for row in _purchase_order_rows():
        item_code = str(row.get("item_code") or "").strip()
        bucket = _status_bucket(row.get("status"))
        quantity = _parse_quantity(
            row.get("loading_qty")
            or row.get("ordered_qty")
            or row.get("order_qty")
            or row.get("qty")
        )
        if not item_code or bucket is None or quantity is None:
            continue
        item_totals = totals.setdefault(
            item_code,
            {"in_transit": Decimal(0), "ordered": Decimal(0)},
        )
        item_totals[bucket] += quantity

    return {
        item_code: {
            "in_transit": _format_quantity(values["in_transit"]),
            "ordered": _format_quantity(values["ordered"]),
        }
        for item_code, values in totals.items()
    }


def apply_purchase_order_quantities(products: Iterable[Any]) -> None:
    """Add PO totals to matching catalogue products without blocking failures."""

    quantities = purchase_order_quantities()
    if not quantities:
        return
    for product in products:
        values = quantities.get(str(product.code or "").strip())
        if values is None:
            continue
        details = dict(product.erp_details or {})
        details.update(values)
        product.erp_details = details
