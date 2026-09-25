import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import type { AuthenticatedUser } from "@/lib/api";
import { UserManagement } from "./user-management";

const mocks = vi.hoisted(() => ({
  getManagedUsers: vi.fn(),
  getManagedUserAccess: vi.fn(),
  getOrganizationPermissions: vi.fn(),
  getDepartments: vi.fn(),
  getPositions: vi.fn(),
  getTeams: vi.fn(),
  createManagedUser: vi.fn(),
  updateManagedUser: vi.fn(),
  resetManagedUserPassword: vi.fn(),
  unlockManagedUser: vi.fn(),
  updateManagedUserAccess: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  ...mocks,
}));

const currentUser = {
  id: "admin-1",
  username: "admin",
  email: "admin@example.com",
  full_name: "Catalogue Admin",
  roles: ["catalogue_admin"],
  permissions: ["users.view", "users.edit"],
  effective_permissions: ["users.view", "users.edit"],
  is_superadmin: false,
} as AuthenticatedUser;

const managedUser = {
  id: "user-1",
  username: "staff",
  email: "staff@example.com",
  full_name: "Staff User",
  is_active: true,
  roles: ["system_user"],
  department_id: null,
  department_name: null,
  position_id: null,
  position_name: null,
  employee_code: null,
  team_ids: [],
  team_names: [],
  brand_names: [],
  failed_login_attempts: 0,
  locked_until: null,
  last_login_at: null,
  created_at: "2026-08-04T00:00:00Z",
};

describe("user password visibility", () => {
  beforeEach(() => {
    mocks.getManagedUsers.mockResolvedValue([managedUser]);
    mocks.getDepartments.mockResolvedValue([]);
    mocks.getPositions.mockResolvedValue([]);
    mocks.getTeams.mockResolvedValue([]);
    mocks.getOrganizationPermissions.mockResolvedValue([
      { id: 1, code: "products.view", module: "products", description: "View products", role_names: ["system_user"] },
      { id: 2, code: "products.create", module: "products", description: "Create products", role_names: [] },
    ]);
    const access = {
      user_id: "user-1",
      username: "staff",
      full_name: "Staff User",
      is_super_admin: false,
      permissions_version: 1,
      direct_role_ids: [3],
      inherited_roles: [],
      overrides: [],
      data_scope: { all_access: false, own_department: false, own_records: false, published_only: true },
      brand_ids: [],
      category_ids: [],
      product_ids: [],
      catalogue_ids: [],
      price_list_ids: [],
      effective_permissions: [{ key: "products.view", scopes: ["all"], sources: ["role:SALES"] }],
      visible_modules: ["products"],
      restricted_fields: [],
    };
    mocks.getManagedUserAccess.mockResolvedValue(access);
    mocks.updateManagedUserAccess.mockResolvedValue(access);
  });

  it("shows and hides the replacement password from the eye button", async () => {
    render(
      <LanguageProvider>
        <UserManagement currentUser={currentUser} onToast={vi.fn()} />
      </LanguageProvider>,
    );

    const password = await screen.findByPlaceholderText("Enter a strong replacement password");
    expect(password).toHaveAttribute("type", "password");

    const show = screen.getByRole("button", { name: "Show password" });
    expect(show).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(show);
    expect(password).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password).toHaveAttribute("type", "password");
  });

  it("opens a clean create-user form from the New user button", async () => {
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => undefined);

    render(
      <LanguageProvider>
        <UserManagement currentUser={currentUser} onToast={vi.fn()} />
      </LanguageProvider>,
    );

    await screen.findByRole("heading", { name: "Staff User" });
    fireEvent.click(screen.getByRole("button", { name: "+ New user" }));

    expect(screen.getByRole("heading", { name: "Create platform user" })).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toHaveValue("");
    expect(screen.queryByLabelText("Username")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create user" })).toBeEnabled();
    const customerOption = screen.getByRole("option", { name: "Customer — view published catalogues" });
    expect(customerOption).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Account type"), {
      target: { value: "customer_user" },
    });
    expect(screen.getByText(/Customer pricing remains controlled by the secure link/)).toBeInTheDocument();
    expect(screen.queryByText("Organization assignment")).not.toBeInTheDocument();
  });

  it("shows and hides the temporary password when creating a user", async () => {
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => undefined);

    render(
      <LanguageProvider>
        <UserManagement currentUser={currentUser} onToast={vi.fn()} />
      </LanguageProvider>,
    );

    await screen.findByRole("heading", { name: "Staff User" });
    fireEvent.click(screen.getByRole("button", { name: "+ New user" }));

    const password = screen.getByLabelText("Temporary password");
    expect(password).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password).toHaveAttribute("type", "password");
  });

  it("opens the user directory with an empty non-autofill search", async () => {
    render(
      <LanguageProvider>
        <UserManagement currentUser={currentUser} onToast={vi.fn()} />
      </LanguageProvider>,
    );

    const search = await screen.findByRole("searchbox", { name: "Search users" });
    expect(search).toHaveValue("");
    expect(search).toHaveAttribute("autocomplete", "one-time-code");
    expect(search).toHaveAttribute("readonly");
    fireEvent.focus(search);
    expect(search).not.toHaveAttribute("readonly");
    expect(screen.getByText("staff@example.com", { exact: false })).toBeInTheDocument();
  });

  it("lets SuperAdmin save manual permission toggles for a user", async () => {
    const superAdmin = {
      ...currentUser,
      id: "super-1",
      roles: ["superadmin"],
      is_superadmin: true,
    } as AuthenticatedUser;
    render(
      <LanguageProvider>
        <UserManagement currentUser={superAdmin} onToast={vi.fn()} />
      </LanguageProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Manual permissions" })).toBeInTheDocument();
    const customize = screen.getByRole("switch", { name: "Customize permissions for this user" });
    expect(customize).not.toBeChecked();
    fireEvent.click(customize);

    expect(screen.getByRole("switch", { name: "products.view permission" })).toBeChecked();
    const createProducts = screen.getByRole("switch", { name: "products.create permission" });
    expect(createProducts).not.toBeChecked();
    fireEvent.click(createProducts);
    fireEvent.click(screen.getByRole("button", { name: "Save permissions" }));

    await waitFor(() => expect(mocks.updateManagedUserAccess).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        overrides: [expect.objectContaining({ permission_id: 2, effect: "allow", access_scope: "all" })],
      }),
    ));
  });
});
