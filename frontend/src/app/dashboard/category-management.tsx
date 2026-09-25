"use client";

import { useMemo, useState } from "react";
import type { Category } from "@/lib/api";
import { T, useLanguage } from "@/lib/i18n";
import dashboardStyles from "./dashboard.module.css";
import styles from "./category-management.module.css";
import { EntityStatusControl } from "./entity-status-control";

type CategoryGroup = {
  brand: Category["brands"][number];
  categories: Array<{ category: Category; productCount: number }>;
};

type CategoryManagementProps = {
  categories: Category[];
  canEdit: boolean;
  canEditBrands: boolean;
  updatingCategoryId: number | null;
  updatingBrandId: number | null;
  onOpen: (category: Category, brand: string) => void;
  onStatusChange: (
    category: Category,
    isActive: boolean,
    reason: string,
  ) => Promise<void>;
  onBrandStatusChange: (
    brand: Category["brands"][number],
    isActive: boolean,
    reason: string,
  ) => Promise<void>;
};

export function CategoryManagement({
  categories,
  canEdit,
  canEditBrands,
  updatingCategoryId,
  updatingBrandId,
  onOpen,
  onStatusChange,
  onBrandStatusChange,
}: CategoryManagementProps) {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(
    () => new Set(),
  );

  const groups = useMemo<CategoryGroup[]>(() => {
    const grouped = new Map<string, CategoryGroup>();

    for (const category of categories) {
      const categoryBrands = category.brands.length
        ? category.brands
        : [{ name: t("No ERP brand"), product_count: category.product_count }];

      for (const brand of categoryBrands) {
        const key = brand.name.toLocaleLowerCase();
        const group = grouped.get(key) ?? {
          brand,
          categories: [],
        };
        group.categories.push({
          category,
          productCount: brand.product_count,
        });
        grouped.set(key, group);
      }
    }

    return [...grouped.values()]
      .map((group) => ({
        ...group,
        categories: group.categories.sort((left, right) =>
          left.category.name.localeCompare(right.category.name),
        ),
      }))
      .sort((left, right) => left.brand.name.localeCompare(right.brand.name));
  }, [categories, t]);

  const filteredGroups = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();

    return groups
      .map((group) => ({
        ...group,
        categories: group.categories.filter(({ category }) => {
          if (!normalizedSearch) return true;
          return [category.name, category.description, group.brand.name]
            .filter(Boolean)
            .some((value) =>
              value.toLocaleLowerCase().includes(normalizedSearch),
            );
        }),
      }))
      .filter((group) => group.categories.length > 0);
  }, [groups, search]);

  const toggleBrand = (brandName: string) => {
    const brandKey = brandName.toLocaleLowerCase();
    setExpandedBrands((current) => {
      const next = new Set(current);
      if (next.has(brandKey)) {
        next.delete(brandKey);
      } else {
        next.add(brandKey);
      }
      return next;
    });
  };

  return (
    <section className={dashboardStyles.panel}>
      <div className={dashboardStyles.panelHeader}>
        <div>
          <span>{t("Catalogue taxonomy")}</span>
          <h3>{t("Categories")}</h3>
        </div>
        <small>
          {categories.length} {t("total")}
        </small>
      </div>

      <label className={styles.search}>
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("Search categories by name, brand or description")}
          aria-label={t("Search categories")}
        />
      </label>

      <div className={styles.list}>
        {filteredGroups.map((group) => {
          const brandKey = group.brand.name.toLocaleLowerCase();
          const isExpanded =
            expandedBrands.has(brandKey) ||
            search.trim().length > 0;
          const panelId = `brand-categories-${
            group.brand.id ?? brandKey.replace(/[^a-z0-9]+/g, "-")
          }`;

          return (
            <section
              className={styles.brandGroup}
              data-expanded={isExpanded}
              key={group.brand.name}
            >
              <div className={styles.brandHeader}>
                <div className={styles.brandHeading}>
                  <h4>
                    <button
                      className={styles.brandDisclosure}
                      type="button"
                      aria-expanded={isExpanded}
                      aria-controls={panelId}
                      aria-label={`${group.brand.name} categories`}
                      onClick={() => toggleBrand(group.brand.name)}
                    >
                      <span>{group.brand.name}</span>
                      <svg
                        className={styles.brandChevron}
                        aria-hidden="true"
                        viewBox="0 0 20 20"
                      >
                        <path d="m5 7.5 5 5 5-5" />
                      </svg>
                    </button>
                  </h4>
                  {group.brand.is_active === false && group.brand.inactive_reason && (
                    <small>{t("Disabled")}: {group.brand.inactive_reason}</small>
                  )}
                </div>
                {group.brand.id != null && (
                  <EntityStatusControl
                    entityType="brand"
                    entityName={group.brand.name}
                    isActive={group.brand.is_active !== false}
                    inactiveReason={group.brand.inactive_reason}
                    disabled={!canEditBrands || updatingBrandId === group.brand.id}
                    onChange={(isActive, reason) =>
                      onBrandStatusChange(group.brand, isActive, reason)
                    }
                  />
                )}
              </div>
              {isExpanded && (
                <div className={styles.rows} id={panelId}>
                  {group.categories.map(({ category, productCount }) => {
                    const isUpdating = updatingCategoryId === category.id;
                    return (
                      <article
                        className={styles.row}
                        data-active={category.is_active}
                        key={`${group.brand.name}-${category.id}`}
                      >
                        <button
                          className={styles.mainAction}
                          type="button"
                          onClick={() => onOpen(category, group.brand.name)}
                          aria-label={`Open ${category.name} product list for ${group.brand.name}`}
                        >
                          <span className={styles.categoryIcon} aria-hidden="true">
                            {category.name.slice(0, 2).toUpperCase()}
                          </span>
                          <span className={styles.categoryCopy}>
                            <strong>{category.name}</strong>
                            <small>
                              {category.description || t("No description supplied.")}
                            </small>
                            {!category.is_active && category.inactive_reason && (
                              <small className={styles.disabledReason}>
                                {t("Disabled")}: {category.inactive_reason}
                              </small>
                            )}
                          </span>
                          <span className={styles.productCount}>
                            {productCount} <T>products</T>
                          </span>
                        </button>

                        <EntityStatusControl
                          entityType="category"
                          entityName={`${category.name} (${group.brand.name})`}
                          isActive={category.is_active}
                          inactiveReason={category.inactive_reason}
                          disabled={!canEdit || isUpdating}
                          onChange={(isActive, reason) =>
                            onStatusChange(category, isActive, reason)
                          }
                        />
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}

        {!filteredGroups.length && (
          <div className={dashboardStyles.emptyState}>
            {t("No categories match your search.")}
          </div>
        )}
      </div>
    </section>
  );
}
