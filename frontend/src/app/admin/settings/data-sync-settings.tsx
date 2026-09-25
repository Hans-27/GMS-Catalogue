"use client";
import { T, useLanguage } from "@/lib/i18n";

import { useCallback, useEffect, useState } from "react";
import { canAccess } from "@/lib/access";
import {
  API_ORIGIN,
  ApiError,
  getProductSyncHistory,
  getProductSyncStatus,
  runProductSync,
  type AuthenticatedUser,
  type ProductSyncRun,
  type ProductSyncStatus,
} from "@/lib/api";
import styles from "./settings.module.css";
import { formatApiDate } from "@/lib/date-time";

function date(value: string | null, locale: string) {
  return value
    ? formatApiDate(value, locale, {
        dateStyle: "medium",
        timeStyle: "medium",
      })
    : "Not available";
}

export function DataSyncSettingsView({ user }: { user: AuthenticatedUser }) {
  const { locale, t } = useLanguage();
  const [status, setStatus] = useState<ProductSyncStatus | null>(null);
  const [history, setHistory] = useState<ProductSyncRun[]>([]);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<ProductSyncRun | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextStatus, nextHistory] = await Promise.all([
        getProductSyncStatus(),
        getProductSyncHistory(),
      ]);
      setStatus(nextStatus);
      setHistory(nextHistory);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Synchronization status is unavailable.",
      );
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 30000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [load]);

  async function syncNow() {
    setRunning(true);
    setError("");
    try {
      await runProductSync();
      await load();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Synchronization could not be started.",
      );
    } finally {
      setRunning(false);
    }
  }

  if (!status)
    return (
      <section className={styles.panel}>
        {error || t("Loading synchronization status...")}
      </section>
    );
  const busy = running || status.status === "running";
  return (
    <>
      <section
        className={styles.healthBanner}
        data-status={
          status.stale_level === "fresh" ? "healthy" : status.stale_level
        }
      >
        <div>
          <span>
            <T>PRODUCT SOURCE DATA</T>
          </span>
          <h2>{t(status.status.replaceAll("_", " "))}</h2>
          <p>
            {t(
              status.data_is_stale
                ? "Stock and price information may be outdated."
                : "Stock and price information is current.",
            )}
          </p>
        </div>
        <b>{status.stale_level === "fresh" ? "✓" : "!"}</b>
      </section>
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
      <section className={styles.panel}>
        <header>
          <div>
            <span>
              <T>DEDICATED WORKER</T>
            </span>
            <h3>
              <T>Automatic product synchronization</T>
            </h3>
            <p>
              <T>Reads approved stock and price fields from MSSQL, then waits</T>{" "}
              {status.interval_seconds} <T>seconds before the next run.</T>
            </p>
          </div>
          {canAccess(user, "data_sync.run") && (
            <button
              type="button"
              onClick={() => void syncNow()}
              disabled={busy}
            >
              {t(
                busy
                  ? "Synchronization running..."
                  : status.status === "failed"
                    ? "Retry Failed Sync"
                    : "Sync Now",
              )}
            </button>
          )}
        </header>
        <div className={styles.syncGrid}>
          <article>
            <span>
              <T>Last successful</T>
            </span>
            <strong>{date(status.last_successful_sync, locale)}</strong>
          </article>
          <article>
            <span>
              <T>Next scheduled</T>
            </span>
            <strong>{busy ? t("After current sync completes") : date(status.next_scheduled_sync, locale)}</strong>
          </article>
          <article>
            <span>
              <T>Source connection</T>
            </span>
            <strong>
              {t(status.source_database_status.replaceAll("_", " "))}
            </strong>
          </article>
          <article>
            <span>
              <T>Interval / batch</T>
            </span>
            <strong>
              {status.interval_seconds}
              <T>s /</T> {status.batch_size}
            </strong>
          </article>
          <article>
            <span>
              <T>Products read</T>
            </span>
            <strong>{status.records_read.toLocaleString()}</strong>
          </article>
          <article>
            <span>
              <T>Products updated</T>
            </span>
            <strong>{status.products_updated.toLocaleString()}</strong>
          </article>
          <article>
            <span>
              <T>Stock changes</T>
            </span>
            <strong>{status.stock_values_updated.toLocaleString()}</strong>
          </article>
          <article>
            <span>
              <T>Price changes</T>
            </span>
            <strong>{status.price_values_updated.toLocaleString()}</strong>
          </article>
          <article>
            <span>
              <T>Missing from source</T>
            </span>
            <strong>{status.products_missing.toLocaleString()}</strong>
          </article>
          <article>
            <span>
              <T>Duration</T>
            </span>
            <strong>
              {status.duration_seconds === null
                ? "—"
                : `${status.duration_seconds.toFixed(1)}s`}
            </strong>
          </article>
        </div>
      </section>
      <section className={styles.panel}>
        <header>
          <div>
            <span>
              <T>RUN HISTORY</T>
            </span>
            <h3>
              <T>Recent synchronization runs</T>
            </h3>
            <p>
              <T>
                Unchanged records do not create price history or audit noise.
              </T>
            </p>
          </div>
        </header>
        <div className={styles.historyTable}>
          <div>
            <b>
              <T>Started</T>
            </b>
            <b>
              <T>Trigger</T>
            </b>
            <b>
              <T>Status</T>
            </b>
            <b>
              <T>Read</T>
            </b>
            <b>
              <T>Updated</T>
            </b>
            <b>
              <T>Stock</T>
            </b>
            <b>
              <T>Prices</T>
            </b>
            <b>
              <T>Missing</T>
            </b>
          </div>
          {history.map((run) => (
            <div
              key={run.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(run)}
              onKeyDown={(event) => {
                if (event.key === "Enter") setSelected(run);
              }}
            >
              <span>{date(run.started_at, locale)}</span>
              <span>{t(run.trigger)}</span>
              <span>
                <i data-status={run.status}>
                  {t(run.status.replaceAll("_", " "))}
                </i>
              </span>
              <span>{run.rows_read}</span>
              <span>{run.rows_updated}</span>
              <span>{run.stock_values_updated}</span>
              <span>{run.price_values_updated}</span>
              <span>{run.products_missing}</span>
              {run.error_summary && <small>{run.error_summary}</small>}
            </div>
          ))}
        </div>
      </section>
      {selected && (
        <section className={styles.panel}>
          <header>
            <div>
              <span>
                <T>RUN DETAILS</T>
              </span>
              <h3>{t(selected.status.replaceAll("_", " "))}</h3>
              <p>
                <T>Run</T> {selected.id} · {date(selected.started_at, locale)} ·{" "}
                {selected.duration_seconds?.toFixed(1) ?? "—"} <T>seconds ·</T>{" "}
                {selected.retry_count} <T>retries</T>
              </p>
            </div>
            <div className={styles.syncActions}>
              {selected.error_summary && (
                <a
                  href={`${API_ORIGIN}/api/v1/admin/data-sync/history/${selected.id}/errors.csv`}
                >
                  <T>Download Error Report</T>
                </a>
              )}
              <button type="button" onClick={() => setSelected(null)}>
                <T>Close details</T>
              </button>
            </div>
          </header>
          {selected.error_summary && (
            <div className={styles.error}>{selected.error_summary}</div>
          )}
        </section>
      )}
    </>
  );
}
