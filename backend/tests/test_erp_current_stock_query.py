from contextlib import AbstractContextManager
from decimal import Decimal

from app import erp_integration, product_sync_service


REQUIRED_CURRENT_STOCK_SQL = (
    "BalanceYear = YEAR(GETDATE())",
    "Periodno BETWEEN 0 AND MONTH(GETDATE())",
    "warehouse_ref.blocked",
    "warehouse_ref.Defect",
)


class CurrentStockCursor:
    def __init__(self):
        self.rows = []

    def execute(self, sql, params=()):
        current_scope = all(fragment in sql for fragment in REQUIRED_CURRENT_STOCK_SQL)
        if sql.lstrip().startswith("SELECT TOP"):
            # Product batch queries paginate; the manual ERP preview runs only once.
            if "p.Id > %s" in sql:
                self.rows = (
                    [{"erp_id": 143206, "sku": "18495", "barcode": "8850000184956"}]
                    if params == (0,)
                    else []
                )
            else:
                self.rows = [{"sku": "18495", "stock_quantity": 9 if current_scope else 1907}]
        elif sql.lstrip().startswith("SELECT CONVERT(nvarchar(120), po.Product)"):
            self.rows = [{"erp_id": "143206", "warehouse_code": "S12213", "on_hand": 9 if current_scope else 1907}]
        elif "FROM dbo.ProductUnits pu" in sql:
            self.rows = []
        else:
            raise AssertionError(f"Unexpected ERP query in stock contract test: {sql[:80]}")
        return self

    def fetchall(self):
        return self.rows


class CurrentStockConnection(AbstractContextManager):
    def cursor(self):
        return CurrentStockCursor()

    def __exit__(self, *_args):
        return False


def test_automatic_sync_reads_only_current_unblocked_nondefect_stock(monkeypatch):
    """Catches reintroducing historical, blocked, or defect warehouse quantities."""
    monkeypatch.setattr(product_sync_service, "_connect", lambda _setting: CurrentStockConnection())

    batches = list(product_sync_service._source_batches(object()))

    assert batches[0][1] == {
        "143206": [{"erp_id": "143206", "warehouse_code": "S12213", "on_hand": 9}]
    }


def test_manual_erp_import_uses_same_current_stock_scope(monkeypatch):
    """Catches the manual/import path overwriting live stock with the all-year total."""
    monkeypatch.setattr(erp_integration, "_connect", lambda _setting: CurrentStockConnection())

    rows = erp_integration._product_rows(object(), limit=1, include_discontinued=False)

    assert rows[0]["stock_quantity"] == 9


def test_current_stock_preserves_negative_warehouse_adjustments():
    """Catches inflating totals by replacing valid negative warehouse movements with zero."""
    rows = [
        {"warehouse_code": "MAIN", "on_hand": Decimal("142")},
        {"warehouse_code": "ADJUSTMENT", "on_hand": Decimal("-100")},
    ]

    assert product_sync_service._stock_total(rows) == Decimal("42")
