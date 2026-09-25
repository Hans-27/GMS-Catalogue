"use client";
import { T, useLanguage } from "@/lib/i18n";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ACCOUNT_ROLES,
  canonicalPermission,
  isSuperAdmin,
  normalizedRole,
} from "@/lib/access";
import {
  ApiError,
  createManagedUser,
  getDepartments,
  getManagedUserAccess,
  getManagedUsers,
  getOrganizationPermissions,
  getPositions,
  getTeams,
  resetManagedUserPassword,
  unlockManagedUser,
  updateManagedUser,
  updateManagedUserAccess,
  type AuthenticatedUser,
  type Department,
  type ManagedUserAccess,
  type ManagedUser,
  type OrganizationPermission,
  type Position,
  type Team,
  type UserPermissionOverride,
} from "@/lib/api";
import styles from "./dashboard.module.css";
import { formatApiDate } from "@/lib/date-time";


type UserDraft = {
  full_name: string;
  email: string;
  password: string;
  is_active: boolean;
  role_names: string[];
  department_id: number | null;
  position_id: number | null;
  employee_code: string;
  team_ids: number[];
  primary_team_id: number | null;
};

type PermissionOverrideDraft = UserPermissionOverride;

const SALES_ADMIN_RESTRICTED_PERMISSION_AREAS = new Set([
  "users",
  "departments",
  "positions",
  "teams",
  "roles",
  "permissions",
  "organization",
]);

const EMPTY_DRAFT: UserDraft = {
  full_name: "",
  email: "",
  password: "",
  is_active: true,
  role_names: [ACCOUNT_ROLES.sales],
  department_id: null,
  position_id: null,
  employee_code: "",
  team_ids: [],
  primary_team_id: null,
};

function formatUserDate(value: string | null, locale: string, never: string) {
  if (!value) return never;
  return formatApiDate(value, locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function userInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.slice(0, 1))
    .join("")
    .toUpperCase();
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return hidden ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m3 3 18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 4.2A10.7 10.7 0 0 1 12 4c5.4 0 9 5.2 9 5.2a14 14 0 0 1-2.2 2.7M6.6 6.7A15.6 15.6 0 0 0 3 10s3.6 5.2 9 5.2c1 0 2-.2 2.8-.6" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 10s3.6-5.2 9-5.2S21 10 21 10s-3.6 5.2-9 5.2S3 10 3 10Z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}

function draftFromUser(user: ManagedUser): UserDraft {
  return {
    full_name: user.full_name,
    email: user.email,
    password: "",
    is_active: user.is_active,
    role_names: [accountRole(user.direct_roles ?? user.roles)],
    department_id: user.department_id,
    position_id: user.position_id,
    employee_code: user.employee_code ?? "",
    team_ids: user.team_ids,
    primary_team_id: user.primary_team_id ?? null,
  };
}

function accountRole(roles: string[]) {
  const normalized = roles.map(normalizedRole);
  if (normalized.includes(ACCOUNT_ROLES.superAdmin)) return ACCOUNT_ROLES.superAdmin;
  if (normalized.includes(ACCOUNT_ROLES.salesAdmin)) return ACCOUNT_ROLES.salesAdmin;
  if (normalized.includes(ACCOUNT_ROLES.customer)) return ACCOUNT_ROLES.customer;
  return ACCOUNT_ROLES.sales;
}

function roleLabel(role: string) {
  if (role === ACCOUNT_ROLES.superAdmin) return "SuperAdmin";
  if (role === ACCOUNT_ROLES.salesAdmin) return "Sales Admin";
  if (role === ACCOUNT_ROLES.customer) return "Customer";
  return "Sales";
}

function usernameFromEmail(email: string) {
  const normalized = email.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, ".");
  return normalized.replace(/^\.+|\.+$/g, "").slice(0, 80);
}

function permissionArea(module: string) {
  return module
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function UserManagement({
  currentUser,
  onToast,
}: {
  currentUser: AuthenticatedUser;
  onToast: (message: string) => void;
}) {
  const { locale, t } = useLanguage();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<UserDraft>(EMPTY_DRAFT);
  const [showTemporaryPassword, setShowTemporaryPassword] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [permissions, setPermissions] = useState<OrganizationPermission[]>([]);
  const [userAccess, setUserAccess] = useState<ManagedUserAccess | null>(null);
  const [permissionOverrides, setPermissionOverrides] = useState<PermissionOverrideDraft[]>([]);
  const [customPermissions, setCustomPermissions] = useState(false);
  const [permissionSearch, setPermissionSearch] = useState("");
  const [isPermissionLoading, setIsPermissionLoading] = useState(false);
  const [isPermissionSaving, setIsPermissionSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [searchActivated, setSearchActivated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const editorRef = useRef<HTMLElement>(null);
  const fullNameRef = useRef<HTMLInputElement>(null);

  const selectedUser = users.find((user) => user.id === selectedId) ?? null;
  const selectedAccountRole = selectedUser
    ? accountRole(selectedUser.direct_roles ?? selectedUser.roles)
    : null;
  const reservedSuperAdmin = isSuperAdmin(currentUser);
  const availablePositions = positions.filter(
    (position) =>
      !draft.department_id || position.department_id === draft.department_id,
  );
  const availableTeams = teams.filter(
    (team) =>
      draft.department_id === team.department_id &&
      (team.is_active || draft.team_ids.includes(team.id)),
  );

  const filteredUsers = useMemo(() => {
    const pattern = search.trim().toLocaleLowerCase();
    const visibleUsers = reservedSuperAdmin
      ? users
      : users.filter((user) => accountRole(user.direct_roles ?? user.roles) !== ACCOUNT_ROLES.superAdmin);
    if (!pattern) return visibleUsers;
    return visibleUsers.filter((user) =>
      [user.full_name, user.email, ...user.roles].some((value) =>
        value.toLocaleLowerCase().includes(pattern),
      ),
    );
  }, [reservedSuperAdmin, search, users]);

  const effectivePermissionCodes = useMemo(
    () => new Set(userAccess?.effective_permissions.map((item) => item.key) ?? []),
    [userAccess],
  );
  const permissionOverrideMap = useMemo(
    () => new Map(permissionOverrides.map((item) => [item.permission_id, item])),
    [permissionOverrides],
  );
  const filteredPermissionGroups = useMemo(() => {
    const pattern = permissionSearch.trim().toLocaleLowerCase();
    const grouped = new Map<string, OrganizationPermission[]>();
    for (const permission of permissions) {
      if (
        selectedAccountRole === ACCOUNT_ROLES.salesAdmin &&
        SALES_ADMIN_RESTRICTED_PERMISSION_AREAS.has(permission.code.split(".", 1)[0])
      ) continue;
      if (
        pattern &&
        ![permission.code, permission.module, permission.description].some((value) =>
          value.toLocaleLowerCase().includes(pattern),
        )
      ) continue;
      const group = grouped.get(permission.module) ?? [];
      group.push(permission);
      grouped.set(permission.module, group);
    }
    return Array.from(grouped.entries());
  }, [permissionSearch, permissions, selectedAccountRole]);

  const summary = useMemo(
    () => ({
      total: users.length,
      active: users.filter((user) => user.is_active).length,
      locked: users.filter(
        (user) => user.locked_until || user.failed_login_attempts > 0,
      ).length,
      admins: users.filter((user) =>
        user.roles.some((role) =>
          [ACCOUNT_ROLES.superAdmin, ACCOUNT_ROLES.salesAdmin].includes(normalizedRole(role) as typeof ACCOUNT_ROLES.superAdmin | typeof ACCOUNT_ROLES.salesAdmin),
        ),
      ).length,
    }),
    [users],
  );

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [userData, departmentData, positionData, teamData, permissionData] = await Promise.all([
          getManagedUsers(),
          getDepartments(),
          getPositions(),
          getTeams(),
          reservedSuperAdmin ? getOrganizationPermissions() : Promise.resolve([]),
        ]);
        if (!active) return;
        setUsers(userData);
        setDepartments(departmentData);
        setPositions(positionData);
        setTeams(teamData);
        setPermissions(permissionData);
        const firstUser = userData[0];
        setIsPermissionLoading(reservedSuperAdmin && Boolean(firstUser));
        setSelectedId(firstUser?.id ?? null);
        if (firstUser) setDraft(draftFromUser(firstUser));
      } catch (caughtError) {
        if (!active) return;
        setError(
          caughtError instanceof ApiError
            ? t(caughtError.message)
            : t("Could not load user management."),
        );
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [reservedSuperAdmin, t]);

  useEffect(() => {
    if (!reservedSuperAdmin || !selectedId || isCreating) return;
    let active = true;
    void getManagedUserAccess(selectedId)
      .then((access) => {
        if (!active) return;
        setUserAccess(access);
        setPermissionOverrides(access.overrides);
        setCustomPermissions(access.overrides.length > 0);
      })
      .catch((caughtError) => {
        if (!active) return;
        setError(
          caughtError instanceof ApiError
            ? t(caughtError.message)
            : t("Could not load manual permissions."),
        );
      })
      .finally(() => {
        if (active) setIsPermissionLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isCreating, reservedSuperAdmin, selectedId, t]);

  async function refreshUsers(preferredId?: string) {
    const userData = await getManagedUsers();
    setUsers(userData);
    if (preferredId) {
      setSelectedId(preferredId);
      const preferredUser = userData.find((user) => user.id === preferredId);
      if (preferredUser) setDraft(draftFromUser(preferredUser));
    }
  }

  function startCreating() {
    setIsCreating(true);
    setSelectedId(null);
    setDraft({ ...EMPTY_DRAFT, role_names: [...EMPTY_DRAFT.role_names] });
    setShowTemporaryPassword(false);
    setResetPassword("");
    setShowResetPassword(false);
    setPermissionSearch("");
    setUserAccess(null);
    setPermissionOverrides([]);
    setCustomPermissions(false);
    setIsPermissionLoading(false);
    setError("");
    window.requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      fullNameRef.current?.focus({ preventScroll: true });
    });
  }

  function selectUser(userId: string) {
    setIsCreating(false);
    setSelectedId(userId);
    const selected = users.find((user) => user.id === userId);
    if (selected) setDraft(draftFromUser(selected));
    setShowTemporaryPassword(false);
    setResetPassword("");
    setShowResetPassword(false);
    setPermissionSearch("");
    setUserAccess(null);
    setPermissionOverrides([]);
    setCustomPermissions(false);
    setIsPermissionLoading(reservedSuperAdmin);
    setError("");
  }

  function toggleTeam(teamId: number, checked: boolean) {
    setDraft((current) => ({
      ...current,
      team_ids: checked
        ? [...current.team_ids, teamId]
        : current.team_ids.filter((id) => id !== teamId),
      primary_team_id:
        !checked && current.primary_team_id === teamId
          ? null
          : current.primary_team_id,
    }));
  }

  function permissionEnabled(permission: OrganizationPermission) {
    const override = permissionOverrideMap.get(permission.id);
    return override
      ? override.effect === "allow"
      : effectivePermissionCodes.has(canonicalPermission(permission.code));
  }

  function togglePermission(permission: OrganizationPermission, enabled: boolean) {
    setPermissionOverrides((current) => [
      ...current.filter((item) => item.permission_id !== permission.id),
      {
        permission_id: permission.id,
        key: permission.code,
        effect: enabled ? "allow" : "deny",
        access_scope: enabled ? "all" : "none",
        reason: "Set manually in User Control.",
        expires_at: null,
      },
    ]);
  }

  async function saveManualPermissions(useAccountDefaults = false) {
    if (!selectedUser || !reservedSuperAdmin || userAccess?.is_super_admin) return;
    const useCustomOverrides = customPermissions && !useAccountDefaults;
    setIsPermissionSaving(true);
    setError("");
    try {
      const updated = await updateManagedUserAccess(selectedUser.id, {
        overrides: useCustomOverrides
          ? permissionOverrides.map(({ permission_id, effect, access_scope, reason, expires_at }) => ({
              permission_id,
              effect,
              access_scope,
              reason,
              expires_at,
            }))
          : [],
        reason: useCustomOverrides
          ? "Manual permissions updated in User Control."
          : "Manual permissions reset to account defaults.",
      });
      setUserAccess(updated);
      setPermissionOverrides(updated.overrides);
      setCustomPermissions(updated.overrides.length > 0);
      onToast(
        useCustomOverrides
          ? t("Manual permissions saved for {{username}}.", { username: selectedUser.username })
          : t("{{username}} now uses account default permissions.", { username: selectedUser.username }),
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not save manual permissions."),
      );
    } finally {
      setIsPermissionSaving(false);
    }
  }

  async function saveUser(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      if (isCreating) {
        const created = await createManagedUser({
          full_name: draft.full_name,
          username: usernameFromEmail(draft.email),
          email: draft.email,
          password: draft.password,
          role_names: draft.role_names,
          department_id: draft.department_id,
          position_id: draft.position_id,
          employee_code: draft.employee_code || null,
          team_ids: draft.team_ids,
          primary_team_id: draft.primary_team_id,
        });
        await refreshUsers(created.id);
        setIsCreating(false);
        onToast(t("User {{username}} created.", { username: created.username }));
      } else if (selectedUser) {
        const updated = await updateManagedUser(selectedUser.id, {
          full_name: draft.full_name,
          email: draft.email,
          is_active: draft.is_active,
          role_names: draft.role_names,
          department_id: draft.department_id,
          position_id: draft.position_id,
          employee_code: draft.employee_code || null,
          team_ids: draft.team_ids,
          primary_team_id: draft.primary_team_id,
        });
        await refreshUsers(updated.id);
        onToast(t("User {{username}} updated.", { username: updated.username }));
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not save the user."),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePasswordReset() {
    if (!selectedUser) return;
    setIsSaving(true);
    setError("");
    try {
      const updated = await resetManagedUserPassword(
        selectedUser.id,
        resetPassword,
      );
      setResetPassword("");
      setShowResetPassword(false);
      await refreshUsers(updated.id);
      onToast(t("Password reset for {{username}}.", { username: updated.username }));
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not reset the password."),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUnlock() {
    if (!selectedUser) return;
    setIsSaving(true);
    setError("");
    try {
      const updated = await unlockManagedUser(selectedUser.id);
      await refreshUsers(updated.id);
      onToast(t("Account {{username}} unlocked.", { username: updated.username }));
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not unlock the user."),
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className={styles.userLoading}><T>Loading user accounts...</T></div>;
  }

  return (
    <>
      <section className={styles.userMetricGrid}>
        <article>
          <span><T>Total accounts</T></span>
          <strong>{summary.total}</strong>
          <small><T>Registered users</T></small>
        </article>
        <article>
          <span><T>Active</T></span>
          <strong>{summary.active}</strong>
          <small><T>Can access the platform</T></small>
        </article>
        <article>
          <span><T>Administrators</T></span>
          <strong>{summary.admins}</strong>
          <small><T>User-control access</T></small>
        </article>
        <article>
          <span><T>Needs attention</T></span>
          <strong>{summary.locked}</strong>
          <small><T>Failed or locked logins</T></small>
        </article>
      </section>

      {error && (
        <div className={styles.userError} role="alert">
          <span>!</span>
          {error}
          <button type="button" onClick={() => setError("")}>
            <T>Dismiss</T>
          </button>
        </div>
      )}

      <div className={styles.userControlLayout}>
        <section className={styles.userListPanel}>
          <div className={styles.userListHeader}>
            <div>
              <span><T>Account directory</T></span>
              <h2><T>Platform users</T></h2>
            </div>
            <button type="button" onClick={startCreating}>
              <T>+ New user</T>
            </button>
          </div>
          <label className={styles.userSearch}>
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              name="user-directory-filter"
              autoComplete="one-time-code"
              data-1p-ignore="true"
              data-lpignore="true"
              data-bwignore="true"
              readOnly={!searchActivated}
              onFocus={() => setSearchActivated(true)}
              aria-label={t("Search users")}
              placeholder={t("Search name, email or role")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className={styles.userList}>
            {filteredUsers.map((user) => (
              <button
                key={user.id}
                className={
                  selectedId === user.id && !isCreating
                    ? styles.selectedUser
                    : ""
                }
                type="button"
                onClick={() => selectUser(user.id)}
              >
                <span className={styles.userAvatar}>
                  {userInitials(user.full_name)}
                </span>
                <span>
                  <strong>{user.full_name}</strong>
                  <small>
                    {user.email} · {roleLabel(accountRole(user.direct_roles ?? user.roles))}
                  </small>
                </span>
                <i
                  className={
                    user.is_active ? styles.activeDot : styles.inactiveDot
                  }
                  title={t(user.is_active ? "Active" : "Inactive")}
                />
              </button>
            ))}
            {!filteredUsers.length && (
              <div className={styles.emptyState}><T>No matching users.</T></div>
            )}
          </div>
        </section>

        <section className={styles.userEditorPanel} ref={editorRef}>
          <div className={styles.userEditorHeader}>
            <div>
              <span>{t(isCreating ? "New account" : "Account control")}</span>
              <h2>
                {isCreating
                  ? t("Create platform user")
                  : selectedUser?.full_name || t("Select a user")}
              </h2>
            </div>
            {selectedUser && !isCreating && (
              <span
                className={
                  selectedUser.is_active
                    ? styles.activePill
                    : styles.inactivePill
                }
              >
                {t(selectedUser.is_active ? "Active" : "Inactive")}
              </span>
            )}
          </div>

          {(isCreating || selectedUser) && (
            <form onSubmit={saveUser}>
              <label className={styles.inputGroup}>
                <span><T>Full name</T></span>
                <input
                  ref={fullNameRef}
                  value={draft.full_name}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      full_name: event.target.value,
                    }))
                  }
                  minLength={2}
                  maxLength={160}
                  required
                />
              </label>
              <label className={styles.inputGroup}>
                <span><T>Email address</T></span>
                <input
                  type="email"
                  value={draft.email}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label className={styles.inputGroup}>
                <span><T>Account type</T></span>
                <select
                  aria-label={t("Account type")}
                  value={draft.role_names[0] ?? ACCOUNT_ROLES.sales}
                  disabled={!isCreating && draft.role_names[0] === ACCOUNT_ROLES.superAdmin}
                  onChange={(event) => {
                    const role = event.target.value;
                    setDraft((current) => ({
                      ...current,
                      role_names: [role],
                      ...(role === ACCOUNT_ROLES.customer
                        ? {
                            department_id: null,
                            position_id: null,
                            employee_code: "",
                            team_ids: [],
                            primary_team_id: null,
                          }
                        : {}),
                    }));
                  }}
                >
                  {!isCreating && draft.role_names[0] === ACCOUNT_ROLES.superAdmin && (
                    <option value={ACCOUNT_ROLES.superAdmin}>SuperAdmin</option>
                  )}
                  <option value={ACCOUNT_ROLES.salesAdmin}>Sales Admin — operational access</option>
                  <option value={ACCOUNT_ROLES.sales}>Sales — view catalogues and copy links</option>
                  <option value={ACCOUNT_ROLES.customer}>Customer — view published catalogues</option>
                </select>
                <em>
                  {draft.role_names[0] === ACCOUNT_ROLES.salesAdmin
                    ? "Can manage platform operations, but not People & Access."
                    : draft.role_names[0] === ACCOUNT_ROLES.superAdmin
                      ? "Protected primary administrator account."
                      : draft.role_names[0] === ACCOUNT_ROLES.customer
                        ? "Can only open published catalogues. Customer pricing remains controlled by the secure link used to open a catalogue."
                      : "Can only view catalogues and copy their links."}
                </em>
              </label>
              {isCreating && (
                <label className={styles.inputGroup}>
                  <span><T>Temporary password</T></span>
                  <div className={styles.userPasswordField}>
                    <input
                      type={showTemporaryPassword ? "text" : "password"}
                      aria-label={t("Temporary password")}
                      autoComplete="new-password"
                      value={draft.password}
                      onChange={(event) => setDraft((current) => ({
                        ...current,
                        password: event.target.value,
                      }))}
                      minLength={12}
                      required
                    />
                    <button
                      type="button"
                      aria-label={t(showTemporaryPassword ? "Hide password" : "Show password")}
                      aria-pressed={showTemporaryPassword}
                      onClick={() => setShowTemporaryPassword((current) => !current)}
                    >
                      <EyeIcon hidden={showTemporaryPassword} />
                    </button>
                  </div>
                  <em><T>At least 12 characters with uppercase, lowercase, number and symbol.</T></em>
                </label>
              )}
              {draft.role_names[0] !== ACCOUNT_ROLES.customer && <details
                className={styles.userOptionalDetails}
              >
                <summary>
                  <span><T>Organization assignment</T></span>
                  <small><T>Optional department, position and team details</T></small>
                </summary>
              <div className={styles.userFormGrid}>
                <label className={styles.inputGroup}>
                  <span><T>Department</T></span>
                  <select
                    value={draft.department_id ?? ""}
                    onChange={(event) => {
                      const departmentId = event.target.value
                        ? Number(event.target.value)
                        : null;
                      if (
                        (draft.position_id || draft.team_ids.length) &&
                        !window.confirm(
                          t("Changing department removes incompatible position and team assignments. Continue?"),
                        )
                      ) return;
                      setDraft((current) => ({
                        ...current,
                        department_id: departmentId,
                        position_id: null,
                        team_ids: [],
                        primary_team_id: null,
                      }));
                    }}
                  >
                    <option value=""><T>Not assigned</T></option>
                    {departments
                      .filter((department) => department.is_active)
                      .map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className={styles.inputGroup}>
                  <span><T>Position</T></span>
                  <select
                    value={draft.position_id ?? ""}
                    disabled={!draft.department_id}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        position_id: event.target.value
                          ? Number(event.target.value)
                          : null,
                      }))
                    }
                  >
                    <option value=""><T>Not assigned</T></option>
                    {availablePositions
                      .filter((position) => position.is_active)
                      .map((position) => (
                        <option key={position.id} value={position.id}>
                          {position.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <label className={styles.inputGroup}>
                <span><T>Employee code</T></span>
                <input
                  value={draft.employee_code}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      employee_code: event.target.value,
                    }))
                  }
                  maxLength={50}
                  placeholder={t("Optional internal employee ID")}
                />
              </label>
              <fieldset className={styles.roleSelector}>
                <legend><T>Team and brand scope</T></legend>
                {!draft.department_id ? (
                  <p className={styles.fieldHint}><T>Select a department before assigning teams.</T></p>
                ) : availableTeams.length ? (
                  availableTeams.map((team) => (
                    <label key={team.id}>
                      <input
                        type="checkbox"
                        checked={draft.team_ids.includes(team.id)}
                        onChange={(event) =>
                          toggleTeam(team.id, event.target.checked)
                        }
                      />
                      <span>
                        <strong>{team.name}</strong>
                        <small>
                          {team.department_name} ·{" "}
                          {team.brand_names.length
                            ? t("Brands: {{brands}}", { brands: team.brand_names.join(", ") })
                            : t("No brands assigned")}
                        </small>
                      </span>
                    </label>
                  ))
                ) : (
                  <p className={styles.fieldHint}>
                    <T>Create teams in Organization, then assign them here.</T>
                  </p>
                )}
              </fieldset>

              <label className={styles.inputGroup}>
                <span><T>Primary team</T></span>
                <select
                  value={draft.primary_team_id ?? ""}
                  disabled={!draft.department_id || !draft.team_ids.length}
                  onChange={(event) => setDraft((current) => ({ ...current, primary_team_id: event.target.value ? Number(event.target.value) : null }))}
                >
                  <option value=""><T>Not assigned</T></option>
                  {availableTeams.filter((team) => draft.team_ids.includes(team.id)).map((team) => (
                    <option key={team.id} value={team.id}>{team.name}</option>
                  ))}
                </select>
              </label>
              </details>}

              {!isCreating && selectedUser && (
                <label className={styles.accountStatusToggle}>
                  <span>
                    <strong><T>Account active</T></strong>
                    <small>
                      <T>Inactive accounts cannot sign in or use existing sessions.</T>
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={draft.is_active}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        is_active: event.target.checked,
                      }))
                    }
                  />
                </label>
              )}

              {!isCreating && selectedUser && (
                <div className={styles.userFacts}>
                  <div>
                    <span><T>Created</T></span>
                    <strong>{formatUserDate(selectedUser.created_at, locale, t("Never"))}</strong>
                  </div>
                  <div>
                    <span><T>Last login</T></span>
                    <strong>{formatUserDate(selectedUser.last_login_at, locale, t("Never"))}</strong>
                  </div>
                  <div>
                    <span><T>Failed attempts</T></span>
                    <strong>{selectedUser.failed_login_attempts}</strong>
                  </div>
                </div>
              )}

              <button
                className={styles.primaryButton}
                type="submit"
                disabled={isSaving}
              >
                {t(isSaving ? "Saving..." : isCreating ? "Create user" : "Save account")}
              </button>
            </form>
          )}

          {!isCreating && selectedUser && reservedSuperAdmin && (
            <section className={styles.manualPermissionPanel} aria-labelledby="manual-permissions-heading">
              <div className={styles.manualPermissionHeader}>
                <div>
                  <span><T>Access control</T></span>
                  <h3 id="manual-permissions-heading"><T>Manual permissions</T></h3>
                  <p><T>Keep the account defaults, or make exceptions for this user only.</T></p>
                </div>
                {!userAccess?.is_super_admin && (
                  <label className={styles.manualPermissionMaster}>
                    <span>
                      <strong><T>Customize</T></strong>
                      <small><T>Override account defaults</T></small>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label={t("Customize permissions for this user")}
                      checked={customPermissions}
                      disabled={isPermissionLoading || isPermissionSaving}
                      onChange={(event) => setCustomPermissions(event.target.checked)}
                    />
                  </label>
                )}
              </div>

              {isPermissionLoading ? (
                <p className={styles.permissionState}><T>Loading permissions...</T></p>
              ) : userAccess?.is_super_admin ? (
                <p className={styles.permissionState}>
                  <T>SuperAdmin always has full platform access. Manual permission changes are not required.</T>
                </p>
              ) : customPermissions ? (
                <>
                  <div className={styles.permissionToolbar}>
                    <label>
                      <span aria-hidden="true">⌕</span>
                      <input
                        type="search"
                        aria-label={t("Search permissions")}
                        placeholder={t("Search permissions")}
                        value={permissionSearch}
                        onChange={(event) => setPermissionSearch(event.target.value)}
                      />
                    </label>
                    <span>
                      {permissionOverrides.length} <T>manual changes</T>
                    </span>
                  </div>
                  <div className={styles.permissionGroups}>
                    {filteredPermissionGroups.map(([module, modulePermissions]) => (
                      <section key={module}>
                        <h4>{permissionArea(module)}</h4>
                        <div>
                          {modulePermissions.map((permission) => {
                            const override = permissionOverrideMap.get(permission.id);
                            return (
                              <label className={styles.permissionToggleRow} key={permission.id}>
                                <span>
                                  <strong>{permission.description}</strong>
                                  <small>{permission.code}</small>
                                </span>
                                <em data-effect={override?.effect || "default"}>
                                  {override?.effect === "allow"
                                    ? t("Allowed manually")
                                    : override?.effect === "deny"
                                      ? t("Blocked manually")
                                      : t("Account default")}
                                </em>
                                <input
                                  type="checkbox"
                                  role="switch"
                                  aria-label={t("{{permission}} permission", { permission: permission.code })}
                                  checked={permissionEnabled(permission)}
                                  disabled={isPermissionSaving}
                                  onChange={(event) => togglePermission(permission, event.target.checked)}
                                />
                              </label>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                    {!filteredPermissionGroups.length && (
                      <p className={styles.permissionState}><T>No matching permissions.</T></p>
                    )}
                  </div>
                </>
              ) : (
                <p className={styles.permissionState}>
                  <T>This user currently follows the selected account type. Turn on Customize only when an exception is needed.</T>
                </p>
              )}

              {!isPermissionLoading && !userAccess?.is_super_admin && (
                <div className={styles.manualPermissionActions}>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    disabled={isPermissionSaving}
                    onClick={() => void saveManualPermissions(true)}
                  >
                    <T>Use account defaults</T>
                  </button>
                  <button
                    className={styles.primaryButton}
                    type="button"
                    disabled={isPermissionSaving}
                    onClick={() => void saveManualPermissions()}
                  >
                    {t(isPermissionSaving ? "Saving..." : "Save permissions")}
                  </button>
                </div>
              )}
            </section>
          )}

          {!isCreating && selectedUser && (
            <div className={styles.securityTools}>
              <div>
                <span><T>Security tools</T></span>
                <h3><T>Password and lockout</T></h3>
              </div>
              <label className={styles.inputGroup}>
                <span><T>New password</T></span>
                <div className={styles.userPasswordField}>
                  <input
                    type={showResetPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder={t("Enter a strong replacement password")}
                    value={resetPassword}
                    onChange={(event) => setResetPassword(event.target.value)}
                    minLength={12}
                  />
                  <button
                    type="button"
                    aria-label={t(showResetPassword ? "Hide password" : "Show password")}
                    aria-pressed={showResetPassword}
                    onClick={() => setShowResetPassword((current) => !current)}
                  >
                    <EyeIcon hidden={showResetPassword} />
                  </button>
                </div>
              </label>
              <div>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={handlePasswordReset}
                  disabled={isSaving || resetPassword.length < 12}
                >
                  <T>Reset password</T>
                </button>
                {(selectedUser.locked_until ||
                  selectedUser.failed_login_attempts > 0) && (
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={handleUnlock}
                    disabled={isSaving}
                  >
                    <T>Clear lockout</T>
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
