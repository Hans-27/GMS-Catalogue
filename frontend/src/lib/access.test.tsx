import { describe, expect, it } from "vitest";
import type { AuthenticatedUser } from "./api";
import { accountTypeLabel, allowedNavigation, canAccess, isCataloguePortalUser, isSuperAdmin } from "./access";

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user-1",
    username: "user",
    email: "user@example.com",
    full_name: "User",
    roles: [],
    permissions: [],
    is_superadmin: false,
    ...overrides,
  };
}

describe("central access gates", () => {
  it("uses the protected backend flag instead of a mutable role name", () => {
    expect(isSuperAdmin(user({ roles: ["superadmin"] }))).toBe(false);
    expect(canAccess(user({ roles: ["superadmin"] }), "permissions.manage")).toBe(false);
    expect(canAccess(user({ is_superadmin: true }), "permissions.manage")).toBe(true);
  });

  it("keeps Sales Admin operational access while blocking People & Access", () => {
    const salesAdmin = user({ roles: ["sales_manager"] });
    expect(canAccess(salesAdmin, "users.create")).toBe(false);
    expect(canAccess(salesAdmin, "departments.view")).toBe(false);
    expect(canAccess(salesAdmin, "positions.manage")).toBe(false);
    expect(canAccess(salesAdmin, "teams.view")).toBe(false);
    expect(canAccess(salesAdmin, "roles.view")).toBe(false);
    expect(canAccess(salesAdmin, "permissions.manage")).toBe(false);
    expect(canAccess(salesAdmin, "brands.view")).toBe(true);
    expect(canAccess(salesAdmin, "settings.manage")).toBe(true);
    expect(allowedNavigation(salesAdmin).map(([view]) => view)).not.toContain("organization");
    expect(allowedNavigation(salesAdmin).map(([view]) => view)).not.toContain("users");
  });

  it("canonicalizes legacy permissions without widening unrelated access", () => {
    const editor = user({ permissions: ["catalogue.view"] });
    expect(canAccess(editor, "products.view")).toBe(true);
    expect(canAccess(editor, "products.edit")).toBe(false);
  });

  it("shows published catalogues to every signed-in user without widening editing", () => {
    const viewer = user({ permissions: ["catalogues.view"] });
    expect(allowedNavigation(viewer).map(([view]) => view)).toEqual(["catalogues"]);
    expect(allowedNavigation(user()).map(([view]) => view)).toEqual(["catalogues"]);
    expect(canAccess(user(), "catalogues.preview")).toBe(true);
    expect(canAccess(user(), "catalogues.edit")).toBe(false);
  });

  it("recognizes Customer as a catalogue-only portal account", () => {
    const customer = user({
      roles: ["customer_user"],
      permissions: ["catalogues.view", "catalogues.preview"],
    });

    expect(accountTypeLabel(customer)).toBe("Customer");
    expect(isCataloguePortalUser(customer)).toBe(true);
    expect(allowedNavigation(customer).map(([view]) => view)).toEqual(["catalogues"]);
    expect(canAccess(customer, "catalogue_share_links.copy")).toBe(false);
  });
});
