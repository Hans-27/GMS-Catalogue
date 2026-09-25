"use client";
import { T, useLanguage } from "@/lib/i18n";
/* eslint-disable @next/next/no-img-element */

import {
  PointerEvent as ReactPointerEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  API_ORIGIN,
  ApiError,
  deleteCatalogueCoverAsset,
  getCatalogueCover,
  publishCatalogueCover,
  resetCatalogueCover,
  updateCatalogueCover,
  updateCatalogueCoverAsset,
  uploadCatalogueCoverAsset,
  type CatalogueCover,
  type CatalogueCoverAsset,
  type CatalogueCoverAssetType,
} from "@/lib/api";
import { applicationBranding } from "@/lib/branding";
import { formatApiDate } from "@/lib/date-time";
import styles from "@/features/catalogues/cover-editor.module.css";

type Props = {
  catalogueId: string;
  initialCover: CatalogueCover;
  canUpload: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canPublish: boolean;
  onChanged: (cover: CatalogueCover) => void;
  onPublishCatalogue: () => Promise<boolean>;
  onToast: (message: string) => void;
};

type PreviewMode = "desktop" | "tablet" | "mobile" | "a4";
type DragTarget =
  { kind: "title" } | { kind: "subtitle" } | { kind: "asset"; id: string };

const ASSET_LABELS: Record<CatalogueCoverAssetType, string> = {
  full_cover: "Full cover image",
  background: "Background image",
  brand_logo: "Brand logo",
  secondary_logo: "Secondary / company logo",
  decorative_image: "Decorative image",
};
const POSITION_PRESETS: Record<string, [number, number]> = {
  "top-left": [12, 12],
  "top-center": [50, 12],
  "top-right": [88, 12],
  "center-left": [12, 50],
  center: [50, 50],
  "center-right": [88, 50],
  "bottom-left": [12, 88],
  "bottom-center": [50, 88],
  "bottom-right": [88, 88],
};

function url(path: string) {
  return path.startsWith("http") ? path : `${API_ORIGIN}${path}`;
}

function bounded(value: number) {
  return Math.max(0, Math.min(100, value));
}

function settingPayload(cover: CatalogueCover) {
  return {
    cover_mode: cover.cover_mode,
    catalogue_name: cover.catalogue_name,
    catalogue_year: cover.catalogue_year,
    subtitle: cover.subtitle,
    company_name: cover.company_name,
    collection_name: cover.collection_name,
    background_color: cover.background_color,
    overlay_color: cover.overlay_color,
    overlay_opacity: cover.overlay_opacity,
    background_fit: cover.background_fit,
    show_catalogue_name: cover.show_catalogue_name,
    show_catalogue_year: cover.show_catalogue_year,
    show_subtitle: cover.show_subtitle,
    show_brand_logo: cover.show_brand_logo,
    show_company_logo: cover.show_company_logo,
    show_start_button: cover.show_start_button,
    title_color: cover.title_color,
    title_font_size: cover.title_font_size,
    title_alignment: cover.title_alignment,
    title_position_x_percent: cover.title_position_x_percent,
    title_position_y_percent: cover.title_position_y_percent,
    title_width_percent: cover.title_width_percent,
    title_z_index: cover.title_z_index,
    subtitle_color: cover.subtitle_color,
    subtitle_font_size: cover.subtitle_font_size,
    subtitle_position_x_percent: cover.subtitle_position_x_percent,
    subtitle_position_y_percent: cover.subtitle_position_y_percent,
    cover_alt_text: cover.cover_alt_text,
  };
}

function fileSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function activeAsset(cover: CatalogueCover, type: CatalogueCoverAssetType) {
  return cover.assets.find((asset) => asset.asset_type === type);
}

export function CoverEditor({
  catalogueId,
  initialCover,
  canUpload,
  canEdit,
  canDelete,
  canPublish,
  onChanged,
  onPublishCatalogue,
  onToast,
}: Props) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState(initialCover);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);

  const background = activeAsset(
    draft,
    draft.cover_mode === "full_image" ? "full_cover" : "background",
  );
  const brandAsset = activeAsset(draft, "brand_logo");
  const companyAsset = activeAsset(draft, "secondary_logo");
  const showDefaultLogo =
    (draft.show_brand_logo && !brandAsset) ||
    (draft.show_company_logo && Boolean(brandAsset) && !companyAsset);
  const overlayAssets = useMemo(
    () =>
      draft.assets
        .filter(
          (asset) => !["background", "full_cover"].includes(asset.asset_type),
        )
        .sort((a, b) => a.z_index - b.z_index),
    [draft.assets],
  );
  const selectedAsset =
    draft.assets.find((asset) => asset.id === selectedAssetId) ||
    overlayAssets[0];

  function updateField<K extends keyof CatalogueCover>(
    field: K,
    value: CatalogueCover[K],
  ) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function updateLocalAsset(id: string, values: Partial<CatalogueCoverAsset>) {
    setDraft((current) => ({
      ...current,
      assets: current.assets.map((asset) =>
        asset.id === id ? { ...asset, ...values } : asset,
      ),
    }));
  }

  function setPreset(
    target: "title" | "subtitle" | CatalogueCoverAsset,
    preset: string,
  ) {
    const position = POSITION_PRESETS[preset];
    if (!position) return;
    if (target === "title")
      setDraft((current) => ({
        ...current,
        title_position_x_percent: position[0],
        title_position_y_percent: position[1],
      }));
    else if (target === "subtitle")
      setDraft((current) => ({
        ...current,
        subtitle_position_x_percent: position[0],
        subtitle_position_y_percent: position[1],
      }));
    else
      updateLocalAsset(target.id, {
        position_x_percent: position[0],
        position_y_percent: position[1],
      });
  }

  function drag(event: ReactPointerEvent, target: DragTarget) {
    if (!canEdit || !previewRef.current) return;
    event.preventDefault();
    const rect = previewRef.current.getBoundingClientRect();
    const move = (pointer: PointerEvent) => {
      const x = bounded(((pointer.clientX - rect.left) / rect.width) * 100);
      const y = bounded(((pointer.clientY - rect.top) / rect.height) * 100);
      if (target.kind === "title")
        setDraft((current) => ({
          ...current,
          title_position_x_percent: x,
          title_position_y_percent: y,
        }));
      else if (target.kind === "subtitle")
        setDraft((current) => ({
          ...current,
          subtitle_position_x_percent: x,
          subtitle_position_y_percent: y,
        }));
      else
        updateLocalAsset(target.id, {
          position_x_percent: x,
          position_y_percent: y,
        });
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }

  function resize(event: ReactPointerEvent, asset: CatalogueCoverAsset) {
    if (!canEdit || !previewRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = previewRef.current.getBoundingClientRect();
    const startX = event.clientX;
    const startWidth = asset.width_percent;
    const startHeight = asset.height_percent;
    const move = (pointer: PointerEvent) => {
      const delta = ((pointer.clientX - startX) / rect.width) * 100;
      const width = Math.max(2, Math.min(100, startWidth + delta));
      const scale = width / startWidth;
      updateLocalAsset(asset.id, {
        width_percent: width,
        height_percent: Math.max(2, Math.min(100, startHeight * scale)),
      });
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }

  async function reload() {
    const value = await getCatalogueCover(catalogueId);
    if (value) {
      setDraft(value);
      onChanged(value);
    }
    return value;
  }

  async function upload(type: CatalogueCoverAssetType, file?: File) {
    if (!file) return;
    const allowed = new Set([
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/svg+xml",
    ]);
    if (!allowed.has(file.type) || file.size > 20 * 1024 * 1024) {
      setError(
        t("Choose a PNG, JPG, JPEG, WebP, or safe SVG image up to 20 MB."),
      );
      return;
    }
    setBusy(`upload-${type}`);
    setError("");
    try {
      await uploadCatalogueCoverAsset(
        catalogueId,
        type,
        file,
        `${ASSET_LABELS[type]} for ${draft.catalogue_name}`,
      );
      await reload();
      onToast(t("{{asset}} uploaded.", { asset: t(ASSET_LABELS[type]) }));
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? t(caught.message)
          : t("The image could not be uploaded."),
      );
    } finally {
      setBusy("");
    }
  }

  async function remove(asset: CatalogueCoverAsset) {
    if (
      !window.confirm(
        t("Remove {{asset}}? You can restore it from asset history.", {
          asset: t(ASSET_LABELS[asset.asset_type]),
        }),
      )
    )
      return;
    setBusy(`delete-${asset.id}`);
    setError("");
    try {
      await deleteCatalogueCoverAsset(catalogueId, asset.id);
      await reload();
      onToast(
        t("{{asset}} removed.", { asset: t(ASSET_LABELS[asset.asset_type]) }),
      );
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? t(caught.message)
          : t("The asset could not be removed."),
      );
    } finally {
      setBusy("");
    }
  }

  async function save(message = "Cover changes saved as draft.") {
    setBusy("save");
    setError("");
    try {
      await updateCatalogueCover(catalogueId, settingPayload(draft));
      await Promise.all(
        draft.assets.map((asset) =>
          updateCatalogueCoverAsset(catalogueId, asset.id, {
            alt_text: asset.alt_text,
            position_x_percent: asset.position_x_percent,
            position_y_percent: asset.position_y_percent,
            width_percent: asset.width_percent,
            height_percent: asset.height_percent,
            opacity: asset.opacity,
            rotation: asset.rotation,
            z_index: asset.z_index,
          }),
        ),
      );
      const saved = await reload();
      if (saved) onToast(message);
      return saved;
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? t(caught.message)
          : t("The cover could not be saved."),
      );
      return null;
    } finally {
      setBusy("");
    }
  }

  async function reset() {
    if (
      !window.confirm(
        t(
          "Reset positions and styling to the responsive default layout? Uploaded images will be kept.",
        ),
      )
    )
      return;
    setBusy("reset");
    setError("");
    try {
      const value = await resetCatalogueCover(catalogueId);
      setDraft(value);
      onChanged(value);
      onToast(t("Cover layout reset."));
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? t(caught.message)
          : t("The layout could not be reset."),
      );
    } finally {
      setBusy("");
    }
  }

  async function restore(asset: CatalogueCoverAsset) {
    setBusy(`restore-${asset.id}`);
    setError("");
    try {
      await updateCatalogueCoverAsset(catalogueId, asset.id, { restore: true });
      await reload();
      onToast(
        t("Previous {{asset}} restored.", {
          asset: t(ASSET_LABELS[asset.asset_type]),
        }),
      );
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? t(caught.message)
          : t("The previous image could not be restored."),
      );
    } finally {
      setBusy("");
    }
  }

  async function deletePrevious(asset: CatalogueCoverAsset) {
    if (
      !window.confirm(
        t(
          "Delete this previous image permanently? This action cannot be undone.",
        ),
      )
    )
      return;
    setBusy(`purge-${asset.id}`);
    setError("");
    try {
      await deleteCatalogueCoverAsset(catalogueId, asset.id, true);
      await reload();
      onToast(t("Previous image permanently deleted."));
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? t(caught.message)
          : t("The previous image could not be deleted."),
      );
    } finally {
      setBusy("");
    }
  }

  async function publish() {
    if (
      !window.confirm(
        t("Publish this cover in a new immutable catalogue version now?"),
      )
    )
      return;
    const saved = await save("Cover changes saved.");
    if (!saved) return;
    setBusy("publish");
    try {
      await publishCatalogueCover(catalogueId);
      if (await onPublishCatalogue())
        onToast(t("Cover published in a new immutable catalogue version."));
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? t(caught.message)
          : t("The cover could not be published."),
      );
    } finally {
      setBusy("");
    }
  }

  function modeChanged(mode: CatalogueCover["cover_mode"]) {
    setDraft((current) => ({
      ...current,
      cover_mode: mode,
      ...(mode === "full_image"
        ? {
            show_catalogue_name: false,
            show_catalogue_year: false,
            show_subtitle: false,
            show_brand_logo: false,
          }
        : {}),
    }));
  }

  const titleTransform =
    draft.title_alignment === "center"
      ? "translateX(-50%)"
      : draft.title_alignment === "right"
        ? "translateX(-100%)"
        : "none";

  return (
    <section className={styles.editor}>
      <header className={styles.editorHeader}>
        <div>
          <span>
            <T>COVER PAGE EDITOR</T>
          </span>
          <h3>
            <T>Build a configurable first page</T>
          </h3>
          <p>
            <T>
              Upload your own artwork and branding. Drag the title and logos
              directly on the preview; positions are stored as responsive
              percentages.
            </T>
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canEdit || Boolean(busy)}
          >
            <T>Save Draft</T>
          </button>
          <button
            type="button"
            onClick={() => void save("Cover changes saved.")}
            disabled={!canEdit || Boolean(busy)}
          >
            <T>Save Changes</T>
          </button>
          {canPublish && (
            <button
              className={styles.primary}
              type="button"
              onClick={() => void publish()}
              disabled={Boolean(busy)}
            >
              <T>Publish Cover</T>
            </button>
          )}
        </div>
      </header>
      {error && (
        <div className={styles.error} role="alert">
          {error}
          <button type="button" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}

      <div className={styles.workspace}>
        <div className={styles.previewColumn}>
          <div className={styles.previewToolbar}>
            <div>
              {(["desktop", "tablet", "mobile", "a4"] as PreviewMode[]).map(
                (mode) => (
                  <button
                    key={mode}
                    type="button"
                    data-active={previewMode === mode}
                    onClick={() => setPreviewMode(mode)}
                  >
                    {t(
                      mode === "a4"
                        ? "A4 PDF"
                        : mode[0].toUpperCase() + mode.slice(1),
                    )}
                  </button>
                ),
              )}
            </div>
            <div>
              <button
                type="button"
                onClick={() => previewRef.current?.requestFullscreen()}
              >
                <T>Full screen</T>
              </button>
              <button
                type="button"
                onClick={() => void reset()}
                disabled={!canEdit || Boolean(busy)}
              >
                <T>Reset layout</T>
              </button>
            </div>
          </div>
          <div className={styles.previewStage} data-mode={previewMode}>
            <div
              ref={previewRef}
              className={styles.coverCanvas}
              style={{ backgroundColor: draft.background_color }}
              aria-label={
                draft.cover_alt_text || `${draft.catalogue_name} cover`
              }
            >
              {background && (
                <img
                  className={styles.background}
                  src={url(background.preview_url || background.file_url)}
                  alt={background.alt_text}
                  style={{
                    objectFit:
                      draft.background_fit === "contain" ? "contain" : "cover",
                    objectPosition: `${background.position_x_percent}% ${background.position_y_percent}%`,
                  }}
                />
              )}
              <i
                className={styles.overlay}
                style={{
                  backgroundColor: draft.overlay_color,
                  opacity: draft.overlay_opacity,
                }}
              />
              {showDefaultLogo && (
                <img
                  className={styles.defaultLogo}
                  src={applicationBranding.defaultLogo}
                  alt={applicationBranding.logoAlt}
                  title={t(
                    "Default company logo; upload a brand or secondary logo to override it",
                  )}
                  data-secondary={Boolean(brandAsset)}
                />
              )}
              {overlayAssets.map((asset) => {
                const hidden =
                  (asset.asset_type === "brand_logo" &&
                    !draft.show_brand_logo) ||
                  (asset.asset_type === "secondary_logo" &&
                    !draft.show_company_logo);
                if (hidden) return null;
                return (
                  <div
                    key={asset.id}
                    className={styles.movableAsset}
                    data-selected={selectedAssetId === asset.id}
                    style={{
                      left: `${asset.position_x_percent}%`,
                      top: `${asset.position_y_percent}%`,
                      width: `${asset.width_percent}%`,
                      height: `${asset.height_percent}%`,
                      opacity: asset.opacity,
                      transform: `translate(-50%,-50%) rotate(${asset.rotation}deg)`,
                      zIndex: asset.z_index,
                    }}
                    onPointerDown={(event) => {
                      setSelectedAssetId(asset.id);
                      drag(event, { kind: "asset", id: asset.id });
                    }}
                  >
                    <img
                      src={url(asset.preview_url || asset.file_url)}
                      alt={asset.alt_text}
                      draggable={false}
                    />
                    <button
                      className={styles.resizeHandle}
                      type="button"
                      aria-label={`Resize ${ASSET_LABELS[asset.asset_type]}`}
                      onPointerDown={(event) => resize(event, asset)}
                    />
                  </div>
                );
              })}
              {(draft.show_catalogue_name || draft.show_catalogue_year) && (
                <div
                  className={styles.coverTitle}
                  style={{
                    left: `${draft.title_position_x_percent}%`,
                    top: `${draft.title_position_y_percent}%`,
                    width: `${draft.title_width_percent}%`,
                    color: draft.title_color,
                    fontSize: `${draft.title_font_size}px`,
                    textAlign: draft.title_alignment,
                    transform: titleTransform,
                    zIndex: draft.title_z_index,
                  }}
                  onPointerDown={(event) => drag(event, { kind: "title" })}
                >
                  {draft.show_catalogue_name && (
                    <strong>{draft.catalogue_name}</strong>
                  )}
                  {draft.show_catalogue_year && draft.catalogue_year && (
                    <strong>{draft.catalogue_year}</strong>
                  )}
                </div>
              )}
              {draft.show_subtitle && draft.subtitle && (
                <p
                  className={styles.coverSubtitle}
                  style={{
                    left: `${draft.subtitle_position_x_percent}%`,
                    top: `${draft.subtitle_position_y_percent}%`,
                    color: draft.subtitle_color,
                    fontSize: `${draft.subtitle_font_size}px`,
                    textAlign: draft.title_alignment,
                    transform: titleTransform,
                  }}
                  onPointerDown={(event) => drag(event, { kind: "subtitle" })}
                >
                  {draft.subtitle}
                </p>
              )}
              {draft.show_start_button && (
                <span className={styles.startPreview}>
                  <T>Start Catalogue</T>
                </span>
              )}
            </div>
          </div>
          <p className={styles.previewHint}>
            <T>
              Drag a logo or text block to reposition it. Select a logo and drag
              its lower-right handle to resize while preserving its aspect
              ratio.
            </T>
          </p>
        </div>

        <div className={styles.controls}>
          <fieldset disabled={!canEdit}>
            <legend>
              <T>Cover mode and identity</T>
            </legend>
            <label>
              <span>
                <T>Cover mode</T>
              </span>
              <select
                value={draft.cover_mode}
                onChange={(event) =>
                  modeChanged(
                    event.target.value as CatalogueCover["cover_mode"],
                  )
                }
              >
                <option value="custom">
                  <T>Custom cover builder</T>
                </option>
                <option value="full_image">
                  <T>Full finished cover image</T>
                </option>
              </select>
            </label>
            <label>
              <span>
                <T>Catalogue name</T>
              </span>
              <input
                value={draft.catalogue_name}
                maxLength={220}
                onChange={(event) =>
                  updateField("catalogue_name", event.target.value)
                }
              />
            </label>
            <div className={styles.twoColumns}>
              <label>
                <span>
                  <T>Catalogue year</T>
                </span>
                <input
                  value={draft.catalogue_year}
                  maxLength={12}
                  onChange={(event) =>
                    updateField("catalogue_year", event.target.value)
                  }
                />
              </label>
              <label>
                <span>
                  <T>Collection name</T>
                </span>
                <input
                  value={draft.collection_name}
                  maxLength={220}
                  onChange={(event) =>
                    updateField("collection_name", event.target.value)
                  }
                />
              </label>
            </div>
            <label>
              <span>
                <T>Subtitle</T>
              </span>
              <input
                value={draft.subtitle}
                maxLength={320}
                onChange={(event) =>
                  updateField("subtitle", event.target.value)
                }
              />
            </label>
            <label>
              <span>
                <T>Optional company name</T>
              </span>
              <input
                value={draft.company_name}
                maxLength={220}
                onChange={(event) =>
                  updateField("company_name", event.target.value)
                }
              />
            </label>
            <label>
              <span>
                <T>Cover alternative text</T>
              </span>
              <input
                value={draft.cover_alt_text}
                maxLength={255}
                onChange={(event) =>
                  updateField("cover_alt_text", event.target.value)
                }
              />
            </label>
          </fieldset>

          <fieldset disabled={!canEdit}>
            <legend>
              <T>Background and overlay</T>
            </legend>
            <div className={styles.threeColumns}>
              <label>
                <span>
                  <T>Background</T>
                </span>
                <input
                  type="color"
                  value={draft.background_color.slice(0, 7)}
                  onChange={(event) =>
                    updateField("background_color", event.target.value)
                  }
                />
              </label>
              <label>
                <span>
                  <T>Overlay</T>
                </span>
                <input
                  type="color"
                  value={draft.overlay_color.slice(0, 7)}
                  onChange={(event) =>
                    updateField("overlay_color", event.target.value)
                  }
                />
              </label>
              <label>
                <span>
                  <T>Fit</T>
                </span>
                <select
                  value={draft.background_fit}
                  onChange={(event) =>
                    updateField(
                      "background_fit",
                      event.target.value as CatalogueCover["background_fit"],
                    )
                  }
                >
                  <option value="cover">
                    <T>Cover</T>
                  </option>
                  <option value="contain">
                    <T>Contain</T>
                  </option>
                  <option value="full-page">
                    <T>Full page</T>
                  </option>
                </select>
              </label>
            </div>
            <label>
              <span>
                <T>Overlay opacity ·</T>{" "}
                {Math.round(draft.overlay_opacity * 100)}%
              </span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={draft.overlay_opacity}
                onChange={(event) =>
                  updateField("overlay_opacity", Number(event.target.value))
                }
              />
            </label>
            {background && (
              <div className={styles.twoColumns}>
                <label>
                  <span>
                    <T>Crop focus X ·</T>{" "}
                    {Math.round(background.position_x_percent)}%
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={background.position_x_percent}
                    onChange={(event) =>
                      updateLocalAsset(background.id, {
                        position_x_percent: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  <span>
                    <T>Crop focus Y ·</T>{" "}
                    {Math.round(background.position_y_percent)}%
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={background.position_y_percent}
                    onChange={(event) =>
                      updateLocalAsset(background.id, {
                        position_y_percent: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
            )}
          </fieldset>

          <fieldset disabled={!canEdit}>
            <legend>
              <T>Display options</T>
            </legend>
            <div className={styles.checkGrid}>
              {(
                [
                  ["show_catalogue_name", "Catalogue name"],
                  ["show_catalogue_year", "Catalogue year"],
                  ["show_subtitle", "Subtitle"],
                  ["show_brand_logo", "Brand logo"],
                  ["show_company_logo", "Company logo"],
                  ["show_start_button", "Start Catalogue button"],
                ] as Array<[keyof CatalogueCover, string]>
              ).map(([field, label]) => (
                <label className={styles.check} key={field}>
                  <input
                    type="checkbox"
                    checked={Boolean(draft[field])}
                    onChange={(event) =>
                      updateField(field, event.target.checked as never)
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset disabled={!canEdit}>
            <legend>
              <T>Title and subtitle styling</T>
            </legend>
            <div className={styles.threeColumns}>
              <label>
                <span>
                  <T>Title color</T>
                </span>
                <input
                  type="color"
                  value={draft.title_color.slice(0, 7)}
                  onChange={(event) =>
                    updateField("title_color", event.target.value)
                  }
                />
              </label>
              <label>
                <span>
                  <T>Title size</T>
                </span>
                <input
                  type="number"
                  min="16"
                  max="180"
                  value={draft.title_font_size}
                  onChange={(event) =>
                    updateField("title_font_size", Number(event.target.value))
                  }
                />
              </label>
              <label>
                <span>
                  <T>Alignment</T>
                </span>
                <select
                  value={draft.title_alignment}
                  onChange={(event) =>
                    updateField(
                      "title_alignment",
                      event.target.value as CatalogueCover["title_alignment"],
                    )
                  }
                >
                  <option value="left">
                    <T>Left</T>
                  </option>
                  <option value="center">
                    <T>Center</T>
                  </option>
                  <option value="right">
                    <T>Right</T>
                  </option>
                </select>
              </label>
            </div>
            <div className={styles.threeColumns}>
              <label>
                <span>
                  <T>Title position</T>
                </span>
                <select
                  defaultValue="custom"
                  onChange={(event) => setPreset("title", event.target.value)}
                >
                  <option value="custom">
                    <T>Custom</T>
                  </option>
                  {Object.keys(POSITION_PRESETS).map((name) => (
                    <option key={name} value={name}>
                      {name.replaceAll("-", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>
                  <T>Title X ·</T> {Math.round(draft.title_position_x_percent)}%
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={draft.title_position_x_percent}
                  onChange={(event) =>
                    updateField(
                      "title_position_x_percent",
                      Number(event.target.value),
                    )
                  }
                />
              </label>
              <label>
                <span>
                  <T>Title Y ·</T> {Math.round(draft.title_position_y_percent)}%
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={draft.title_position_y_percent}
                  onChange={(event) =>
                    updateField(
                      "title_position_y_percent",
                      Number(event.target.value),
                    )
                  }
                />
              </label>
            </div>
            <div className={styles.twoColumns}>
              <label>
                <span>
                  <T>Title width ·</T> {Math.round(draft.title_width_percent)}%
                </span>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={draft.title_width_percent}
                  onChange={(event) =>
                    updateField(
                      "title_width_percent",
                      Number(event.target.value),
                    )
                  }
                />
              </label>
              <label>
                <span>
                  <T>Title layer</T>
                </span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={draft.title_z_index}
                  onChange={(event) =>
                    updateField("title_z_index", Number(event.target.value))
                  }
                />
              </label>
            </div>
            <div className={styles.twoColumns}>
              <label>
                <span>
                  <T>Subtitle color</T>
                </span>
                <input
                  type="color"
                  value={draft.subtitle_color.slice(0, 7)}
                  onChange={(event) =>
                    updateField("subtitle_color", event.target.value)
                  }
                />
              </label>
              <label>
                <span>
                  <T>Subtitle size</T>
                </span>
                <input
                  type="number"
                  min="8"
                  max="96"
                  value={draft.subtitle_font_size}
                  onChange={(event) =>
                    updateField(
                      "subtitle_font_size",
                      Number(event.target.value),
                    )
                  }
                />
              </label>
            </div>
            <div className={styles.threeColumns}>
              <label>
                <span>
                  <T>Subtitle position</T>
                </span>
                <select
                  defaultValue="custom"
                  onChange={(event) =>
                    setPreset("subtitle", event.target.value)
                  }
                >
                  <option value="custom">
                    <T>Custom</T>
                  </option>
                  {Object.keys(POSITION_PRESETS).map((name) => (
                    <option key={name} value={name}>
                      {name.replaceAll("-", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>
                  <T>Subtitle X ·</T>{" "}
                  {Math.round(draft.subtitle_position_x_percent)}%
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={draft.subtitle_position_x_percent}
                  onChange={(event) =>
                    updateField(
                      "subtitle_position_x_percent",
                      Number(event.target.value),
                    )
                  }
                />
              </label>
              <label>
                <span>
                  <T>Subtitle Y ·</T>{" "}
                  {Math.round(draft.subtitle_position_y_percent)}%
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={draft.subtitle_position_y_percent}
                  onChange={(event) =>
                    updateField(
                      "subtitle_position_y_percent",
                      Number(event.target.value),
                    )
                  }
                />
              </label>
            </div>
          </fieldset>
          {selectedAsset && (
            <fieldset disabled={!canEdit}>
              <legend>
                <T>Selected image ·</T> {ASSET_LABELS[selectedAsset.asset_type]}
              </legend>
              <label>
                <span>
                  <T>Edit image</T>
                </span>
                <select
                  value={selectedAsset.id}
                  onChange={(event) => setSelectedAssetId(event.target.value)}
                >
                  {overlayAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {ASSET_LABELS[asset.asset_type]}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.threeColumns}>
                <label>
                  <span>
                    <T>Position preset</T>
                  </span>
                  <select
                    defaultValue="custom"
                    onChange={(event) =>
                      setPreset(selectedAsset, event.target.value)
                    }
                  >
                    <option value="custom">
                      <T>Custom</T>
                    </option>
                    {Object.keys(POSITION_PRESETS).map((name) => (
                      <option key={name} value={name}>
                        {name.replaceAll("-", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>
                    <T>X ·</T> {Math.round(selectedAsset.position_x_percent)}%
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={selectedAsset.position_x_percent}
                    onChange={(event) =>
                      updateLocalAsset(selectedAsset.id, {
                        position_x_percent: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  <span>
                    <T>Y ·</T> {Math.round(selectedAsset.position_y_percent)}%
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={selectedAsset.position_y_percent}
                    onChange={(event) =>
                      updateLocalAsset(selectedAsset.id, {
                        position_y_percent: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <div className={styles.twoColumns}>
                <label>
                  <span>
                    <T>Width ·</T> {Math.round(selectedAsset.width_percent)}%
                  </span>
                  <input
                    type="range"
                    min="2"
                    max="100"
                    value={selectedAsset.width_percent}
                    onChange={(event) => {
                      const width = Number(event.target.value);
                      const scale = width / selectedAsset.width_percent;
                      updateLocalAsset(selectedAsset.id, {
                        width_percent: width,
                        height_percent: Math.max(
                          2,
                          Math.min(100, selectedAsset.height_percent * scale),
                        ),
                      });
                    }}
                  />
                </label>
                <label>
                  <span>
                    <T>Height ·</T> {Math.round(selectedAsset.height_percent)}%
                  </span>
                  <input
                    type="range"
                    min="2"
                    max="100"
                    value={selectedAsset.height_percent}
                    onChange={(event) =>
                      updateLocalAsset(selectedAsset.id, {
                        height_percent: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <div className={styles.threeColumns}>
                <label>
                  <span>
                    <T>Opacity ·</T> {Math.round(selectedAsset.opacity * 100)}%
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={selectedAsset.opacity}
                    onChange={(event) =>
                      updateLocalAsset(selectedAsset.id, {
                        opacity: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  <span>
                    <T>Rotation</T>
                  </span>
                  <input
                    type="number"
                    min="-180"
                    max="180"
                    value={selectedAsset.rotation}
                    onChange={(event) =>
                      updateLocalAsset(selectedAsset.id, {
                        rotation: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  <span>
                    <T>Layer</T>
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={selectedAsset.z_index}
                    onChange={(event) =>
                      updateLocalAsset(selectedAsset.id, {
                        z_index: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <label>
                <span>
                  <T>Image alternative text</T>
                </span>
                <input
                  value={selectedAsset.alt_text}
                  maxLength={255}
                  onChange={(event) =>
                    updateLocalAsset(selectedAsset.id, {
                      alt_text: event.target.value,
                    })
                  }
                />
              </label>
              <div className={styles.layerActions}>
                <button
                  type="button"
                  onClick={() =>
                    updateLocalAsset(selectedAsset.id, {
                      z_index: Math.max(0, selectedAsset.z_index - 1),
                    })
                  }
                >
                  <T>Move backward</T>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateLocalAsset(selectedAsset.id, {
                      z_index: Math.min(100, selectedAsset.z_index + 1),
                    })
                  }
                >
                  <T>Move forward</T>
                </button>
              </div>
            </fieldset>
          )}
        </div>
      </div>

      <section className={styles.assets}>
        <header>
          <div>
            <span>
              <T>MEDIA LIBRARY</T>
            </span>
            <h4>
              <T>Cover images and logos</T>
            </h4>
          </div>
          <small>
            <T>PNG, JPG, JPEG, WebP, or sanitized SVG · 20 MB maximum</T>
          </small>
        </header>
        <div className={styles.assetGrid}>
          {(draft.cover_mode === "full_image"
            ? ["full_cover", "brand_logo", "secondary_logo", "decorative_image"]
            : ["background", "brand_logo", "secondary_logo", "decorative_image"]
          ).map((type) => {
            const assetType = type as CatalogueCoverAssetType;
            const asset = activeAsset(draft, assetType);
            return (
              <article className={styles.assetCard} key={assetType}>
                {asset ? (
                  <>
                    <img
                      src={url(asset.preview_url || asset.file_url)}
                      alt={asset.alt_text}
                    />
                    <div>
                      <strong>{ASSET_LABELS[assetType]}</strong>
                      <span title={asset.original_filename}>
                        {asset.original_filename}
                      </span>
                      <small>
                        {fileSize(asset.file_size)} · {asset.width} ×{" "}
                        {asset.height}
                        <T>px</T>
                      </small>
                      <small>
                        <T>Uploaded</T>{" "}
                        {formatApiDate(asset.created_at, undefined, {
                          dateStyle: "medium",
                        })}{" "}
                        <T>by</T> {asset.uploaded_by_name || "System user"}
                      </small>
                    </div>
                    <footer>
                      {canUpload && (
                        <label>
                          <input
                            type="file"
                            accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
                            onChange={(event) =>
                              void upload(assetType, event.target.files?.[0])
                            }
                          />
                          {t(
                            busy === `upload-${assetType}`
                              ? "Uploading…"
                              : "Replace",
                          )}
                        </label>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => void remove(asset)}
                          disabled={Boolean(busy)}
                        >
                          <T>Remove</T>
                        </button>
                      )}
                    </footer>
                  </>
                ) : (
                  <label
                    className={styles.dropZone}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (canUpload)
                        void upload(assetType, event.dataTransfer.files[0]);
                    }}
                  >
                    <input
                      disabled={!canUpload}
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={(event) =>
                        void upload(assetType, event.target.files?.[0])
                      }
                    />
                    <b>＋</b>
                    <strong>
                      {busy === `upload-${assetType}`
                        ? t("Uploading…")
                        : t("Upload {{asset}}", {
                            asset: t(ASSET_LABELS[assetType]),
                          })}
                    </strong>
                    <small>
                      <T>Drop image here or browse files</T>
                    </small>
                  </label>
                )}
              </article>
            );
          })}
        </div>
        {draft.asset_history.length > 0 && (
          <details className={styles.history}>
            <summary>
              <T>Previous images (</T>
              {draft.asset_history.length})
            </summary>
            <div>
              {draft.asset_history.map((asset) => (
                <article key={asset.id}>
                  <img
                    src={url(asset.preview_url || asset.file_url)}
                    alt={asset.alt_text}
                  />
                  <span>
                    <b>{ASSET_LABELS[asset.asset_type]}</b>
                    <small>
                      {asset.original_filename} ·{" "}
                      {formatApiDate(asset.created_at, undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </small>
                  </span>
                  {(canEdit || canDelete) && (
                    <div className={styles.historyActions}>
                      {canEdit && (
                        <button
                      type="button"
                      onClick={() => void restore(asset)}
                      disabled={Boolean(busy)}
                    >
                      {t(
                        busy === `restore-${asset.id}`
                          ? "Restoring…"
                          : "Restore",
                      )}
                        </button>
                      )}
                      {canDelete && (
                        <button
                          className={styles.dangerButton}
                          type="button"
                          onClick={() => void deletePrevious(asset)}
                          disabled={Boolean(busy)}
                        >
                          {t(
                            busy === `purge-${asset.id}`
                              ? "Deleting..."
                              : "Delete",
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </details>
        )}
      </section>
    </section>
  );
}
