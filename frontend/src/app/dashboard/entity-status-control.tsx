"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n";
import styles from "./entity-status-control.module.css";

type EntityStatusControlProps = {
  entityType: "brand" | "category" | "product";
  entityName: string;
  isActive: boolean;
  disabled?: boolean;
  inactiveReason?: string | null;
  onChange: (isActive: boolean, reason: string) => Promise<void>;
};

export function EntityStatusControl({
  entityType,
  entityName,
  isActive,
  disabled = false,
  inactiveReason,
  onChange,
}: EntityStatusControlProps) {
  const { t } = useLanguage();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState("");

  async function enable() {
    setSaving(true);
    try {
      await onChange(true, "");
    } catch {
      // The parent surfaces API errors in the dashboard alert region.
    } finally {
      setSaving(false);
    }
  }

  function requestChange() {
    if (isActive) {
      setReason("");
      setDialogError("");
      setDialogOpen(true);
      return;
    }
    void enable();
  }

  async function disable() {
    const normalizedReason = reason.trim();
    if (!normalizedReason) return;
    setSaving(true);
    setDialogError("");
    try {
      await onChange(false, normalizedReason);
      setDialogOpen(false);
      setReason("");
    } catch (error) {
      setDialogError(
        error instanceof Error
          ? error.message
          : t(`Could not disable this ${entityType}.`),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        className={styles.control}
        type="button"
        role="switch"
        aria-checked={isActive}
        aria-label={`${entityName} ${entityType} status`}
        disabled={disabled || saving}
        onClick={requestChange}
        title={
          inactiveReason
            ? `${t("Disabled")}: ${inactiveReason}`
            : t(isActive ? `Disable ${entityType}` : `Enable ${entityType}`)
        }
      >
        <span className={styles.track} aria-hidden="true">
          <span />
        </span>
        <span className={styles.visuallyHidden}>
          {t(isActive ? "Active" : "Inactive")}.{" "}
        </span>
        <span>{saving ? t("Saving...") : t(isActive ? "Disable" : "Enable")}</span>
      </button>

      {dialogOpen && (
        <div
          className={styles.backdrop}
          role="presentation"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !saving) setDialogOpen(false);
          }}
        >
          <section
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-label={`Disable ${entityType}`}
          >
            <span className={styles.eyebrow}>{t("Catalogue visibility")}</span>
            <h3>{t(`Disable ${entityType}`)}</h3>
            <p>
              {t("{{name}} will be hidden from all customer-facing catalogues. The record remains available to administrators.", {
                name: entityName,
              })}
            </p>
            <label>
              <span>{t("Reason for disabling")}</span>
              <textarea
                autoFocus
                required
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t("Explain why this item should not appear in catalogues")}
              />
            </label>
            {dialogError && <div className={styles.error}>{dialogError}</div>}
            <footer>
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                onClick={() => void disable()}
                disabled={saving || !reason.trim()}
              >
                {saving ? t("Saving...") : t(`Disable ${entityType}`)}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
