import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsShell } from "./settings-shell";
import { LanguageProvider } from "@/lib/i18n";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(), getCurrentUser: vi.fn(), getSystemMetrics: vi.fn(), getSystemInformation: vi.fn(),
  getBackups: vi.fn(), createBackup: vi.fn(), deleteBackup: vi.fn(), downloadBackup: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; } },
  getCurrentUser: mocks.getCurrentUser, getSystemMetrics: mocks.getSystemMetrics, getSystemInformation: mocks.getSystemInformation,
  getBackups: mocks.getBackups, createBackup: mocks.createBackup, deleteBackup: mocks.deleteBackup, downloadBackup: mocks.downloadBackup,
}));

const user = { id: "admin", username: "SuperAdmin", email: "admin@example.com", full_name: "Super Administrator", roles: ["superadmin"], permissions: [], is_superadmin: true };
const metrics = {
  status: "healthy", timestamp: "2026-08-03T13:30:00+07:00", thresholds: { cpu_percent: 85 }, warnings: [],
  system: { platform: "Windows", platform_release: "Server", uptime_seconds: 86400, cpu_percent: 34.2, physical_cores: 8, logical_processors: 16, memory_total_bytes: 64e9, memory_used_bytes: 32e9, memory_percent: 50, disk_total_bytes: 1e12, disk_used_bytes: 5e11, disk_free_bytes: 5e11, disk_percent: 50, backup_storage_bytes: 2e9, media_storage_bytes: 1e9 },
  application: { version: "demo-0.2.0", uptime_seconds: 7200, environment: "demo", api_response_ms: 18 },
  database: { status: "connected", response_ms: 7 }, backups: { restore_enabled: false },
};

describe("SuperAdmin Settings", () => {
  beforeEach(() => { window.localStorage.clear(); mocks.getCurrentUser.mockResolvedValue(user); mocks.getSystemMetrics.mockResolvedValue(metrics); mocks.getBackups.mockResolvedValue([]); mocks.createBackup.mockResolvedValue({ status: "completed" }); });

  it("changes and persists the language from General Settings", async () => {
    render(<LanguageProvider><SettingsShell view="general" /></LanguageProvider>);
    await screen.findByText("Languages");
    const thaiButtons = screen.getAllByRole("button", { name: "ไทย" });
    fireEvent.click(thaiButtons.at(-1)!);
    await waitFor(() => expect(window.localStorage.getItem("gms-catalogue-language")).toBe("th"));
    expect(document.documentElement.lang).toBe("th");
  });

  it("renders protected CPU, memory, disk, uptime and database metrics", async () => {
    render(<SettingsShell view="system-health" />);
    expect(await screen.findByText("CPU usage")).toBeInTheDocument();
    expect(screen.getByText("Memory usage")).toBeInTheDocument();
    expect(screen.getByText("Disk usage")).toBeInTheDocument();
    expect(screen.getByText("System uptime")).toBeInTheDocument();
    expect(screen.getByText("Database")).toBeInTheDocument();
    expect(screen.getByText("connected")).toBeInTheDocument();
  });

  it("gives Sales accounts the three read-only system tools", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      ...user,
      id: "sales",
      username: "sales",
      full_name: "Sales User",
      roles: ["sales_user"],
      permissions: ["settings.view", "data_sync.view", "system_metrics.view"],
      is_superadmin: false,
    });

    render(<LanguageProvider><SettingsShell view="general" /></LanguageProvider>);

    expect(await screen.findByText("SYSTEM TOOLS")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "General Settings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Data Synchronization" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "System Health" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "ERP Database" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Backup Management" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Catalogues" })).toHaveAttribute("href", "/dashboard?view=catalogues");
  });

  it("loads both backup histories and requests a real application backup", async () => {
    render(<SettingsShell view="backups" />);
    const buttons = await screen.findAllByRole("button", { name: "Create Backup Now" });
    fireEvent.change(screen.getAllByPlaceholderText("Optional backup description")[1], { target: { value: "Presentation backup" } });
    fireEvent.click(buttons[1]);
    await waitFor(() => expect(mocks.createBackup).toHaveBeenCalledWith("application", "Presentation backup", ["source", "uploads", "static", "config_templates", "migrations"]));
    expect(mocks.getBackups).toHaveBeenCalledWith("database");
    expect(mocks.getBackups).toHaveBeenCalledWith("application");
    expect(screen.getByText(/Restore is disabled/)).toBeInTheDocument();
  });
});
