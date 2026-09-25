import type { ReactNode } from "react";
import type { AuthenticatedUser } from "./api";
import type { DashboardView } from "./routes";

const ALIASES: Record<string, string> = {
  "overview.view": "dashboard.view",
  "catalogue.view": "products.view",
  "catalogue.edit": "products.edit",
  "catalogue.approve": "catalogues.approve",
  "catalogue.publish": "catalogues.publish",
  "audit.view": "audit_logs.view",
  "products.prices.view": "prices.view",
  "products.prices.propose": "prices.propose",
  "products.prices.edit": "prices.edit",
  "products.prices.approve": "prices.approve",
  "organization.manage": "departments.manage",
  "users.manage": "users.view",
};

export type NavigationAccessItem = readonly [
  DashboardView,
  string,
  string,
  readonly string[],
];

export const ACCOUNT_ROLES = {
  superAdmin: "superadmin",
  salesAdmin: "sales_manager",
  sales: "sales_user",
  customer: "customer_user",
} as const;

export function normalizedRole(role: string) {
  return role.trim().toLocaleLowerCase().replaceAll(" ", "_");
}

export function hasRole(
  user: AuthenticatedUser | null | undefined,
  ...roles: string[]
) {
  if (!user) return false;
  const expected = new Set(roles.map(normalizedRole));
  return user.roles.some((role) => expected.has(normalizedRole(role)));
}

export function isSalesUser(user: AuthenticatedUser | null | undefined) {
  return hasRole(user, ACCOUNT_ROLES.sales);
}

export function isCustomerUser(user: AuthenticatedUser | null | undefined) {
  return hasRole(user, ACCOUNT_ROLES.customer);
}

export function isCataloguePortalUser(
  user: AuthenticatedUser | null | undefined,
) {
  return isSalesUser(user) || isCustomerUser(user);
}

export function isSalesAdmin(user: AuthenticatedUser | null | undefined) {
  return hasRole(user, ACCOUNT_ROLES.salesAdmin);
}

export function isPlatformAdmin(user: AuthenticatedUser | null | undefined) {
  return Boolean(user?.is_superadmin) || hasRole(user, ACCOUNT_ROLES.salesAdmin);
}

export function accountTypeLabel(user: Pick<AuthenticatedUser, "roles"> & { is_superadmin?: boolean }) {
  if (user.is_superadmin || user.roles.some((role) => normalizedRole(role) === ACCOUNT_ROLES.superAdmin)) return "SuperAdmin";
  if (user.roles.some((role) => normalizedRole(role) === ACCOUNT_ROLES.salesAdmin)) return "Sales Admin";
  if (user.roles.some((role) => normalizedRole(role) === ACCOUNT_ROLES.customer)) return "Customer";
  return "Sales";
}

export const NAVIGATION_ACCESS: readonly NavigationAccessItem[] = [
  ["overview", "OV", "Overview", ["dashboard.view"]],
  ["products", "PR", "Products", ["products.view"]],
  ["categories", "CA", "Categories", ["categories.view"]],
  ["catalogues", "CM", "Catalogues", ["catalogues.view"]],
  ["pricing", "PM", "Prices", ["prices.view"]],
  ["organization", "OR", "Organization", ["departments.view", "departments.manage", "positions.view", "positions.manage", "teams.view", "teams.create", "teams.edit"]],
  ["users", "US", "Users", ["users.view"]],
] as const;

export function canonicalPermission(permission: string) {
  return ALIASES[permission] ?? permission;
}

export function isSuperAdmin(user: AuthenticatedUser | null | undefined) {
  return Boolean(user?.is_superadmin);
}

export function canAccess(
  user: AuthenticatedUser | null | undefined,
  permission: string,
) {
  if (!user) return false;
  const requested = canonicalPermission(permission);
  if (["catalogues.view", "catalogues.preview"].includes(requested)) return true;
  if (isSuperAdmin(user)) return true;
  if (isSalesAdmin(user)) {
    const permissionModule = requested.split(".", 1)[0];
    if (["users", "departments", "positions", "teams", "roles", "permissions", "organization"].includes(permissionModule)) {
      return false;
    }
    return true;
  }
  return user.permissions.some(
    (granted) => canonicalPermission(granted) === requested,
  );
}

export function canAccessAny(
  user: AuthenticatedUser | null | undefined,
  permissions: readonly string[],
) {
  return permissions.some((permission) => canAccess(user, permission));
}

export function allowedNavigation(user: AuthenticatedUser | null | undefined) {
  return NAVIGATION_ACCESS.filter(([view, , , permissions]) =>
    !(isSalesAdmin(user) && ["organization", "users"].includes(view)) &&
    canAccessAny(user, permissions),
  ).map(([view, icon, label]) => [view, icon, label] as const);
}

export function PermissionGate({
  user,
  permission,
  children,
  fallback = null,
}: {
  user: AuthenticatedUser | null | undefined;
  permission: string | readonly string[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const allowed = Array.isArray(permission)
    ? canAccessAny(user, permission)
    : canAccess(user, permission as string);
  return allowed ? children : fallback;
}
