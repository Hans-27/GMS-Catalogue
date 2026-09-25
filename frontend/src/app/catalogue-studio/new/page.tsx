"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getBrands,
  getPriceLists,
  getPromotionOccasions,
  type Brand,
  type PriceList,
  type PromotionOccasion,
} from "@/lib/api";
import {
  createStudioDesign,
  getStudioTemplates,
  updateStudioPage,
  uploadStudioAsset,
  type StudioCreatePayload,
  type StudioTemplate,
} from "@/lib/studio-api";
import styles from "../studio.module.css";

const PAGE_SIZES = {
  a4_portrait: [794, 1123],
  a4_landscape: [1123, 794],
  square: [1080, 1080],
  landscape_16_9: [1600, 900],
  custom: [1000, 1000],
} as const;

const WORKFLOWS = [
  {
    value: "blank",
    title: "Blank catalogue",
    description: "Start with a clean editable page and add ERP products in Studio.",
  },
  {
    value: "template",
    title: "Use a template",
    description: "Begin with an approved company template or one of your saved designs.",
  },
  {
    value: "artwork",
    title: "Upload finished artwork",
    description: "Use a PNG, JPG, or WebP design as a complete image-only page.",
  },
] as const;

const STEP_LABELS = ["Starting point", "Details", "Content & review"] as const;

type Workflow = (typeof WORKFLOWS)[number]["value"];
type PageSize = keyof typeof PAGE_SIZES;
type CatalogueType = "standard" | "booklet" | "promotion";
type TemplateSource = "company" | "mine";
type BrandSelection = "all" | "single" | "multiple";
type Step = 1 | 2 | 3;
type PriceOption = { value: string; priceListId: number; label: string };

function WorkflowIcon({ workflow }: { workflow: Workflow }) {
  if (workflow === "template") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 4h16v16H4zM8 4v16M8 9h12" />
      </svg>
    );
  }
  if (workflow === "artwork") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 16V3m0 0L7 8m5-5 5 5M4 15v5h16v-5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function pageSizeLabel(size: PageSize) {
  const labels: Record<PageSize, string> = {
    a4_portrait: "A4 portrait",
    a4_landscape: "A4 landscape",
    square: "Square",
    landscape_16_9: "16:9 landscape",
    custom: "Custom size",
  };
  return labels[size];
}

function catalogueTypeLabel(type: CatalogueType) {
  if (type === "booklet") return "Digital booklet";
  if (type === "promotion") return "Promotion catalogue";
  return "Standard catalogue";
}

function NewStudioDesignForm() {
  const router = useRouter();
  const search = useSearchParams();
  const requestedTemplateId = search.get("templateId") || "";

  const [step, setStep] = useState<Step>(1);
  const [workflow, setWorkflow] = useState<Workflow>(
    requestedTemplateId ? "template" : "blank",
  );
  const [templateSource, setTemplateSource] = useState<TemplateSource>("company");
  const [templateId, setTemplateId] = useState(requestedTemplateId);
  const [artwork, setArtwork] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [catalogueType, setCatalogueType] = useState<CatalogueType>("standard");
  const [size, setSize] = useState<PageSize>("a4_portrait");
  const [customWidth, setCustomWidth] = useState(1000);
  const [customHeight, setCustomHeight] = useState(1000);
  const [keepSynchronized, setKeepSynchronized] = useState(true);

  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandSelection, setBrandSelection] = useState<BrandSelection>("all");
  const [brandIds, setBrandIds] = useState<number[]>([]);
  const [brandSearch, setBrandSearch] = useState("");
  const [prices, setPrices] = useState<PriceList[]>([]);
  const [showPrices, setShowPrices] = useState(false);
  const [slot1, setSlot1] = useState("");
  const [slot2, setSlot2] = useState("");

  const [occasions, setOccasions] = useState<PromotionOccasion[]>([]);
  const [occasionId, setOccasionId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [terms, setTerms] = useState("");
  const [templates, setTemplates] = useState<StudioTemplate[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      getBrands(),
      getPriceLists(),
      getPromotionOccasions(),
      getStudioTemplates(),
    ]).then(([brandResult, priceResult, occasionResult, templateResult]) => {
      if (!active) return;
      if (brandResult.status === "fulfilled") {
        setBrands(brandResult.value.filter((item) => item.is_active));
      }
      if (priceResult.status === "fulfilled") {
        setPrices(priceResult.value.filter((item) => item.is_active));
      }
      if (occasionResult.status === "fulfilled") {
        setOccasions(occasionResult.value.filter((item) => item.is_active));
      }
      if (templateResult.status === "fulfilled") {
        setTemplates(templateResult.value);
        const requested = templateResult.value.find(
          (item) => item.id === requestedTemplateId,
        );
        if (requested) {
          setTemplateSource(requested.is_company_template ? "company" : "mine");
        }
      }
      setOptionsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [requestedTemplateId]);

  const visibleTemplates = useMemo(
    () =>
      templates.filter((template) =>
        templateSource === "company"
          ? template.is_company_template && template.approval_status === "approved"
          : !template.is_company_template,
      ),
    [templateSource, templates],
  );

  const priceOptions = useMemo<PriceOption[]>(() => {
    const available = prices.filter(
      (price) => !price.is_no_price && price.code.toUpperCase() !== "NO_PRICE",
    );
    const options = available.map((price) => ({
      value: String(price.id),
      priceListId: price.id,
      label: price.name,
    }));
    const vip = available.find(
      (price) =>
        price.code.toUpperCase() === "VIP" || price.name.toLowerCase() === "vip bkk",
    );
    if (vip && !options.some((option) => option.label.toLowerCase() === "vip province")) {
      const index = options.findIndex((option) => option.priceListId === vip.id);
      options.splice(index + 1, 0, {
        value: `vip-province:${vip.id}`,
        priceListId: vip.id,
        label: "VIP Province",
      });
    }
    return options;
  }, [prices]);

  const selectedPrices = useMemo(
    () =>
      [slot1, slot2]
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index)
        .map((value) => priceOptions.find((option) => option.value === value))
        .filter((option): option is PriceOption => Boolean(option)),
    [priceOptions, slot1, slot2],
  );

  const filteredBrands = useMemo(() => {
    const query = brandSearch.trim().toLowerCase();
    if (!query) return brands;
    return brands.filter((brand) =>
      `${brand.name} ${brand.code}`.toLowerCase().includes(query),
    );
  }, [brandSearch, brands]);

  const selectedTemplate = templates.find((template) => template.id === templateId);
  const selectedBrandNames = brands
    .filter((brand) => brandIds.includes(brand.id))
    .map((brand) => brand.name);

  function chooseWorkflow(nextWorkflow: Workflow) {
    const leavingArtwork = workflow === "artwork" && nextWorkflow !== "artwork";
    setWorkflow(nextWorkflow);
    setError("");
    if (nextWorkflow !== "template") setTemplateId("");
    if (nextWorkflow !== "artwork") setArtwork(null);
    if (nextWorkflow === "artwork") {
      setKeepSynchronized(false);
      setBrandSelection("all");
      setBrandIds([]);
      setShowPrices(false);
      setSlot1("");
      setSlot2("");
    } else if (leavingArtwork) {
      setKeepSynchronized(true);
    }
  }

  function chooseTemplateSource(source: TemplateSource) {
    setTemplateSource(source);
    setTemplateId("");
  }

  function chooseBrandSelection(selection: BrandSelection) {
    setBrandSelection(selection);
    if (selection === "all") setBrandIds([]);
    if (selection === "single") setBrandIds((current) => current.slice(0, 1));
  }

  function toggleBrand(id: number) {
    setBrandIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      return brandSelection === "single" ? [id] : [...current, id];
    });
  }

  function validateCurrentStep() {
    if (step === 1 && workflow === "template" && !templateId) {
      setError("Select a template before continuing.");
      return false;
    }
    if (step === 1 && workflow === "artwork" && !artwork) {
      setError("Choose a PNG, JPG, or WebP file before continuing.");
      return false;
    }
    if (step === 2 && !name.trim()) {
      setError("Enter a catalogue name before continuing.");
      return false;
    }
    return true;
  }

  function validateReview() {
    if (workflow !== "artwork") {
      if (brandSelection === "single" && brandIds.length !== 1) {
        setError("Choose one brand or use all authorized brands.");
        return false;
      }
      if (brandSelection === "multiple" && brandIds.length < 2) {
        setError("Choose at least two brands for a multi-brand catalogue.");
        return false;
      }
      if (showPrices && !slot1) {
        setError("Choose the primary customer price or turn prices off.");
        return false;
      }
    }
    if (catalogueType === "promotion") {
      if (!startAt || !endAt) {
        setError("Choose the promotion start and end time.");
        return false;
      }
      if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
        setError("The promotion end time must be after its start time.");
        return false;
      }
    }
    return true;
  }

  function nextStep() {
    setError("");
    if (!validateCurrentStep()) return;
    setStep((current) => Math.min(3, current + 1) as Step);
  }

  function previousStep() {
    setError("");
    setStep((current) => Math.max(1, current - 1) as Step);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 3) {
      nextStep();
      return;
    }
    setError("");
    if (!validateReview()) return;

    setSaving(true);
    const preset = PAGE_SIZES[size];
    const pageWidth = size === "custom" ? customWidth : preset[0];
    const pageHeight = size === "custom" ? customHeight : preset[1];
    const orientation =
      pageWidth === pageHeight ? "square" : pageWidth > pageHeight ? "landscape" : "portrait";
    const imageOnly = workflow === "artwork";
    const startMode: NonNullable<StudioCreatePayload["start_mode"]> =
      workflow === "template"
        ? templateSource === "company"
          ? "system_template"
          : "my_template"
        : workflow === "artwork"
          ? "upload_template"
          : "blank";
    const payloadBrandMode = brandSelection === "multiple" ? "multiple" : "single";

    try {
      const design = await createStudioDesign({
        name: name.trim(),
        size_preset: size,
        page_width: pageWidth,
        page_height: pageHeight,
        orientation,
        data_mode: imageOnly || !keepSynchronized ? "snapshot" : "live",
        catalogue_id: imageOnly ? null : search.get("catalogueId"),
        start_mode: startMode,
        template_id: workflow === "template" ? templateId : null,
        catalogue_type: catalogueType,
        brand_mode: imageOnly ? "single" : payloadBrandMode,
        brand_ids: imageOnly || brandSelection === "all" ? [] : brandIds,
        price_slots:
          imageOnly || !showPrices
            ? []
            : selectedPrices.map((option, index) => ({
                slot_number: (index + 1) as 1 | 2,
                price_list_id: option.priceListId,
                display_label: option.label,
                currency_display: "code" as const,
                decimal_places: 2,
                is_visible: true,
              })),
        promotion:
          catalogueType === "promotion"
            ? {
                promotion_name: name.trim(),
                occasion_id: occasionId ? Number(occasionId) : null,
                start_at: new Date(startAt).toISOString(),
                end_at: new Date(endAt).toISOString(),
                timezone: "Asia/Bangkok",
                priority: 50,
                terms,
              }
            : null,
      });

      if (imageOnly && artwork) {
        const asset = await uploadStudioAsset(
          artwork,
          "template_background",
          `${name.trim()} artwork`,
        );
        const page = design.pages[0];
        if (!page) throw new Error("The catalogue page could not be prepared.");
        await updateStudioPage(design.id, page.id, {
          page_data: {
            ...page.page_data_json,
            elements: [
              ...(page.page_data_json.elements || []),
              {
                id: crypto.randomUUID(),
                type: "background",
                name: "Uploaded finished artwork",
                xPercent: 0,
                yPercent: 0,
                widthPercent: 100,
                heightPercent: 100,
                rotation: 0,
                opacity: 1,
                zIndex: -1000,
                locked: true,
                visible: true,
                assetId: asset.id,
                style: { objectFit: "contain" },
                responsive: {},
              },
            ],
          },
          expected_revision: design.revision,
        });
      }

      router.push(`/catalogue-studio/${design.id}/editor`);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not create the catalogue design.",
      );
      setSaving(false);
    }
  }

  return (
    <main className={styles.studioHome}>
      <header className={styles.studioHeader}>
        <Link
          className={styles.studioTitleLink}
          href="/dashboard"
          aria-label="Back to Dashboard"
        >
          GMS · Catalogue Studio
        </Link>
        <Link href="/catalogue-studio">My Designs</Link>
      </header>

      <form
        className={`${styles.newForm} ${styles.creationWizard} ${styles.stepWizard}`}
        onSubmit={submit}
      >
        <span>NEW CATALOGUE</span>
        <h1>Create a catalogue</h1>
        <p>Make the three decisions below. Everything else can be changed later in Studio.</p>

        <nav className={styles.wizardProgress} aria-label="Catalogue setup progress">
          {STEP_LABELS.map((label, index) => {
            const stepNumber = (index + 1) as Step;
            return (
              <button
                key={label}
                type="button"
                data-active={step === stepNumber}
                data-complete={step > stepNumber}
                onClick={() => {
                  if (stepNumber >= step) return;
                  setError("");
                  setStep(stepNumber);
                }}
              >
                <b>{step > stepNumber ? "✓" : stepNumber}</b>
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        {error && (
          <p role="alert" className={styles.errorBanner}>
            {error}
          </p>
        )}

        {step === 1 && (
          <section className={styles.wizardPanel}>
            <header>
              <h2>How do you want to begin?</h2>
              <p>Choose one starting point. This only controls the first page.</p>
            </header>
            <fieldset className={styles.startChoices}>
              <legend className={styles.srOnly}>Starting point</legend>
              {WORKFLOWS.map((option) => (
                <label key={option.value} data-selected={workflow === option.value}>
                  <input
                    aria-label={option.title}
                    type="radio"
                    name="workflow"
                    checked={workflow === option.value}
                    onChange={() => chooseWorkflow(option.value)}
                  />
                  <span className={styles.startChoiceIcon}>
                    <WorkflowIcon workflow={option.value} />
                  </span>
                  <strong>{option.title}</strong>
                  <small>{option.description}</small>
                  <span className={styles.startChoiceCheck}>✓</span>
                </label>
              ))}
            </fieldset>

            {workflow === "template" && (
              <div className={styles.wizardDecision}>
                <div className={styles.wizardSegmented} aria-label="Template source">
                  <button
                    type="button"
                    data-active={templateSource === "company"}
                    onClick={() => chooseTemplateSource("company")}
                  >
                    Company templates
                  </button>
                  <button
                    type="button"
                    data-active={templateSource === "mine"}
                    onClick={() => chooseTemplateSource("mine")}
                  >
                    My templates
                  </button>
                </div>
                <label>
                  Select template
                  <select
                    required
                    value={templateId}
                    disabled={optionsLoading}
                    onChange={(event) => setTemplateId(event.target.value)}
                  >
                    <option value="">
                      {optionsLoading
                        ? "Loading templates…"
                        : visibleTemplates.length
                          ? "Choose a template"
                          : "No templates available"}
                    </option>
                    {visibleTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} · version {template.version}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {workflow === "artwork" && (
              <label className={styles.wizardUpload} data-has-file={Boolean(artwork)}>
                <span>{artwork ? "Artwork ready" : "Choose finished artwork"}</span>
                <strong>{artwork?.name || "PNG, JPG, or WebP"}</strong>
                <small>The complete image will remain visible and fit inside the page.</small>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => setArtwork(event.target.files?.[0] || null)}
                />
              </label>
            )}
          </section>
        )}

        {step === 2 && (
          <section className={styles.wizardPanel}>
            <header>
              <h2>Name and format</h2>
              <p>Choose how the catalogue will be presented to customers.</p>
            </header>
            <div className={styles.formColumns}>
              <label>
                Catalogue name
                <input
                  required
                  autoFocus
                  maxLength={220}
                  placeholder="For example: September Product Catalogue"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label>
                Catalogue type
                <select
                  aria-label="Catalogue type"
                  value={catalogueType}
                  onChange={(event) => setCatalogueType(event.target.value as CatalogueType)}
                >
                  <option value="standard">Standard catalogue</option>
                  <option value="booklet">Digital booklet</option>
                  <option value="promotion">Promotion catalogue</option>
                </select>
                <small>
                  {catalogueType === "booklet"
                    ? "Interactive page-turning preview with a single-page mobile view."
                    : catalogueType === "promotion"
                      ? "Includes a customer campaign schedule."
                      : "Best for normal screen viewing and PDF export."}
                </small>
              </label>
              <label>
                Page size
                <select
                  aria-label="Page size"
                  value={size}
                  onChange={(event) => setSize(event.target.value as PageSize)}
                >
                  <option value="a4_portrait">A4 portrait</option>
                  <option value="a4_landscape">A4 landscape</option>
                  <option value="square">Square</option>
                  <option value="landscape_16_9">16:9 landscape</option>
                  <option value="custom">Custom size</option>
                </select>
              </label>
              {workflow !== "artwork" && (
                <label className={styles.wizardSwitch}>
                  <input
                    type="checkbox"
                    checked={keepSynchronized}
                    onChange={(event) => setKeepSynchronized(event.target.checked)}
                  />
                  <span>
                    <strong>Keep ERP prices and product details synchronized</strong>
                    <small>Stock always stays live. Turn off to keep prices and product details fixed.</small>
                  </span>
                </label>
              )}
            </div>
            {size === "custom" && (
              <div className={styles.formColumns}>
                <label>
                  Width in pixels
                  <input
                    aria-label="Width in pixels"
                    type="number"
                    min="200"
                    max="10000"
                    value={customWidth}
                    onChange={(event) => setCustomWidth(Number(event.target.value))}
                  />
                </label>
                <label>
                  Height in pixels
                  <input
                    aria-label="Height in pixels"
                    type="number"
                    min="200"
                    max="10000"
                    value={customHeight}
                    onChange={(event) => setCustomHeight(Number(event.target.value))}
                  />
                </label>
              </div>
            )}
          </section>
        )}

        {step === 3 && (
          <section className={styles.wizardPanel}>
            <header>
              <h2>Content and review</h2>
              <p>
                {workflow === "artwork"
                  ? "Your artwork is ready. Review the final settings before opening Studio."
                  : "Choose which products and prices are available, then create the catalogue."}
              </p>
            </header>

            {workflow !== "artwork" && (
              <>
                <fieldset>
                  <legend>Products</legend>
                  <div className={styles.wizardScopeChoices}>
                    <label data-selected={brandSelection === "all"}>
                      <input
                        type="radio"
                        name="brandSelection"
                        checked={brandSelection === "all"}
                        onChange={() => chooseBrandSelection("all")}
                      />
                      <span>
                        <strong>All authorized brands</strong>
                        <small>Recommended. Use every brand you can access.</small>
                      </span>
                    </label>
                    <label data-selected={brandSelection === "single"}>
                      <input
                        aria-label="One brand"
                        type="radio"
                        name="brandSelection"
                        checked={brandSelection === "single"}
                        onChange={() => chooseBrandSelection("single")}
                      />
                      <span>
                        <strong>One brand</strong>
                        <small>Create a focused brand catalogue.</small>
                      </span>
                    </label>
                    <label data-selected={brandSelection === "multiple"}>
                      <input
                        aria-label="Selected brands"
                        type="radio"
                        name="brandSelection"
                        checked={brandSelection === "multiple"}
                        onChange={() => chooseBrandSelection("multiple")}
                      />
                      <span>
                        <strong>Selected brands</strong>
                        <small>Combine two or more brands.</small>
                      </span>
                    </label>
                  </div>

                  {brandSelection !== "all" && (
                    <div className={styles.wizardBrandPicker}>
                      <div>
                        <input
                          aria-label="Search brands"
                          placeholder="Search brands by name or code"
                          value={brandSearch}
                          onChange={(event) => setBrandSearch(event.target.value)}
                        />
                        <span>{brandIds.length} selected</span>
                      </div>
                      <AssociateBrands
                        brands={filteredBrands}
                        selectedIds={brandIds}
                        single={brandSelection === "single"}
                        onToggle={toggleBrand}
                      />
                    </div>
                  )}
                </fieldset>

                <fieldset>
                  <legend>Customer prices</legend>
                  <label className={styles.wizardSwitch}>
                    <input
                      type="checkbox"
                      checked={showPrices}
                      onChange={(event) => {
                        setShowPrices(event.target.checked);
                        if (!event.target.checked) {
                          setSlot1("");
                          setSlot2("");
                        }
                      }}
                    />
                    <span>
                      <strong>Show customer prices</strong>
                      <small>Leave off when this catalogue should not display prices.</small>
                    </span>
                  </label>
                  {showPrices && (
                    <div className={styles.formColumns}>
                      <label>
                        Primary price
                        <select
                          aria-label="Primary price"
                          value={slot1}
                          onChange={(event) => setSlot1(event.target.value)}
                        >
                          <option value="">Choose a price</option>
                          {priceOptions.map((price) => (
                            <option key={price.value} value={price.value}>
                              {price.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Second price <small>(optional)</small>
                        <select
                          aria-label="Second price"
                          value={slot2}
                          onChange={(event) => setSlot2(event.target.value)}
                        >
                          <option value="">None</option>
                          {priceOptions.map((price) => (
                            <option key={price.value} value={price.value} disabled={price.value === slot1}>
                              {price.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                </fieldset>
              </>
            )}

            {catalogueType === "promotion" && (
              <fieldset>
                <legend>Promotion schedule</legend>
                <div className={styles.formColumns}>
                  <label>
                    Start date and time
                    <input
                      required
                      aria-label="Start date and time"
                      type="datetime-local"
                      value={startAt}
                      onChange={(event) => setStartAt(event.target.value)}
                    />
                  </label>
                  <label>
                    End date and time
                    <input
                      required
                      aria-label="End date and time"
                      type="datetime-local"
                      value={endAt}
                      onChange={(event) => setEndAt(event.target.value)}
                    />
                  </label>
                  <label>
                    Occasion <small>(optional)</small>
                    <select value={occasionId} onChange={(event) => setOccasionId(event.target.value)}>
                      <option value="">Custom occasion</option>
                      {occasions.map((occasion) => (
                        <option key={occasion.id} value={occasion.id}>
                          {occasion.name_en}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  Terms and conditions <small>(optional)</small>
                  <textarea value={terms} onChange={(event) => setTerms(event.target.value)} />
                </label>
              </fieldset>
            )}

            <aside className={styles.wizardReview} aria-label="Catalogue review">
              <header>
                <strong>Ready to create</strong>
                <span>{name}</span>
              </header>
              <div className={styles.wizardReviewGrid}>
                <div><small>Starting point</small><b>{workflow === "template" ? selectedTemplate?.name || "Template" : workflow === "artwork" ? artwork?.name || "Artwork" : "Blank page"}</b></div>
                <div><small>Format</small><b>{catalogueTypeLabel(catalogueType)}</b></div>
                <div><small>Page</small><b>{pageSizeLabel(size)}</b></div>
                <div><small>Products</small><b>{workflow === "artwork" ? "Image only" : brandSelection === "all" ? "All authorized brands" : selectedBrandNames.join(", ") || "Not selected"}</b></div>
                <div><small>Prices</small><b>{workflow === "artwork" || !showPrices ? "Hidden" : selectedPrices.map((price) => price.label).join(" + ") || "Not selected"}</b></div>
                <div><small>ERP updates</small><b>{workflow === "artwork" ? "Artwork only" : keepSynchronized ? "Live stock, prices and details" : "Live stock · fixed prices and details"}</b></div>
              </div>
            </aside>
          </section>
        )}

        <footer>
          <div>
            {step > 1 ? (
              <button type="button" className={styles.secondaryAction} onClick={previousStep}>
                Back
              </button>
            ) : (
              <Link href="/catalogue-studio">Cancel</Link>
            )}
          </div>
          <span>Step {step} of 3</span>
          <button type="submit" disabled={saving}>
            {saving ? "Creating…" : step === 3 ? "Create and open Studio" : "Continue"}
          </button>
        </footer>
      </form>
    </main>
  );
}

function AssociateBrandOption({
  brand,
  selected,
  single,
  onToggle,
}: {
  brand: Brand;
  selected: boolean;
  single: boolean;
  onToggle: (id: number) => void;
}) {
  return (
    <label data-selected={selected}>
      <input
        aria-label={brand.name}
        type={single ? "radio" : "checkbox"}
        name={single ? "selectedBrand" : undefined}
        checked={selected}
        onChange={() => onToggle(brand.id)}
      />
      {brand.name}
      <small>{brand.code}</small>
    </label>
  );
}

function AssociateBrands({
  brands,
  selectedIds,
  single,
  onToggle,
}: {
  brands: Brand[];
  selectedIds: number[];
  single: boolean;
  onToggle: (id: number) => void;
}) {
  if (!brands.length) return <p className={styles.wizardEmpty}>No matching brands available.</p>;
  return (
    <div className={styles.brandChoiceGrid}>
      {brands.map((brand) => (
        <AssociateBrandOption
          key={brand.id}
          brand={brand}
          selected={selectedIds.includes(brand.id)}
          single={single}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

export default function NewStudioDesign() {
  return (
    <Suspense fallback={<main className={styles.studioLoading}>Preparing catalogue setup…</main>}>
      <NewStudioDesignForm />
    </Suspense>
  );
}
