import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataSyncSettingsView } from "./data-sync-settings";

const mocks = vi.hoisted(() => ({ getStatus: vi.fn(), getHistory: vi.fn(), run: vi.fn() }));

vi.mock("@/lib/api", () => ({
  API_ORIGIN: "http://127.0.0.1:8000",
  ApiError: class ApiError extends Error {},
  getProductSyncStatus: mocks.getStatus,
  getProductSyncHistory: mocks.getHistory,
  runProductSync: mocks.run,
}));

const user = { id: "admin", username: "SuperAdmin", email: "admin@example.com", full_name: "Super Administrator", roles: ["superadmin"], permissions: [], is_superadmin: true };
const run = { id: "run-1", status: "completed", sync_type: "product_source_data", trigger: "automatic", source_database: "MSSQL", rows_read: 100, rows_created: 0, rows_updated: 3, rows_skipped: 0, products_matched: 100, stock_values_updated: 2, price_values_updated: 1, products_missing: 0, error_count: 0, retry_count: 0, duration_seconds: 4.2, message: "Complete", error_summary: "", details: {}, requested_by_id: null, started_at: "2026-08-05T02:00:00Z", completed_at: "2026-08-05T02:00:04Z" };
const healthy = { status: "completed", enabled: true, interval_seconds: 180, batch_size: 500, next_scheduled_sync: "2026-08-05T02:03:00Z", last_successful_sync: "2026-08-05T02:00:04Z", last_failed_sync: null, current_run: null, latest_run: run, source_database_status: "connected", records_read: 100, products_updated: 3, stock_values_updated: 2, price_values_updated: 1, products_missing: 0, duration_seconds: 4.2, data_is_stale: false, stale_level: "fresh", stale_warning_seconds: 360, stale_critical_seconds: 900 };

describe("Data synchronization settings", () => {
  beforeEach(() => {
    mocks.getStatus.mockResolvedValue(healthy);
    mocks.getHistory.mockResolvedValue([run]);
    mocks.run.mockResolvedValue(run);
  });

  it("shows sync metrics, last-sync time and runs the shared manual synchronization", async () => {
    render(<DataSyncSettingsView user={user} />);
    expect(await screen.findByText("Automatic product synchronization")).toBeInTheDocument();
    expect(screen.getByText("Stock and price information is current.")).toBeInTheDocument();
    expect(screen.getAllByText("100").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Sync Now" }));
    await waitFor(() => expect(mocks.run).toHaveBeenCalledTimes(1));
  });

  it("shows stale warnings and disables Sync Now for an active run", async () => {
    mocks.getStatus.mockResolvedValue({ ...healthy, status: "running", current_run: { ...run, status: "running", completed_at: null }, data_is_stale: true, stale_level: "critical" });
    render(<DataSyncSettingsView user={user} />);
    expect(await screen.findByText("Stock and price information may be outdated.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Synchronization running..." })).toBeDisabled();
  });
});
