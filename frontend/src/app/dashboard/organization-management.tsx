"use client";
import { T, useLanguage } from "@/lib/i18n";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { isPlatformAdmin } from "@/lib/access";
import {
  ApiError,
  getBrands,
  getCatalogueAccessRules,
  getDepartments,
  getOrganizationSummary,
  getPositions,
  getTeams,
  saveBrand,
  saveCatalogueAccessRule,
  saveDepartment,
  savePosition,
  saveTeam,
  type AuthenticatedUser,
  type Brand,
  type CatalogueAccessRule,
  type Department,
  type OrganizationSummary,
  type Position,
  type Team,
} from "@/lib/api";
import styles from "./dashboard.module.css";

type Section = "departments" | "positions" | "teams" | "brands";
type DirectoryItem = Department | Position | Team | Brand;

type Draft = {
  name: string;
  code: string;
  description: string;
  is_active: boolean;
  parent_id: number | null;
  department_id: number | null;
  brand_ids: number[];
};

const EMPTY_SUMMARY: OrganizationSummary = {
  departments: 0,
  positions: 0,
  teams: 0,
  brands: 0,
  permissions: 0,
  assigned_users: 0,
};

const EMPTY_DRAFT: Draft = {
  name: "",
  code: "",
  description: "",
  is_active: true,
  parent_id: null,
  department_id: null,
  brand_ids: [],
};

const SECTION_LABELS: Record<Section, string> = {
  departments: "Departments",
  positions: "Positions",
  teams: "Teams",
  brands: "Brands",
};

function draftFromItem(section: Section, item: DirectoryItem): Draft {
  const named = item;
  return {
    ...EMPTY_DRAFT,
    name: named.name,
    code: named.code,
    description: named.description,
    is_active: named.is_active,
    parent_id:
      section === "departments" ? (named as Department).parent_id : null,
    department_id:
      section === "positions"
        ? (named as Position).department_id
        : section === "teams"
          ? (named as Team).department_id
          : null,
    brand_ids: section === "teams" ? (named as Team).brand_ids : [],
  };
}

export function OrganizationManagement({
  currentUser,
  onToast,
}: {
  currentUser: AuthenticatedUser;
  onToast: (message: string) => void;
}) {
  const { t } = useLanguage();
  const [section, setSection] = useState<Section>("departments");
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [catalogueAccess, setCatalogueAccess] = useState<CatalogueAccessRule[]>(
    [],
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(true);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const isAdmin = isPlatformAdmin(currentUser);
  const items = useMemo<DirectoryItem[]>(() => {
    const map: Record<Section, DirectoryItem[]> = {
      departments,
      positions,
      teams,
      brands,
    };
    const pattern = search.trim().toLowerCase();
    return map[section].filter((item) => {
      const text = `${item.name} ${item.code} ${item.description}`;
      return !pattern || text.toLowerCase().includes(pattern);
    });
  }, [brands, departments, positions, search, section, teams]);

  async function loadAll() {
    const [summaryData, departmentData, positionData, teamData, brandData, accessData] =
      await Promise.all([
        getOrganizationSummary(),
        getDepartments(),
        getPositions(),
        getTeams(),
        getBrands(),
        isAdmin ? getCatalogueAccessRules() : Promise.resolve([]),
      ]);
    setSummary(summaryData);
    setDepartments(departmentData);
    setPositions(positionData);
    setTeams(teamData);
    setBrands(brandData);
    setCatalogueAccess(accessData);
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        await loadAll();
      } catch (caughtError) {
        if (active) {
          setError(
            caughtError instanceof ApiError
              ? caughtError.message
              : "Could not load organization data.",
          );
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
    // The initial directory load intentionally runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeSection(nextSection: Section) {
    setSection(nextSection);
    setSelectedId(null);
    setIsCreating(true);
    setDraft(EMPTY_DRAFT);
    setSearch("");
    setError("");
  }

  function selectItem(item: DirectoryItem) {
    setSelectedId(item.id);
    setIsCreating(false);
    setDraft(draftFromItem(section, item));
    setError("");
  }

  function startCreating() {
    setSelectedId(null);
    setIsCreating(true);
    setDraft(EMPTY_DRAFT);
    setError("");
  }

  function toggleBrand(brandId: number, checked: boolean) {
    setDraft((current) => ({
      ...current,
      brand_ids: checked
        ? [...current.brand_ids, brandId]
        : current.brand_ids.filter((id) => id !== brandId),
    }));
  }

  async function saveItem(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      const namedPayload = {
        name: draft.name,
        code: draft.code,
        description: draft.description,
        is_active: draft.is_active,
      };
      if (section === "departments") {
        await saveDepartment(
          { ...namedPayload, parent_id: draft.parent_id },
          selectedId ?? undefined,
        );
      } else if (section === "positions") {
        if (!draft.department_id) throw new Error("Select a department.");
        await savePosition(
          {
            ...namedPayload,
            department_id: draft.department_id,
          },
          selectedId ?? undefined,
        );
      } else if (section === "teams") {
        if (!draft.department_id) throw new Error("Select a department.");
        await saveTeam(
          {
            ...namedPayload,
            department_id: draft.department_id,
            brand_ids: draft.brand_ids,
          },
          selectedId ?? undefined,
        );
      } else if (section === "brands") {
        await saveBrand(namedPayload, selectedId ?? undefined);
      }
      await loadAll();
      startCreating();
      onToast(t("{{item}} saved.", { item: t(SECTION_LABELS[section].slice(0, -1)) }));
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError || caughtError instanceof Error
          ? caughtError.message
          : "Could not save this record.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function changeCatalogueAccess(
    departmentId: number,
    brandId: number,
    level: "hidden" | "view" | "manage",
  ) {
    setIsSaving(true);
    setError("");
    try {
      const saved = await saveCatalogueAccessRule(departmentId, brandId, {
        can_view: level !== "hidden",
        can_manage: level === "manage",
      });
      setCatalogueAccess((current) => [
        ...current.filter(
          (rule) =>
            !(
              rule.department_id === departmentId &&
              rule.brand_id === brandId
            ),
        ),
        saved,
      ]);
      onToast("Catalogue access updated.");
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : "Could not update catalogue access.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function changeDepartmentCatalogueAccess(
    departmentId: number,
    level: "hidden" | "view" | "manage",
  ) {
    setIsSaving(true);
    setError("");
    try {
      const savedRules: CatalogueAccessRule[] = [];

      // Requests are sent in small batches so a large ERP brand directory
      // does not overload the API while the entire row changes at once.
      for (let index = 0; index < brands.length; index += 10) {
        const batch = brands.slice(index, index + 10);
        const saved = await Promise.all(
          batch.map((brand) =>
            saveCatalogueAccessRule(departmentId, brand.id, {
              can_view: level !== "hidden",
              can_manage: level === "manage",
            }),
          ),
        );
        savedRules.push(...saved);
      }

      const updatedBrandIds = new Set(savedRules.map((rule) => rule.brand_id));
      setCatalogueAccess((current) => [
        ...current.filter(
          (rule) =>
            rule.department_id !== departmentId ||
            !updatedBrandIds.has(rule.brand_id),
        ),
        ...savedRules,
      ]);
      onToast(`All brands changed to ${level} for this department.`);
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : "Could not update all brand access for this department.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className={styles.userLoading}><T>Loading organization...</T></div>;
  }

  return (
    <>
      <section className={styles.orgMetricGrid}>
        {[
          ["Departments", summary.departments],
          ["Positions", summary.positions],
          ["Teams", summary.teams],
          ["Brands", summary.brands],
          ["Assigned users", summary.assigned_users],
        ].map(([label, value]) => (
          <article key={label}>
            <span>{t(String(label))}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <div className={styles.orgTabs}>
        {(Object.keys(SECTION_LABELS) as Section[]).map((name) => (
          <button
            key={name}
            type="button"
            className={section === name ? styles.activeOrgTab : ""}
            onClick={() => changeSection(name)}
          >
            {t(SECTION_LABELS[name])}
          </button>
        ))}
      </div>

      {error && (
        <div className={styles.userError} role="alert">
          <span>!</span>
          {error}
          <button type="button" onClick={() => setError("")}>
            <T>Dismiss</T>
          </button>
        </div>
      )}

      <div className={styles.orgLayout}>
        <section className={styles.orgDirectory}>
          <div className={styles.userListHeader}>
            <div>
              <span><T>Organization directory</T></span>
              <h2>{t(SECTION_LABELS[section])}</h2>
            </div>
            <button type="button" onClick={startCreating}>
              <T>+ New</T>
            </button>
          </div>
          <label className={styles.userSearch}>
            <input
              type="search"
              placeholder={t("Search {{items}}", { items: t(SECTION_LABELS[section]).toLocaleLowerCase() })}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className={styles.orgItemList}>
            {items.map((item) => {
              return (
                <button
                  key={item.id}
                  type="button"
                  className={selectedId === item.id ? styles.selectedOrgItem : ""}
                  onClick={() => selectItem(item)}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.code}</small>
                  </span>
                  <i>›</i>
                </button>
              );
            })}
            {!items.length && (
              <div className={styles.emptyState}>
                {t("No {{items}} yet.", { items: t(SECTION_LABELS[section]).toLocaleLowerCase() })}
              </div>
            )}
          </div>
        </section>

        <section className={styles.orgEditor}>
          <div className={styles.userEditorHeader}>
            <div>
              <span>{t(isCreating ? "Create master data" : "Edit master data")}</span>
              <h2>
                {isCreating
                  ? t("New {{item}}", { item: t(SECTION_LABELS[section].slice(0, -1)).toLocaleLowerCase() })
                  : draft.name || draft.code}
              </h2>
            </div>
          </div>
          <form onSubmit={saveItem}>
            <label className={styles.inputGroup}>
                <span><T>Name</T></span>
                <input
                  value={draft.name}
                  minLength={2}
                  maxLength={120}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  required
                />
            </label>
            <div className={styles.userFormGrid}>
              <label className={styles.inputGroup}>
                <span><T>Code</T></span>
                <input
                  value={draft.code}
                  placeholder="MKT"
                  pattern="[A-Za-z0-9_-]+"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      code: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              {section === "departments" && (
                <label className={styles.inputGroup}>
                  <span><T>Parent department</T></span>
                  <select
                    value={draft.parent_id ?? ""}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        parent_id: event.target.value
                          ? Number(event.target.value)
                          : null,
                      }))
                    }
                  >
                    <option value=""><T>Top level</T></option>
                    {departments
                      .filter((item) => item.id !== selectedId)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {(section === "positions" || section === "teams") && (
                <label className={styles.inputGroup}>
                  <span><T>Department</T></span>
                  <select
                    value={draft.department_id ?? ""}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        department_id: event.target.value
                          ? Number(event.target.value)
                          : null,
                      }))
                    }
                    required
                  >
                    <option value=""><T>Select department</T></option>
                    {departments.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <label className={styles.inputGroup}>
              <span><T>Description</T></span>
              <textarea
                rows={3}
                value={draft.description}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </label>
            {section === "teams" && (
              <fieldset className={styles.roleSelector}>
                <legend><T>Brands managed by this team</T></legend>
                {brands.map((brand) => (
                  <label key={brand.id}>
                    <input
                      type="checkbox"
                      checked={draft.brand_ids.includes(brand.id)}
                      onChange={(event) =>
                        toggleBrand(brand.id, event.target.checked)
                      }
                    />
                    <span>
                      <strong>{brand.name}</strong>
                      <small>{brand.code}</small>
                    </span>
                  </label>
                ))}
                {!brands.length && (
                  <p className={styles.fieldHint}>
                    <T>Create brands before assigning brand ownership.</T>
                  </p>
                )}
              </fieldset>
            )}
            <label className={styles.accountStatusToggle}>
                <span>
                  <strong><T>Active</T></strong>
                  <small><T>Inactive records remain available in history.</T></small>
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
            <button
              className={styles.primaryButton}
              type="submit"
              disabled={isSaving}
            >
              {t(isSaving ? "Saving..." : "Save record")}
            </button>
          </form>

        </section>
      </div>

      {section === "brands" && isAdmin && (
        <section className={styles.catalogueAccessPanel}>
          <div className={styles.catalogueAccessHeader}>
            <div>
              <span><T>SuperAdmin scope control</T></span>
              <h2><T>Catalogue visibility by department and brand</T></h2>
              <p>
                <T>Hidden removes the brand from the department. View permits read-only access. Manage permits catalogue changes when the user&apos;s role also allows the action.</T>
              </p>
            </div>
            <div className={styles.accessLegend}>
              <span><T>Hidden</T></span>
              <span><T>View</T></span>
              <span><T>Manage</T></span>
            </div>
          </div>
          {departments.length && brands.length ? (
            <div className={styles.accessMatrixScroll}>
              <table className={styles.accessMatrix}>
                <thead>
                  <tr>
                    <th><T>Department</T></th>
                    {brands.map((brand) => (
                      <th key={brand.id}>
                        {brand.name}
                        <small>{brand.code}</small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {departments.map((department) => (
                    <tr key={department.id}>
                      <th>
                        <span className={styles.accessDepartmentName}>{department.name}</span>
                        <small>{department.code}</small>
                        <select
                            className={styles.accessRowBulkSelect}
                            value=""
                            disabled={isSaving}
                            aria-label={`Change all brand access for ${department.name}`}
                            onChange={(event) =>
                              event.target.value &&
                              void changeDepartmentCatalogueAccess(department.id, event.target.value as "hidden" | "view" | "manage")
                            }
                          >
                            <option value=""><T>Change all...</T></option>
                            <option value="hidden"><T>All Hidden</T></option>
                            <option value="view"><T>All View</T></option>
                            <option value="manage"><T>All Manage</T></option>
                          </select>
                        </th>
                      {brands.map((brand) => {
                        const rule = catalogueAccess.find(
                          (item) =>
                            item.department_id === department.id &&
                            item.brand_id === brand.id,
                        );
                        const level = rule?.can_manage
                          ? "manage"
                          : rule?.can_view
                            ? "view"
                            : "hidden";
                        return (
                          <td key={brand.id}>
                            <select
                              value={level}
                              disabled={isSaving}
                              aria-label={`${department.name} access to ${brand.name}`}
                              onChange={(event) =>
                                void changeCatalogueAccess(
                                  department.id,
                                  brand.id,
                                  event.target.value as
                                    | "hidden"
                                    | "view"
                                    | "manage",
                                )
                              }
                            >
                              <option value="hidden"><T>Hidden</T></option>
                              <option value="view"><T>View</T></option>
                              <option value="manage"><T>Manage</T></option>
                            </select>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <T>Create at least one department and brand to configure access.</T>
            </div>
          )}
        </section>
      )}
    </>
  );
}
