"use client";

import { T, useLanguage } from "@/lib/i18n";
import styles from "./dashboard.module.css";

export function ProductLifecycleBadge({
  status,
}: {
  status: "active" | "inactive";
}) {
  const { t } = useLanguage();
  return (
    <span className={styles.lifecycleBadge} data-status={status}>
      <i />
      {t(status === "active" ? "Active" : "Inactive")}
    </span>
  );
}

export function ProductStatusDialog({
  nextStatus,
  reason,
  note,
  saving,
  onReason,
  onNote,
  onCancel,
  onConfirm,
}: {
  nextStatus: "active" | "inactive";
  reason: string;
  note: string;
  saving: boolean;
  onReason: (value: string) => void;
  onNote: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useLanguage();
  const isOtherMissing =
    nextStatus === "inactive" && reason === "other" && !note.trim();
  return (
    <div
      className={styles.statusDialog}
      role="dialog"
      aria-modal="true"
      aria-label={t(
        nextStatus === "inactive"
          ? "Mark product inactive"
          : "Reactivate product",
      )}
    >
      <div>
        <h3>
          {t(
            nextStatus === "inactive"
              ? "Mark product inactive?"
              : "Reactivate product?",
          )}
        </h3>
        <p>
          {t(
            nextStatus === "inactive"
              ? "This product will be hidden from customer-facing catalogues, catalogue search, PDF, print, and public links. The product record will remain available in the administration system."
              : "This product may become visible again in catalogues where it is still assigned.",
          )}
        </p>
        {nextStatus === "inactive" && (
          <label>
            <T>Inactive reason</T>
            <select
              value={reason}
              onChange={(event) => onReason(event.target.value)}
            >
              <option value="discontinued">
                <T>Discontinued</T>
              </option>
              <option value="temporarily_unavailable">
                <T>Temporarily unavailable</T>
              </option>
              <option value="replaced">
                <T>Replaced by another product</T>
              </option>
              <option value="no_longer_supplied">
                <T>No longer supplied</T>
              </option>
              <option value="duplicate">
                <T>Duplicate product</T>
              </option>
              <option value="incomplete_information">
                <T>Incomplete product information</T>
              </option>
              <option value="other">
                <T>Other</T>
              </option>
            </select>
          </label>
        )}
        <label>
          {t(nextStatus === "inactive" ? "Internal note" : "Reactivation note")}
          <textarea
            value={note}
            required={isOtherMissing}
            onChange={(event) => onNote(event.target.value)}
          />
        </label>
        <footer>
          <button type="button" onClick={onCancel}>
            <T>Cancel</T>
          </button>
          <button
            type="button"
            disabled={saving || isOtherMissing}
            onClick={onConfirm}
          >
            {t(saving ? "Saving..." : "Confirm")}
          </button>
        </footer>
      </div>
    </div>
  );
}
