"use client";
import { T, useLanguage } from "@/lib/i18n";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  deleteAdminPosition,
  deleteAdminTeam,
  duplicateAdminPosition,
  duplicateAdminTeam,
  getAdminPositions,
  getAdminTeamMembers,
  getAdminTeams,
  getBrands,
  getCurrentUser,
  getDepartments,
  getManagedUsers,
  saveAdminPosition,
  saveAdminTeam,
  saveAdminTeamMembers,
  saveDepartment,
  setAdminPositionActive,
  setAdminTeamActive,
  type AdminPosition,
  type AdminPositionPayload,
  type AdminTeam,
  type AdminTeamPayload,
  type AuthenticatedUser,
  type Brand,
  type Department,
  type ManagedUser,
} from "@/lib/api";
import { canAccess, canAccessAny } from "@/lib/access";
import { AccessDenied, AdminPageFrame } from "./admin-page-frame";
import styles from "./admin-management.module.css";

type Kind = "departments" | "positions" | "teams";
const POSITION_EMPTY: AdminPositionPayload = {
  code: "",
  name_en: "",
  name_th: "",
  description: "",
  department_id: 0,
  default_team_id: null,
  reports_to_position_id: null,
  management_level: "staff",
  default_role_ids: [],
  is_active: true,
  display_order: 0,
};
const TEAM_EMPTY: AdminTeamPayload = {
  code: "",
  name_en: "",
  name_th: "",
  description: "",
  department_id: 0,
  team_leader_user_id: null,
  parent_team_id: null,
  default_position_ids: [],
  default_role_ids: [],
  brand_ids: [],
  is_active: true,
  display_order: 0,
  allow_cross_department_leader: false,
};

export function OrganizationEntityManagement({ kind }: { kind: Kind }) {
  const { t } = useLanguage();
  const kindLabel = t(
    kind === "departments"
      ? "Departments"
      : kind === "positions"
        ? "Positions"
        : "Teams",
  );
  const entityLabel = t(
    kind === "departments"
      ? "Department"
      : kind === "positions"
        ? "Position"
        : "Team",
  );
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<AdminPosition[]>([]);
  const [teams, setTeams] = useState<AdminTeam[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [positionDraft, setPositionDraft] = useState(POSITION_EMPTY);
  const [teamDraft, setTeamDraft] = useState(TEAM_EMPTY);
  const [departmentDraft, setDepartmentDraft] = useState({
    name: "",
    code: "",
    description: "",
    parent_id: null as number | null,
    is_active: true,
  });
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [primaryMemberIds, setPrimaryMemberIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const viewPermission =
    kind === "teams"
      ? "teams.view"
      : kind === "positions"
        ? "positions.view"
        : "departments.view";
  const createPermission =
    kind === "teams"
      ? "teams.create"
      : kind === "positions"
        ? "positions.create"
        : "departments.manage";
  const editPermission =
    kind === "teams"
      ? "teams.edit"
      : kind === "positions"
        ? "positions.edit"
        : "departments.manage";

  async function load() {
    try {
      const current = await getCurrentUser();
      setUser(current);
      if (
        !canAccessAny(current, [
          viewPermission,
          kind === "positions" ? "positions.manage" : createPermission,
        ])
      )
        return;
      const [departmentData, userData, brandData] = await Promise.all(
        [
          getDepartments(),
          canAccess(current, "users.view")
            ? getManagedUsers()
            : Promise.resolve([]),
          getBrands(),
        ],
      );
      setDepartments(departmentData);
      setUsers(userData);
      setBrands(brandData);
      if (kind !== "departments") {
        const [positionPage, teamPage] = await Promise.all([
          getAdminPositions(
            kind === "positions"
              ? {
                  q: query,
                  departmentId: departmentFilter
                    ? Number(departmentFilter)
                    : undefined,
                  active: activeFilter,
                }
              : {},
          ),
          getAdminTeams(
            kind === "teams"
              ? {
                  q: query,
                  departmentId: departmentFilter
                    ? Number(departmentFilter)
                    : undefined,
                  active: activeFilter,
                }
              : {},
          ),
        ]);
        setPositions(positionPage.items);
        setTeams(teamPage.items);
      }
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t("Could not load {{entity}}.", { entity: kindLabel }),
      );
    } finally {
      setLoading(false);
    }
  }
  // The entity route controls the initial load; filters are applied explicitly.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const departmentItems = useMemo(
    () =>
      departments
        .filter(
          (item) =>
            !query ||
            `${item.name} ${item.code}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .filter(
          (item) => !activeFilter || String(item.is_active) === activeFilter,
        ),
    [activeFilter, departments, query],
  );
  function startNew() {
    setSelectedId(null);
    setPositionDraft(POSITION_EMPTY);
    setTeamDraft(TEAM_EMPTY);
    setDepartmentDraft({
      name: "",
      code: "",
      description: "",
      parent_id: null,
      is_active: true,
    });
    setMemberIds([]);
    setPrimaryMemberIds([]);
    setError("");
  }
  async function selectPosition(item: AdminPosition) {
    setSelectedId(item.id);
    setPositionDraft({
      code: item.code,
      name_en: item.name_en,
      name_th: item.name_th,
      description: item.description,
      department_id: item.department_id,
      default_team_id: item.default_team_id,
      reports_to_position_id: item.reports_to_position_id,
      management_level: item.management_level,
      default_role_ids: item.default_role_ids,
      is_active: item.is_active,
      display_order: item.display_order,
    });
  }
  async function selectTeam(item: AdminTeam) {
    setSelectedId(item.id);
    setTeamDraft({
      code: item.code,
      name_en: item.name_en,
      name_th: item.name_th,
      description: item.description,
      department_id: item.department_id,
      team_leader_user_id: item.team_leader_user_id,
      parent_team_id: item.parent_team_id,
      default_position_ids: item.default_position_ids,
      default_role_ids: item.default_role_ids,
      brand_ids: item.brand_ids,
      is_active: item.is_active,
      display_order: item.display_order,
      allow_cross_department_leader: false,
    });
    const members = await getAdminTeamMembers(item.id);
    setMemberIds(members.map((member) => member.id));
    setPrimaryMemberIds(
      users
        .filter((member) => member.primary_team_id === item.id)
        .map((member) => member.id),
    );
  }
  function selectDepartment(item: Department) {
    setSelectedId(item.id);
    setDepartmentDraft({
      name: item.name,
      code: item.code,
      description: item.description,
      parent_id: item.parent_id,
      is_active: item.is_active,
    });
  }
  function toggle(values: number[], id: number, checked: boolean) {
    return checked ? [...values, id] : values.filter((value) => value !== id);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      if (kind === "departments")
        await saveDepartment(departmentDraft, selectedId ?? undefined);
      if (kind === "positions")
        await saveAdminPosition(positionDraft, selectedId ?? undefined);
      if (kind === "teams") {
        const saved = await saveAdminTeam(teamDraft, selectedId ?? undefined);
        if (canAccess(user, "teams.assign_members"))
          await saveAdminTeamMembers(saved.id, memberIds, primaryMemberIds);
      }
      setSuccess(t("{{entity}} saved.", { entity: entityLabel }));
      startNew();
      await load();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t("Could not save this {{entity}}.", { entity: entityLabel }),
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <main className={styles.accessDenied}>
        <div>{t("Loading {{entity}}…", { entity: kindLabel })}</div>
      </main>
    );
  if (
    !user ||
    !canAccessAny(user, [
      viewPermission,
      kind === "positions" ? "positions.manage" : createPermission,
    ])
  )
    return <AccessDenied />;
  const items =
    kind === "positions"
      ? positions
      : kind === "teams"
        ? teams
        : departmentItems;
  return (
    <AdminPageFrame user={user}>
      <section className={styles.hero}>
        <div>
          <small>
            <T>ORGANIZATION</T>
          </small>
          <h1>{kindLabel}</h1>
          <p>
            {t(
              kind === "positions"
                ? "Manage job titles, reporting lines, and default teams."
                : kind === "teams"
                  ? "Manage department working groups, leaders, members, and brands."
                  : "Manage the department structure used by positions, teams, users, and access rules.",
            )}
          </p>
        </div>
        {canAccessAny(user, [
          createPermission,
          kind === "positions" ? "positions.manage" : createPermission,
        ]) && (
          <button className={styles.primary} onClick={startNew}>
            <T>+ Add</T> {entityLabel}
          </button>
        )}
      </section>
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
      {success && <div className={styles.success}>{success}</div>}
      <form
        className={styles.toolbar}
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <input
          aria-label={t("Search {{entity}}", { entity: kindLabel })}
          placeholder={t("Search {{entity}}", { entity: kindLabel })}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {kind !== "departments" && (
          <select
            value={departmentFilter}
            onChange={(event) => setDepartmentFilter(event.target.value)}
          >
            <option value="">
              <T>All departments</T>
            </option>
            {departments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        )}
        <select
          value={activeFilter}
          onChange={(event) => setActiveFilter(event.target.value)}
        >
          <option value="">
            <T>All statuses</T>
          </option>
          <option value="true">
            <T>Active</T>
          </option>
          <option value="false">
            <T>Inactive</T>
          </option>
        </select>
        <button className={styles.secondary} type="submit">
          <T>Apply filters</T>
        </button>
      </form>
      <div className={styles.layout}>
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>
                <T>DIRECTORY</T>
              </span>
              <h2>
                {items.length} <T>results</T>
              </h2>
            </div>
          </header>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{entityLabel}</th>
                  <th>
                    <T>Department</T>
                  </th>
                  <th>
                    {t(
                      kind === "positions"
                        ? "Default team"
                        : kind === "teams"
                          ? "Team leader"
                          : "Usage",
                    )}
                  </th>
                  <th>
                    <T>Users</T>
                  </th>
                  <th>
                    <T>Status</T>
                  </th>
                  <th>
                    <T>Actions</T>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((raw) => {
                  const item = raw as AdminPosition & AdminTeam & Department;
                  const name =
                    kind === "departments" ? item.name : item.name_en;
                  const department =
                    kind === "departments" ? "—" : item.department_name;
                  const context =
                    kind === "positions"
                      ? (item.default_team_name ?? "—")
                      : kind === "teams"
                        ? (item.team_leader_name ?? "—")
                        : t("{{positions}} positions · {{teams}} teams", {
                            positions: item.position_count,
                            teams: item.team_count,
                          });
                  const usersCount =
                    kind === "positions"
                      ? item.user_count
                      : kind === "teams"
                        ? item.member_count
                        : item.user_count;
                  return (
                    <tr key={item.id}>
                      <td>
                        <strong>{name}</strong>
                        <small>{item.code}</small>
                      </td>
                      <td>{department}</td>
                      <td>{context}</td>
                      <td>{usersCount}</td>
                      <td>
                        <span
                          className={styles.status}
                          data-active={item.is_active}
                        >
                          {t(item.is_active ? "Active" : "Inactive")}
                        </span>
                      </td>
                      <td>
                        <div className={styles.actions}>
                          <button
                            onClick={() =>
                              kind === "positions"
                                ? void selectPosition(item)
                                : kind === "teams"
                                  ? void selectTeam(item)
                                  : selectDepartment(item)
                            }
                          >
                            <T>View / Edit</T>
                          </button>
                          {kind !== "departments" &&
                            canAccess(user, `${kind}.duplicate`) && (
                              <button
                                onClick={async () => {
                                  if (kind === "positions")
                                    await duplicateAdminPosition(item.id);
                                  else await duplicateAdminTeam(item.id);
                                  await load();
                                }}
                              >
                                <T>Duplicate</T>
                              </button>
                            )}
                          {kind !== "departments" &&
                            canAccess(
                              user,
                              item.is_active
                                ? `${kind}.deactivate`
                                : `${kind}.activate`,
                            ) && (
                              <button
                                onClick={async () => {
                                  if (kind === "positions")
                                    await setAdminPositionActive(
                                      item.id,
                                      !item.is_active,
                                    );
                                  else
                                    await setAdminTeamActive(
                                      item.id,
                                      !item.is_active,
                                    );
                                  await load();
                                }}
                              >
                                {t(item.is_active ? "Deactivate" : "Activate")}
                              </button>
                            )}
                          {kind !== "departments" &&
                            canAccess(user, `${kind}.delete`) && (
                              <button
                                onClick={async () => {
                                  if (
                                    !confirm(
                                      t(
                                        "Delete only if this record is unused?",
                                      ),
                                    )
                                  )
                                    return;
                                  if (kind === "positions")
                                    await deleteAdminPosition(item.id);
                                  else await deleteAdminTeam(item.id);
                                  await load();
                                }}
                              >
                                <T>Delete</T>
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {items.length === 0 && (
            <div className={styles.empty}>
              {t("No {{entity}} match these filters.", {
                entity: kindLabel.toLocaleLowerCase(),
              })}
            </div>
          )}
        </section>
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>
                {t(selectedId ? "EDIT" : "CREATE")}
              </span>
              <h2>
                {t(selectedId ? "Edit {{entity}}" : "Add {{entity}}", {
                  entity: entityLabel,
                })}
              </h2>
            </div>
          </header>
          <form className={styles.form} onSubmit={save}>
            {kind === "departments" && (
              <>
                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <T>Name</T>
                    <input
                      required
                      value={departmentDraft.name}
                      onChange={(e) =>
                        setDepartmentDraft({
                          ...departmentDraft,
                          name: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    <T>Code</T>
                    <input
                      required
                      value={departmentDraft.code}
                      onChange={(e) =>
                        setDepartmentDraft({
                          ...departmentDraft,
                          code: e.target.value.toUpperCase(),
                        })
                      }
                    />
                  </label>
                </div>
                <label className={styles.field}>
                  <T>Parent department</T>
                  <select
                    value={departmentDraft.parent_id ?? ""}
                    onChange={(e) =>
                      setDepartmentDraft({
                        ...departmentDraft,
                        parent_id: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  >
                    <option value="">
                      <T>Top level</T>
                    </option>
                    {departments
                      .filter((item) => item.id !== selectedId)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <T>Description</T>
                  <textarea
                    value={departmentDraft.description}
                    onChange={(e) =>
                      setDepartmentDraft({
                        ...departmentDraft,
                        description: e.target.value,
                      })
                    }
                  />
                </label>
              </>
            )}
            {kind === "positions" && (
              <>
                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <T>Position name (English)</T>
                    <input
                      required
                      value={positionDraft.name_en}
                      onChange={(e) =>
                        setPositionDraft({
                          ...positionDraft,
                          name_en: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    <T>Position name (Thai)</T>
                    <input
                      value={positionDraft.name_th}
                      onChange={(e) =>
                        setPositionDraft({
                          ...positionDraft,
                          name_th: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    <T>Code</T>
                    <input
                      required
                      value={positionDraft.code}
                      onChange={(e) =>
                        setPositionDraft({
                          ...positionDraft,
                          code: e.target.value.toUpperCase(),
                        })
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    <T>Management level</T>
                    <select
                      value={positionDraft.management_level}
                      onChange={(e) =>
                        setPositionDraft({
                          ...positionDraft,
                          management_level: e.target.value,
                        })
                      }
                    >
                      {[
                        "staff",
                        "senior_staff",
                        "supervisor",
                        "team_leader",
                        "manager",
                        "department_head",
                        "executive",
                      ].map((level) => (
                        <option key={level}>{t(level)}</option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <T>Department</T>
                    <select
                      required
                      value={positionDraft.department_id || ""}
                      onChange={(e) =>
                        setPositionDraft({
                          ...positionDraft,
                          department_id: Number(e.target.value),
                          default_team_id: null,
                          reports_to_position_id: null,
                        })
                      }
                    >
                      <option value="">
                        <T>Select department</T>
                      </option>
                      {departments
                        .filter((item) => item.is_active)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <T>Default team</T>
                    <select
                      value={positionDraft.default_team_id ?? ""}
                      onChange={(e) =>
                        setPositionDraft({
                          ...positionDraft,
                          default_team_id: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                    >
                      <option value="">
                        <T>No default team</T>
                      </option>
                      {teams
                        .filter(
                          (item) =>
                            item.department_id ===
                              positionDraft.department_id && item.is_active,
                        )
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name_en}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <T>Reports to</T>
                    <select
                      value={positionDraft.reports_to_position_id ?? ""}
                      onChange={(e) =>
                        setPositionDraft({
                          ...positionDraft,
                          reports_to_position_id: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                    >
                      <option value="">
                        <T>No reports-to position</T>
                      </option>
                      {positions
                        .filter(
                          (item) =>
                            item.department_id ===
                              positionDraft.department_id &&
                            item.id !== selectedId,
                        )
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name_en}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <T>Display order</T>
                    <input
                      type="number"
                      min="0"
                      value={positionDraft.display_order}
                      onChange={(e) =>
                        setPositionDraft({
                          ...positionDraft,
                          display_order: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                </div>
                <label className={styles.field}>
                  <T>Description</T>
                  <textarea
                    value={positionDraft.description}
                    onChange={(e) =>
                      setPositionDraft({
                        ...positionDraft,
                        description: e.target.value,
                      })
                    }
                  />
                </label>
              </>
            )}
            {kind === "teams" && (
              <>
                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <T>Team name (English)</T>
                    <input
                      required
                      value={teamDraft.name_en}
                      onChange={(e) =>
                        setTeamDraft({ ...teamDraft, name_en: e.target.value })
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    <T>Team name (Thai)</T>
                    <input
                      value={teamDraft.name_th}
                      onChange={(e) =>
                        setTeamDraft({ ...teamDraft, name_th: e.target.value })
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    <T>Code</T>
                    <input
                      required
                      value={teamDraft.code}
                      onChange={(e) =>
                        setTeamDraft({
                          ...teamDraft,
                          code: e.target.value.toUpperCase(),
                        })
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    <T>Department</T>
                    <select
                      required
                      value={teamDraft.department_id || ""}
                      onChange={(e) =>
                        setTeamDraft({
                          ...teamDraft,
                          department_id: Number(e.target.value),
                          parent_team_id: null,
                          team_leader_user_id: null,
                          default_position_ids: [],
                        })
                      }
                    >
                      <option value="">
                        <T>Select department</T>
                      </option>
                      {departments
                        .filter((item) => item.is_active)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <T>Team leader</T>
                    <select
                      value={teamDraft.team_leader_user_id ?? ""}
                      onChange={(e) =>
                        setTeamDraft({
                          ...teamDraft,
                          team_leader_user_id: e.target.value || null,
                        })
                      }
                    >
                      <option value="">
                        <T>No leader</T>
                      </option>
                      {users
                        .filter(
                          (item) =>
                            item.is_active &&
                            item.department_id === teamDraft.department_id,
                        )
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.full_name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <T>Parent team</T>
                    <select
                      value={teamDraft.parent_team_id ?? ""}
                      onChange={(e) =>
                        setTeamDraft({
                          ...teamDraft,
                          parent_team_id: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                    >
                      <option value="">
                        <T>No parent</T>
                      </option>
                      {teams
                        .filter(
                          (item) =>
                            item.department_id === teamDraft.department_id &&
                            item.id !== selectedId,
                        )
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name_en}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <T>Display order</T>
                    <input
                      type="number"
                      min="0"
                      value={teamDraft.display_order}
                      onChange={(e) =>
                        setTeamDraft({
                          ...teamDraft,
                          display_order: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                </div>
                <label className={styles.field}>
                  <T>Description</T>
                  <textarea
                    value={teamDraft.description}
                    onChange={(e) =>
                      setTeamDraft({
                        ...teamDraft,
                        description: e.target.value,
                      })
                    }
                  />
                </label>
                <fieldset className={styles.members}>
                  <legend>
                    <T>Managed brands</T>
                  </legend>
                  {brands.map((brand) => (
                    <label key={brand.id}>
                      <input
                        type="checkbox"
                        checked={teamDraft.brand_ids.includes(brand.id)}
                        onChange={(e) =>
                          setTeamDraft({
                            ...teamDraft,
                            brand_ids: toggle(
                              teamDraft.brand_ids,
                              brand.id,
                              e.target.checked,
                            ),
                          })
                        }
                      />
                      {brand.name}
                    </label>
                  ))}
                </fieldset>
                {canAccess(user, "teams.assign_members") && (
                  <fieldset className={styles.members}>
                    <legend>
                      <T>Members</T>
                    </legend>
                    {users
                      .filter(
                        (item) =>
                          item.department_id === teamDraft.department_id,
                      )
                      .map((member) => (
                        <label key={member.id}>
                          <input
                            type="checkbox"
                            checked={memberIds.includes(member.id)}
                            onChange={(e) => {
                              setMemberIds(
                                e.target.checked
                                  ? [...memberIds, member.id]
                                  : memberIds.filter((id) => id !== member.id),
                              );
                              if (!e.target.checked)
                                setPrimaryMemberIds(
                                  primaryMemberIds.filter(
                                    (id) => id !== member.id,
                                  ),
                                );
                            }}
                          />
                          {member.full_name}
                          <input
                            aria-label={`Primary team for ${member.full_name}`}
                            title={t("Primary team")}
                            type="checkbox"
                            disabled={!memberIds.includes(member.id)}
                            checked={primaryMemberIds.includes(member.id)}
                            onChange={(e) =>
                              setPrimaryMemberIds(
                                e.target.checked
                                  ? [...primaryMemberIds, member.id]
                                  : primaryMemberIds.filter(
                                      (id) => id !== member.id,
                                    ),
                              )
                            }
                          />
                        </label>
                      ))}
                  </fieldset>
                )}
              </>
            )}
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={
                  kind === "positions"
                    ? positionDraft.is_active
                    : kind === "teams"
                      ? teamDraft.is_active
                      : departmentDraft.is_active
                }
                onChange={(e) =>
                  kind === "positions"
                    ? setPositionDraft({
                        ...positionDraft,
                        is_active: e.target.checked,
                      })
                    : kind === "teams"
                      ? setTeamDraft({
                          ...teamDraft,
                          is_active: e.target.checked,
                        })
                      : setDepartmentDraft({
                          ...departmentDraft,
                          is_active: e.target.checked,
                        })
                }
              />
              <T>Active</T>
            </label>
            <div className={styles.formActions}>
              <button
                className={styles.primary}
                type="submit"
                disabled={
                  saving ||
                  !canAccessAny(user, [
                    selectedId ? editPermission : createPermission,
                    kind === "positions"
                      ? "positions.manage"
                      : createPermission,
                  ])
                }
              >
                {saving
                  ? t("Saving…")
                  : selectedId
                    ? t("Save changes")
                    : t("Add {{entity}}", { entity: entityLabel })}
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={startNew}
              >
                <T>Cancel</T>
              </button>
            </div>
          </form>
        </section>
      </div>
    </AdminPageFrame>
  );
}
