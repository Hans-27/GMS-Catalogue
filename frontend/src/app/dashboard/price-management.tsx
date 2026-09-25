"use client";
import { T, useLanguage } from "@/lib/i18n";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  createPriceList,
  createProductPrice,
  getPriceChangeRequests,
  getErpCustomerPriceFilters,
  getErpCustomerPriceLevels,
  getErpProductPriceMatrix,
  getMyCataloguePriceMappingSummary,
  getMyCataloguePriceMappings,
  getPriceLists,
  getProductPrices,
  getProducts,
  proposePriceChange,
  reviewPriceChange,
  updateMyCataloguePriceMappings,
  type AuthenticatedUser,
  type ErpCustomerPriceLevel,
  type ErpProductPriceMatrixItem,
  type PriceChangeRequest,
  type PriceList,
  type PriceProposalPayload,
  type ProductListItem,
  type ProductPrice,
  type UserCataloguePriceMapping,
  type UserBrandCataloguePriceMappingSummary,
} from "@/lib/api";
import styles from "./dashboard.module.css";
import { canAccess } from "@/lib/access";
import { formatApiDate } from "@/lib/date-time";

type PriceView = "mapping" | "history" | "erp" | "pending" | "lists";

/** Keep the customer-level label separate from its configurable ERP code. */
const CUSTOMER_LEVEL_LABELS: Record<string, string> = {
  normal: "Normal",
  vip: "VIP BKK",
  big_customer_vip: "Big Customer",
  srp: "Retail",
  sp5: "Dealer",
  sp6: "Wholesale",
  vvip: "VVIP",
  vip_province: "VIP Province",
  no_price: "No Price",
};

export function customerLevelLabel(value: string, audienceCode?: string) {
  if (audienceCode && CUSTOMER_LEVEL_LABELS[audienceCode]) {
    return CUSTOMER_LEVEL_LABELS[audienceCode];
  }
  const normalized = value
    .replace(/\s*(?:Â?·|ยท|[-–—])\s*/g, " ")
    .trim();
  const label = normalized.replace(/^(?:SP\d+|SRP)\s+/i, "").trim() || value;
  return label.toUpperCase() === "VIP" ? "VIP BKK" : label;
}

export function customerLevelNamesForPriceList(
  mappings: UserCataloguePriceMapping[],
  priceListId: number,
) {
  return Array.from(
    new Set(
      mappings
        .filter(
          (mapping) =>
            mapping.show_prices && mapping.price_list_id === priceListId,
        )
        .map((mapping) =>
          customerLevelLabel(mapping.audience_name, mapping.audience_code),
        ),
    ),
  );
}

const EMPTY_PROPOSAL = {
  product_id: "",
  price_list_id: "",
  proposed_amount: "",
  effective_from: "",
  reason: "",
};

const EMPTY_PRICE_LIST = {
  code: "",
  name: "",
  description: "",
  currency: "THB",
  is_no_price: false,
  is_active: true,
};

function formatMoney(amount: string | null, locale: string, currency = "THB") {
  if (amount === null) return "Not set";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

function formatDate(value: string | null, locale: string, includeTime = false) {
  if (!value) return "—";
  return formatApiDate(value, locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function toLocalInputValue() {
  const date = new Date(Date.now() + 5 * 60 * 1000);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function requestDifference(request: PriceChangeRequest) {
  if (request.current_amount === null) return null;
  return Number(request.proposed_amount) - Number(request.current_amount);
}

export function PriceManagement({
  currentUser,
  onToast,
}: {
  currentUser: AuthenticatedUser;
  onToast: (message: string) => void;
}) {
  const { locale, t } = useLanguage();
  const [view, setView] = useState<PriceView>("mapping");
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [priceLevels, setPriceLevels] = useState<ErpCustomerPriceLevel[]>([]);
  const [catalogueMappings, setCatalogueMappings] = useState<
    UserCataloguePriceMapping[]
  >([]);
  const [mappingDraft, setMappingDraft] = useState<Record<number, string>>({});
  const [mappingBrand, setMappingBrand] = useState("");
  const [mappingBrandSearch, setMappingBrandSearch] = useState("");
  const [mappingSummary, setMappingSummary] = useState<UserBrandCataloguePriceMappingSummary[]>([]);
  const [isMappingLoading, setIsMappingLoading] = useState(false);
  const [erpPrices, setErpPrices] = useState<ErpProductPriceMatrixItem[]>([]);
  const [erpPriceTotal, setErpPriceTotal] = useState(0);
  const [erpPricePage, setErpPricePage] = useState(1);
  const [erpPricePages, setErpPricePages] = useState(1);
  const [erpPriceQuery, setErpPriceQuery] = useState("");
  const [erpPriceBrandFilter, setErpPriceBrandFilter] = useState("");
  const [erpPriceCategoryFilter, setErpPriceCategoryFilter] = useState("");
  const [erpPriceBrands, setErpPriceBrands] = useState<
    Array<{ name: string; product_count: number }>
  >([]);
  const [erpPriceCategories, setErpPriceCategories] = useState<
    Array<{ id: number; name: string; product_count: number }>
  >([]);
  const [prices, setPrices] = useState<ProductPrice[]>([]);
  const [requests, setRequests] = useState<PriceChangeRequest[]>([]);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [priceListFilter, setPriceListFilter] = useState("");
  const [proposal, setProposal] = useState({
    ...EMPTY_PROPOSAL,
    effective_from: toLocalInputValue(),
  });
  const [priceListDraft, setPriceListDraft] = useState(EMPTY_PRICE_LIST);
  const [reviewing, setReviewing] = useState<PriceChangeRequest | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const hasPermission = (permission: string) =>
    canAccess(currentUser, permission);
  const canPropose = hasPermission("products.prices.propose");
  const canPublishDirectly = hasPermission("products.prices.edit");
  const canApprove = hasPermission("products.prices.approve");
  const canManageLists = hasPermission("settings.manage");
  const activePriceLists = priceLists.filter(
    (priceList) => priceList.is_active && !priceList.is_no_price,
  );
  const pendingRequests = requests.filter((request) => request.status === "pending");
  const customerLevelsByPriceList = useMemo(
    () =>
      new Map(
        priceLevels.map((level) => [
          level.price_list_id,
          customerLevelNamesForPriceList(
            catalogueMappings,
            level.price_list_id,
          ),
        ]),
      ),
    [catalogueMappings, priceLevels],
  );
  const mappingIsDirty = useMemo(
    () => catalogueMappings.some(
      (item) => String(item.price_list_id) !== (mappingDraft[item.audience_type_id] || ""),
    ),
    [catalogueMappings, mappingDraft],
  );
  const visibleMappingBrands = useMemo(() => {
    const needle = mappingBrandSearch.trim().toLocaleLowerCase();
    return needle
      ? mappingSummary.filter((brand) => brand.brand.toLocaleLowerCase().includes(needle))
      : mappingSummary;
  }, [mappingBrandSearch, mappingSummary]);
  const visiblePrices = useMemo(
    () =>
      priceListFilter
        ? prices.filter(
            (price) => price.price_list_id === Number(priceListFilter),
          )
        : prices,
    [priceListFilter, prices],
  );
  async function load(): Promise<boolean> {
    setError("");
    try {
      const [listData, levelData, mappingData, mappingSummaryData, erpPriceData, erpFilterData, priceData, requestData, productData] = await Promise.all([
        getPriceLists(true),
        getErpCustomerPriceLevels(),
        getMyCataloguePriceMappings(),
        getMyCataloguePriceMappingSummary(),
        getErpProductPriceMatrix(),
        getErpCustomerPriceFilters(),
        getProductPrices(),
        getPriceChangeRequests(),
        getProducts({ page: 1 }),
      ]);
      setPriceLists(listData);
      setPriceLevels(levelData);
      setCatalogueMappings(mappingData);
      setMappingSummary(mappingSummaryData);
      setMappingDraft(Object.fromEntries(mappingData.map((item) => [item.audience_type_id, String(item.price_list_id)])));
      setErpPrices(erpPriceData.items);
      setErpPriceTotal(erpPriceData.total);
      setErpPricePage(erpPriceData.page);
      setErpPricePages(erpPriceData.pages);
      setErpPriceBrands(erpFilterData.brands);
      setErpPriceCategories(erpFilterData.categories);
      setPrices(priceData);
      setRequests(requestData);
      setProducts(productData.items);
      return true;
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not load price management."),
      );
      return false;
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshPriceData() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const refreshed = await load();
      if (refreshed) onToast(t("Price data refreshed."));
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function loadInitialData() {
      try {
        const [listData, levelData, mappingData, mappingSummaryData, erpPriceData, erpFilterData, priceData, requestData, productData] = await Promise.all([
          getPriceLists(true),
          getErpCustomerPriceLevels(),
          getMyCataloguePriceMappings(),
          getMyCataloguePriceMappingSummary(),
          getErpProductPriceMatrix(),
          getErpCustomerPriceFilters(),
          getProductPrices(),
          getPriceChangeRequests(),
          getProducts({ page: 1 }),
        ]);
        if (!active) return;
        setPriceLists(listData);
        setPriceLevels(levelData);
        setCatalogueMappings(mappingData);
        setMappingSummary(mappingSummaryData);
        setMappingDraft(Object.fromEntries(mappingData.map((item) => [item.audience_type_id, String(item.price_list_id)])));
        setErpPrices(erpPriceData.items);
        setErpPriceTotal(erpPriceData.total);
        setErpPricePage(erpPriceData.page);
        setErpPricePages(erpPriceData.pages);
        setErpPriceBrands(erpFilterData.brands);
        setErpPriceCategories(erpFilterData.categories);
        setPrices(priceData);
        setRequests(requestData);
        setProducts(productData.items);
      } catch (caughtError) {
        if (active) {
          setError(
            caughtError instanceof ApiError
              ? t(caughtError.message)
              : t("Could not load price management."),
          );
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void loadInitialData();
    return () => {
      active = false;
    };
  }, [t]);

  async function searchErpPrices(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadErpPricePage(1);
  }

  async function loadErpPricePage(page: number, brand = erpPriceBrandFilter) {
    try {
      const data = await getErpProductPriceMatrix({
        q: erpPriceQuery.trim() || undefined,
        brand: brand || undefined,
        categoryId: erpPriceCategoryFilter
          ? Number(erpPriceCategoryFilter)
          : undefined,
        page,
      });
      setErpPrices(data.items);
      setErpPriceTotal(data.total);
      setErpPricePage(data.page);
      setErpPricePages(data.pages);
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not load ERP customer prices."),
      );
    }
  }

  async function changeMappingBrand(brand: string) {
    setMappingBrand(brand);
    setErpPriceBrandFilter(brand);
    setIsMappingLoading(true);
    setError("");
    try {
      const [mappings, matrix] = await Promise.all([
        getMyCataloguePriceMappings(brand || undefined),
        getErpProductPriceMatrix({ brand: brand || undefined, page: 1 }),
      ]);
      setCatalogueMappings(mappings);
      setMappingDraft(Object.fromEntries(mappings.map((item) => [item.audience_type_id, String(item.price_list_id)])));
      setErpPrices(matrix.items);
      setErpPriceTotal(matrix.total);
      setErpPricePage(matrix.page);
      setErpPricePages(matrix.pages);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? t(caughtError.message) : t("Could not load price management."));
    } finally {
      setIsMappingLoading(false);
    }
  }

  async function searchProducts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const page = await getProducts({ q: productQuery, page: 1 });
      setProducts(page.items);
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not search products."),
      );
    }
  }

  function proposalPayload(): PriceProposalPayload | null {
    if (
      !proposal.product_id ||
      !proposal.price_list_id ||
      !proposal.proposed_amount ||
      proposal.reason.trim().length < 3
    ) {
      setError(t("Choose a product and price list, enter an amount, and add a reason."));
      return null;
    }
    return {
      product_id: proposal.product_id,
      price_list_id: Number(proposal.price_list_id),
      proposed_amount: proposal.proposed_amount,
      effective_from: new Date(proposal.effective_from).toISOString(),
      reason: proposal.reason.trim(),
    };
  }

  async function saveProposal(direct: boolean) {
    const payload = proposalPayload();
    if (!payload) return;
    setIsSaving(true);
    setError("");
    try {
      if (direct) {
        const saved = await createProductPrice(payload);
        setPrices((current) => [saved, ...current]);
        onToast(t("Approved price published."));
      } else {
        const saved = await proposePriceChange(payload);
        setRequests((current) => [saved, ...current]);
        onToast(t("Price change sent for approval."));
      }
      setProposal({
        ...EMPTY_PROPOSAL,
        effective_from: toLocalInputValue(),
      });
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not save the price change."),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function reviewRequest(approve: boolean) {
    if (!reviewing) return;
    setIsSaving(true);
    setError("");
    try {
      const updated = await reviewPriceChange(reviewing.id, {
        approve,
        reason: reviewReason.trim(),
      });
      setRequests((current) =>
        current.map((request) =>
          request.id === updated.id ? updated : request,
        ),
      );
      setReviewing(null);
      setReviewReason("");
      if (approve) {
        setPrices(await getProductPrices());
      }
      onToast(t(approve ? "Price change approved." : "Price change rejected."));
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not review the request."),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function savePriceList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      const saved = await createPriceList({
        ...priceListDraft,
        code: priceListDraft.code.trim(),
        name: priceListDraft.name.trim(),
        description: priceListDraft.description.trim(),
        currency: priceListDraft.currency.trim().toUpperCase(),
      });
      setPriceLists((current) => [...current, saved]);
      setPriceListDraft(EMPTY_PRICE_LIST);
      onToast(t("Price list created."));
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not create the price list."),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function saveCatalogueMappings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const mappings = catalogueMappings.map((item) => ({
      audience_type_id: item.audience_type_id,
      price_list_id: Number(mappingDraft[item.audience_type_id]),
    }));
    if (mappings.some((item) => !item.price_list_id)) {
      setError(t("Choose an ERP price for every customer level."));
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const saved = mappingBrand
        ? await updateMyCataloguePriceMappings(mappings, mappingBrand)
        : await updateMyCataloguePriceMappings(mappings);
      setCatalogueMappings(saved);
      setMappingDraft(Object.fromEntries(saved.map((item) => [item.audience_type_id, String(item.price_list_id)])));
      if (mappingBrand) {
        setMappingSummary(await getMyCataloguePriceMappingSummary());
      }
      onToast(t("Your catalogue price mapping was saved."));
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not save your catalogue price mapping."),
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className={styles.userLoading}><T>Loading price management...</T></div>;
  }

  return (
    <>
      <section className={styles.commerceHero}>
        <div>
          <span><T>Controlled pricing</T></span>
          <h2><T>Brand price mapping</T></h2>
          <p>
            <T>Choose a brand, map its customer audiences to ERP price levels, then verify the result.</T>
          </p>
        </div>
        <div className={styles.pricingSteps} aria-label={t("Pricing workflow")}>
          <span><b>1</b><T>Choose brand</T></span>
          <span><b>2</b><T>Map prices</T></span>
          <span><b>3</b><T>Save and verify</T></span>
        </div>
      </section>

      <div className={styles.commerceTabs}>
        <button
          type="button"
          data-active={view === "erp"}
          onClick={() => setView(view === "erp" ? "mapping" : "erp")}
        >
          {t(view === "erp" ? "Back to price mapping" : "ERP price matrix")}
        </button>
        <button
          className={styles.commerceRefresh}
          type="button"
          onClick={() => void refreshPriceData()}
          disabled={isRefreshing}
          aria-busy={isRefreshing}
        >
          {isRefreshing ? t("Refreshing...") : t("Refresh")}
        </button>
      </div>

      {error && <div className={styles.userError} role="alert"><span>!</span>{error}<button type="button" onClick={() => setError("")}><T>Dismiss</T></button></div>}

      {view === "mapping" && (
        <section className={styles.commercePanel}>
          <div className={styles.priceMappingWorkspace}>
            <aside className={styles.mappingBrandDirectory} aria-label={t("Brand mappings")}>
              <header>
                <span><T>Step 1</T></span>
                <h3><T>Choose a brand</T></h3>
                <p><T>Configure a brand once. Catalogue Studio will use it automatically.</T></p>
              </header>
              <input
                type="search"
                aria-label={t("Search brands to map")}
                placeholder={t("Search brands")}
                value={mappingBrandSearch}
                onChange={(event) => setMappingBrandSearch(event.target.value)}
              />
              <div className={styles.mappingBrandList}>
                <button type="button" aria-pressed={!mappingBrand} onClick={() => void changeMappingBrand("")} disabled={isMappingLoading || isSaving}>
                  <span><strong><T>All-brand default</T></strong><small><T>Fallback for brands without custom mapping</T></small></span>
                  <em data-status="default"><T>Default</T></em>
                </button>
                {visibleMappingBrands.map((brand) => (
                  <button key={brand.brand} type="button" aria-pressed={mappingBrand === brand.brand} onClick={() => void changeMappingBrand(brand.brand)} disabled={isMappingLoading || isSaving}>
                    <span><strong>{brand.brand}</strong><small>{t("{{count}} products", { count: brand.product_count })}</small></span>
                    <em data-status={brand.status}>
                      {brand.status === "custom"
                        ? t("Custom")
                        : brand.status === "partial"
                          ? `${brand.override_count}/${brand.audience_count}`
                          : t("Uses default")}
                    </em>
                  </button>
                ))}
                {!visibleMappingBrands.length && <p className={styles.mappingBrandEmpty}><T>No brands match your search.</T></p>}
              </div>
            </aside>
            <div className={styles.mappingEditor}>
              <div className={styles.brandMappingToolbar}>
                <label className={styles.brandMappingMobileSelect}>
                  <span><T>Brand to configure</T></span>
                  <select value={mappingBrand} onChange={(event) => void changeMappingBrand(event.target.value)} disabled={isMappingLoading || isSaving}>
                    <option value=""><T>Default for all brands</T></option>
                    {mappingSummary.map((brand) => <option key={brand.brand} value={brand.brand}>{brand.brand} ({brand.product_count})</option>)}
                  </select>
                </label>
                <div>
                  <span><T>Step 2 · Map customer links</T></span>
                  <strong>{mappingBrand || t("All-brand default")}</strong>
                  <small>{mappingBrand ? t("Each product from this brand will use these ERP levels in Catalogue Studio.") : t("Used only when a brand has no custom mapping.")}</small>
                </div>
                {mappingIsDirty && <em><T>Unsaved changes</T></em>}
              </div>
              <div className={styles.commercePanelHeader}>
                <div>
                  <span><T>Audience mapping</T></span>
                  <h3>{mappingBrand ? t("{{brand}} price mapping", { brand: mappingBrand }) : t("Default price mapping")}</h3>
                  <p><T>Choose the ERP price level shown by each customer catalogue link.</T></p>
                </div>
                <small>{t("{{count}} customer levels", { count: catalogueMappings.length })}</small>
              </div>
              <form onSubmit={saveCatalogueMappings} className={styles.cataloguePriceMappingForm} aria-busy={isMappingLoading}>
                {isMappingLoading && <div className={styles.mappingLoading}><T>Loading brand pricing...</T></div>}
                <div className={styles.cataloguePriceMappingGrid}>
                  {catalogueMappings.map((mapping) => {
                    const selected = priceLists.find((item) => item.id === Number(mappingDraft[mapping.audience_type_id]));
                    const selectedLevel = priceLevels.find((level) => level.price_list_id === Number(mappingDraft[mapping.audience_type_id]));
                    const audienceLabel = customerLevelLabel(mapping.audience_name, mapping.audience_code);
                    return (
                      <label key={mapping.audience_type_id}>
                        <span>
                          <strong>{audienceLabel}</strong>
                          <small>{selected?.is_no_price ? t("Prices hidden") : selectedLevel ? `${t("ERP level")}: ${selectedLevel.source_code}` : t("Choose an ERP price level")}</small>
                          {mapping.is_brand_override && <em><T>Brand mapping</T></em>}
                        </span>
                        <select aria-label={t("ERP price for {{audience}}", { audience: audienceLabel })} value={mappingDraft[mapping.audience_type_id] || ""} onChange={(event) => setMappingDraft((current) => ({ ...current, [mapping.audience_type_id]: event.target.value }))}>
                          <option value=""><T>Select ERP price</T></option>
                          {priceLevels.filter((level) => level.is_active).map((level) => <option key={level.id} value={level.price_list_id}>{level.source_code} · {level.source_name}</option>)}
                          {priceLists.filter((priceList) => priceList.is_active && priceList.is_no_price).map((priceList) => <option key={priceList.id} value={priceList.id}>{t("No Price")}</option>)}
                        </select>
                      </label>
                    );
                  })}
                </div>
                <div className={styles.cataloguePriceMappingActions}>
                  <p>{mappingBrand ? t("Save once and Catalogue Studio will resolve every {{brand}} product automatically.", { brand: mappingBrand }) : t("Brands without a custom mapping will inherit this default.")}</p>
                  <button className={styles.primaryButton} type="submit" disabled={isSaving || !catalogueMappings.length}>
                    {t(isSaving ? "Saving..." : mappingBrand ? "Save brand mapping" : "Save default mapping")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>
      )}

      {view === "erp" && (
        <section className={styles.commercePanel}>
          <div className={styles.commercePanelHeader}>
            <div><span><T>Current source prices</T></span><h3><T>ERP customer price matrix</T></h3></div>
            <small>{t("{{count}} ERP products", { count: erpPriceTotal })}</small>
          </div>
          <form onSubmit={searchErpPrices} className={styles.compactSearch}>
            <input value={erpPriceQuery} onChange={(event) => setErpPriceQuery(event.target.value)} placeholder={t("Find product by name, SKU or brand")} />
            <select value={erpPriceBrandFilter} onChange={(event) => setErpPriceBrandFilter(event.target.value)} aria-label={t("ERP brand")}>
              <option value=""><T>All ERP brands</T></option>
              {erpPriceBrands.map((brand) => <option key={brand.name} value={brand.name}>{brand.name} ({brand.product_count})</option>)}
            </select>
            <select value={erpPriceCategoryFilter} onChange={(event) => setErpPriceCategoryFilter(event.target.value)} aria-label={t("ERP category")}>
              <option value=""><T>All ERP categories</T></option>
              {erpPriceCategories.map((category) => <option key={category.id} value={category.id}>{category.name} ({category.product_count})</option>)}
            </select>
            <button type="submit"><T>Search</T></button>
          </form>
          <div className={styles.commerceTableWrap}>
            <table className={`${styles.commerceTable} ${styles.erpMatrixTable}`}>
              <thead><tr><th><T>Product</T></th><th><T>Brand</T></th><th><T>Category</T></th>{priceLevels.map((level) => {
                const customerLevels = customerLevelsByPriceList.get(level.price_list_id) ?? [];
                return <th key={level.id}><strong>{level.source_code}</strong>{customerLevels.length > 0 && <small>{customerLevels.map((name) => t(name)).join(" / ")}</small>}</th>;
              })}</tr></thead>
              <tbody>
                {erpPrices.map((product) => {
                  const pricesByLevel = new Map(product.prices.map((price) => [price.price_level_id, price]));
                  return <tr key={product.product_id}><td><strong>{product.product_name}</strong><small>{product.product_sku}</small></td><td>{product.product_brand || t("Unbranded")}</td><td>{product.category_names.join(", ") || t("Uncategorised")}</td>{priceLevels.map((level) => {
                    const price = pricesByLevel.get(level.id);
                    const customerLevels = customerLevelsByPriceList.get(level.price_list_id) ?? [];
                    return <td key={level.id} className={styles.erpMatrixPrice}><strong>{price ? formatMoney(price.amount, locale, price.currency) : "—"}</strong>{customerLevels.length > 0 && <small>{customerLevels.map((name) => t(name)).join(" / ")}</small>}</td>;
                  })}</tr>;
                })}
              </tbody>
            </table>
            {!erpPrices.length && <div className={styles.emptyState}><T>No ERP customer prices match these filters.</T></div>}
          </div>
          {erpPricePages > 1 && <div className={styles.pagination}><button type="button" disabled={erpPricePage <= 1} onClick={() => void loadErpPricePage(erpPricePage - 1)}><T>Previous</T></button><span>{t("Page {{page}} of {{pages}}", { page: erpPricePage, pages: erpPricePages })}</span><button type="button" disabled={erpPricePage >= erpPricePages} onClick={() => void loadErpPricePage(erpPricePage + 1)}><T>Next</T></button></div>}
        </section>
      )}

      {view === "history" && (
        <div className={styles.commerceSplit}>
          <section className={styles.commercePanel}>
            <div className={styles.commercePanelHeader}>
              <div><span><T>Approved records</T></span><h3><T>Price history</T></h3></div>
              <select value={priceListFilter} onChange={(event) => setPriceListFilter(event.target.value)}>
                <option value=""><T>All price lists</T></option>
                {priceLists.map((priceList) => <option key={priceList.id} value={priceList.id}>{priceList.name}</option>)}
              </select>
            </div>
            <div className={styles.commerceTableWrap}>
              <table className={styles.commerceTable}>
                <thead><tr><th><T>Product</T></th><th><T>Price list</T></th><th><T>Amount</T></th><th><T>Effective</T></th><th><T>Expires</T></th><th><T>Reason</T></th></tr></thead>
                <tbody>
                  {visiblePrices.map((price) => (
                    <tr key={price.id}>
                      <td><strong>{price.product_name}</strong><small>{price.product_sku}</small></td>
                      <td>{price.price_list_name}</td>
                      <td><strong>{formatMoney(price.amount, locale, price.currency)}</strong></td>
                      <td>{formatDate(price.effective_from, locale)}</td>
                      <td>{formatDate(price.expires_at, locale)}</td>
                      <td title={price.reason}>{price.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visiblePrices.length && <div className={styles.emptyState}><T>No approved price records match this list.</T></div>}
            </div>
          </section>

          {(canPropose || canPublishDirectly) && (
            <section className={`${styles.commercePanel} ${styles.commerceFormPanel}`}>
              <div className={styles.commercePanelHeader}><div><span><T>New effective price</T></span><h3><T>Change a product price</T></h3></div></div>
              <form onSubmit={searchProducts} className={styles.compactSearch}>
                <input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder={t("Find product by name, SKU or brand")} />
                <button type="submit"><T>Search</T></button>
              </form>
              <div className={styles.commerceFormGrid}>
                <label className={styles.inputGroup}><span><T>Product</T></span><select value={proposal.product_id} onChange={(event) => setProposal((current) => ({ ...current, product_id: event.target.value }))}><option value=""><T>Select product</T></option>{products.map((product) => <option key={product.id} value={product.id}>{product.sku} — {product.display_name || product.erp_name}</option>)}</select></label>
                <label className={styles.inputGroup}><span><T>Price list</T></span><select value={proposal.price_list_id} onChange={(event) => setProposal((current) => ({ ...current, price_list_id: event.target.value }))}><option value=""><T>Select price list</T></option>{activePriceLists.map((priceList) => <option key={priceList.id} value={priceList.id}>{priceList.name} ({priceList.currency})</option>)}</select></label>
                <label className={styles.inputGroup}><span><T>New amount</T></span><input type="number" min="0" step="0.01" value={proposal.proposed_amount} onChange={(event) => setProposal((current) => ({ ...current, proposed_amount: event.target.value }))} placeholder={t("0.00")} /></label>
                <label className={styles.inputGroup}><span><T>Effective from</T></span><input type="datetime-local" value={proposal.effective_from} onChange={(event) => setProposal((current) => ({ ...current, effective_from: event.target.value }))} /></label>
                <label className={`${styles.inputGroup} ${styles.commerceFullField}`}><span><T>Reason for change</T></span><textarea rows={4} maxLength={500} value={proposal.reason} onChange={(event) => setProposal((current) => ({ ...current, reason: event.target.value }))} placeholder={t("Explain why this price is changing.")} /></label>
              </div>
              <div className={styles.commerceFormActions}>
                {canPropose && <button className={styles.secondaryButton} type="button" disabled={isSaving} onClick={() => void saveProposal(false)}><T>Submit for approval</T></button>}
                {canPublishDirectly && <button className={styles.primaryButton} type="button" disabled={isSaving} onClick={() => void saveProposal(true)}><T>Publish directly</T></button>}
              </div>
            </section>
          )}
        </div>
      )}

      {view === "pending" && (
        <section className={styles.commercePanel}>
          <div className={styles.commercePanelHeader}><div><span><T>Four-eye control</T></span><h3><T>Price approval queue</T></h3></div><small>{t("{{count}} pending", { count: pendingRequests.length })}</small></div>
          <div className={styles.approvalList}>
            {pendingRequests.map((request) => {
              const difference = requestDifference(request);
              return (
                <article key={request.id}>
                  <div className={styles.approvalIdentity}><span>{request.product_sku}</span><strong>{request.product_name}</strong><small>{request.price_list_name} · {t("effective")} {formatDate(request.effective_from, locale)}</small></div>
                  <div className={styles.priceComparison}><span><small><T>Current</T></small><strong>{formatMoney(request.current_amount, locale, request.currency)}</strong></span><b>→</b><span><small><T>Proposed</T></small><strong>{formatMoney(request.proposed_amount, locale, request.currency)}</strong></span>{difference !== null && <em data-positive={difference > 0}>{difference > 0 ? "+" : ""}{formatMoney(String(difference), locale, request.currency)}</em>}</div>
                  <p>{request.reason}</p>
                  {canApprove && <button type="button" onClick={() => { setReviewing(request); setReviewReason(""); }}><T>Review</T></button>}
                </article>
              );
            })}
            {!pendingRequests.length && <div className={styles.emptyState}><T>There are no price changes waiting for approval.</T></div>}
          </div>
        </section>
      )}

      {view === "lists" && (
        <>
          <div className={styles.priceListOverviewGrid}>
            <section className={styles.commercePanel}>
              <div className={styles.commercePanelHeader}><div><span><T>ERP customer pricing</T></span><h3><T>Customer price levels</T></h3></div><small>{t("{{count}} ERP levels", { count: priceLevels.length })}</small></div>
              <div className={styles.priceListCards}>
                {priceLevels.map((level) => <article key={level.id} data-inactive={!level.is_active}><div><span>{level.source_code} · ERP #{level.erp_price_type_id}</span><strong>{level.source_name}</strong><p>{t("Mapped to {{priceList}}", { priceList: level.price_list_name })}</p></div><div><b>{level.price_list_code}</b><small>{t("{{count}} products", { count: level.product_count })}</small></div></article>)}
                {!priceLevels.length && <div className={styles.emptyState}><T>No ERP price levels synchronized.</T></div>}
              </div>
            </section>

            <section className={styles.commercePanel}>
              <div className={styles.commercePanelHeader}><div><span><T>Configurable audiences</T></span><h3><T>Price lists</T></h3></div><small>{t("{{count}} configured", { count: priceLists.length })}</small></div>
              <div className={styles.priceListCards}>
                {priceLists.map((priceList) => <article key={priceList.id} data-inactive={!priceList.is_active}><div><span>{priceList.code}</span><strong>{priceList.name}</strong><p>{priceList.description || t("No description.")}</p></div><div><b>{priceList.is_no_price ? t("Prices hidden") : priceList.currency}</b><small>{t(priceList.is_active ? "Active" : "Inactive")}</small></div></article>)}
              </div>
            </section>
          </div>

          {canManageLists && (
            <section className={`${styles.commercePanel} ${styles.commerceFormPanel} ${styles.priceListCreatePanel}`}>
              <div className={styles.commercePanelHeader}><div><span><T>SuperAdmin configuration</T></span><h3><T>Create price list</T></h3></div></div>
              <form onSubmit={savePriceList} className={styles.commerceFormGrid}>
                <label className={styles.inputGroup}><span><T>Code</T></span><input required minLength={2} maxLength={40} value={priceListDraft.code} onChange={(event) => setPriceListDraft((current) => ({ ...current, code: event.target.value }))} placeholder={t("VIP BKK")} /></label>
                <label className={styles.inputGroup}><span><T>Name</T></span><input required minLength={2} maxLength={120} value={priceListDraft.name} onChange={(event) => setPriceListDraft((current) => ({ ...current, name: event.target.value }))} placeholder={t("VIP BKK customer")} /></label>
                <label className={styles.inputGroup}><span><T>Currency</T></span><input required minLength={3} maxLength={3} value={priceListDraft.currency} onChange={(event) => setPriceListDraft((current) => ({ ...current, currency: event.target.value }))} /></label>
                <label className={styles.commerceCheck}><input type="checkbox" checked={priceListDraft.is_no_price} onChange={(event) => setPriceListDraft((current) => ({ ...current, is_no_price: event.target.checked }))} /><span><strong><T>No Price list</T></strong><small><T>Catalogues using this list never expose prices.</T></small></span></label>
                <label className={`${styles.inputGroup} ${styles.commerceFullField}`}><span><T>Description</T></span><textarea rows={4} maxLength={320} value={priceListDraft.description} onChange={(event) => setPriceListDraft((current) => ({ ...current, description: event.target.value }))} /></label>
                <button className={`${styles.primaryButton} ${styles.commerceFullField}`} type="submit" disabled={isSaving}><T>Create price list</T></button>
              </form>
            </section>
          )}
        </>
      )}

      {reviewing && (
        <div className={styles.editorBackdrop} role="presentation">
          <section className={styles.reviewDialog} role="dialog" aria-modal="true" aria-labelledby="review-price-title">
            <div className={styles.commercePanelHeader}><div><span><T>Price approval</T></span><h3 id="review-price-title">{t("Review {{product}}", { product: reviewing.product_name })}</h3></div><button type="button" onClick={() => setReviewing(null)}>×</button></div>
            <div className={styles.reviewSummary}><div><span><T>Current price</T></span><strong>{formatMoney(reviewing.current_amount, locale, reviewing.currency)}</strong></div><div><span><T>Proposed price</T></span><strong>{formatMoney(reviewing.proposed_amount, locale, reviewing.currency)}</strong></div></div>
            <p><strong><T>Requester’s reason:</T></strong> {reviewing.reason}</p>
            <label className={styles.inputGroup}><span><T>Review note</T></span><textarea rows={4} maxLength={500} value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} placeholder={t("Optional approval note, or explain a rejection.")} /></label>
            <div className={styles.commerceFormActions}><button className={styles.dangerButton} type="button" disabled={isSaving} onClick={() => void reviewRequest(false)}><T>Reject</T></button><button className={styles.primaryButton} type="button" disabled={isSaving} onClick={() => void reviewRequest(true)}><T>Approve price</T></button></div>
          </section>
        </div>
      )}
    </>
  );
}
