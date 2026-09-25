"use client";
import { T, useLanguage } from "@/lib/i18n";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  getErpConnection,
  getErpSyncRuns,
  getErpTables,
  previewErpProducts,
  saveErpConnection,
  syncErpProducts,
  testErpConnection,
  type ErpConnection,
  type ErpPreview,
  type ErpSyncRun,
} from "@/lib/api";
import styles from "./settings.module.css";
import { formatApiDate } from "@/lib/date-time";

type Draft = {
  name: string;
  server: string;
  port: number;
  database_name: string;
  username: string;
  password: string;
  is_enabled: boolean;
  connection_timeout_seconds: number;
};

const EMPTY: Draft = {
  name: "GMS ERP",
  server: "",
  port: 1433,
  database_name: "",
  username: "",
  password: "",
  is_enabled: true,
  connection_timeout_seconds: 10,
};

function date(value: string | null | undefined, locale: string, never: string) {
  return value ? formatApiDate(value, locale, { dateStyle: "medium", timeStyle: "short" }) : never;
}

function valueText(value: unknown, language: "en" | "th") {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? (language === "th" ? "ใช่" : "Yes") : (language === "th" ? "ไม่" : "No");
  return String(value);
}

export function ErpSettingsView() {
  const { language, locale, t } = useLanguage();
  const [connection, setConnection] = useState<ErpConnection | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [showPassword, setShowPassword] = useState(false);
  const [preview, setPreview] = useState<ErpPreview | null>(null);
  const [tables, setTables] = useState<Array<{ schema_name: string; table_name: string }>>([]);
  const [runs, setRuns] = useState<ErpSyncRun[]>([]);
  const [tableSearch, setTableSearch] = useState("");
  const [syncLimit, setSyncLimit] = useState(25000);
  const [includeDiscontinued, setIncludeDiscontinued] = useState(true);
  const [busy, setBusy] = useState<"" | "save" | "test" | "preview" | "tables" | "sync">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const [setting, history] = await Promise.all([getErpConnection(), getErpSyncRuns()]);
    setConnection(setting);
    setRuns(history);
    setDraft({
      name: setting.name,
      server: setting.server,
      port: setting.port,
      database_name: setting.database_name,
      username: setting.username,
      password: "",
      is_enabled: setting.is_enabled,
      connection_timeout_seconds: setting.connection_timeout_seconds,
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((caught) => setError(caught instanceof Error ? caught.message : t("ERP settings could not be loaded.")));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load, t]);

  const filteredTables = useMemo(() => {
    const search = tableSearch.trim().toLocaleLowerCase();
    return tables.filter((item) => !search || `${item.schema_name}.${item.table_name}`.toLocaleLowerCase().includes(search));
  }, [tableSearch, tables]);

  function failure(caught: unknown, fallback: string) {
    setError(caught instanceof ApiError ? caught.message : fallback);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy("save"); setError(""); setNotice("");
    try {
      const setting = await saveErpConnection({ ...draft, password: draft.password || null });
      setConnection(setting);
      setDraft((current) => ({ ...current, password: "" }));
      setNotice(t("ERP connection settings saved. Run Test connection before synchronizing."));
    } catch (caught) { failure(caught, t("ERP settings could not be saved.")); }
    finally { setBusy(""); }
  }

  async function test() {
    setBusy("test"); setError(""); setNotice("");
    try {
      const result = await testErpConnection();
      setNotice(t("Connected to {{server}} in {{milliseconds}} ms. {{count}} ERP products found.", { server: result.server_name || "SQL Server", milliseconds: result.latency_ms, count: result.product_count?.toLocaleString(locale) || 0 }));
      await load();
    } catch (caught) { failure(caught, t("The ERP connection test failed.")); }
    finally { setBusy(""); }
  }

  async function openPreview() {
    setBusy("preview"); setError(""); setNotice("");
    try { setPreview(await previewErpProducts(20, includeDiscontinued)); }
    catch (caught) { failure(caught, t("ERP product preview could not be loaded.")); }
    finally { setBusy(""); }
  }

  async function discoverTables() {
    setBusy("tables"); setError("");
    try { setTables(await getErpTables()); }
    catch (caught) { failure(caught, t("ERP tables could not be discovered.")); }
    finally { setBusy(""); }
  }

  async function synchronize() {
    if (!window.confirm(t("Import up to {{count}} ERP products into the catalogue database? Existing catalogue descriptions and images will be preserved.", { count: syncLimit.toLocaleString(locale) }))) return;
    setBusy("sync"); setError(""); setNotice("");
    try {
      const run = await syncErpProducts(syncLimit, includeDiscontinued);
      setNotice(t("Synchronization completed: {{created}} created, {{updated}} updated, {{skipped}} skipped.", { created: run.rows_created, updated: run.rows_updated, skipped: run.rows_skipped }));
      await load();
    } catch (caught) { failure(caught, t("ERP product synchronization failed.")); }
    finally { setBusy(""); }
  }

  return (
    <>
      <section className={styles.erpStatus} data-status={connection?.last_test_status || "not_tested"}>
        <div><span><T>ERP DATABASE STATUS</T></span><h2>{t(connection?.last_test_status === "connected" ? "Connected" : connection?.configured ? "Connection requires testing" : "Not configured")}</h2><p>{connection?.last_test_message || t("Save the SQL Server connection details to begin.")}</p></div>
        <div><strong>{connection?.last_test_latency_ms ? `${connection.last_test_latency_ms} ms` : "—"}</strong><small>{t("Last tested")} {date(connection?.last_tested_at, locale, t("Never"))}</small></div>
      </section>

      {error && <div className={styles.error} role="alert"><span>{error}</span><button type="button" onClick={() => setError("")}><T>Dismiss</T></button></div>}
      {notice && <div className={styles.erpNotice} role="status">{notice}</div>}

      <section className={styles.panel}>
        <header><div><span><T>SECURE SQL SERVER CONNECTION</T></span><h3><T>ERP database connection</T></h3><p><T>The password is encrypted in the catalogue database and is never returned to this page.</T></p></div><button type="button" onClick={() => void test()} disabled={Boolean(busy) || !connection?.configured}>{t(busy === "test" ? "Testing…" : "Test connection")}</button></header>
        <form className={styles.erpForm} onSubmit={save}>
          <label><span><T>Connection name</T></span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
          <label><span><T>Server / hostname</T></span><input value={draft.server} onChange={(event) => setDraft({ ...draft, server: event.target.value })} placeholder={t("erp.example.com")} required /></label>
          <label><span><T>Port</T></span><input type="number" value={draft.port} min={1} max={65535} onChange={(event) => setDraft({ ...draft, port: Number(event.target.value) })} required /></label>
          <label><span><T>Database</T></span><input value={draft.database_name} onChange={(event) => setDraft({ ...draft, database_name: event.target.value })} required /></label>
          <label><span><T>Username</T></span><input value={draft.username} autoComplete="username" onChange={(event) => setDraft({ ...draft, username: event.target.value })} required /></label>
          <label><span>{t("Password")} {connection?.password_configured && <small><T>Leave blank to keep saved password</T></small>}</span><div className={styles.passwordField}><input type={showPassword ? "text" : "password"} value={draft.password} autoComplete="new-password" onChange={(event) => setDraft({ ...draft, password: event.target.value })} placeholder={t(connection?.password_configured ? "Saved securely" : "Enter database password")} required={!connection?.password_configured} /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={t(showPassword ? "Hide ERP password" : "Show ERP password")}>{t(showPassword ? "Hide" : "Show")}</button></div></label>
          <label><span><T>Connection timeout</T></span><input type="number" min={3} max={60} value={draft.connection_timeout_seconds} onChange={(event) => setDraft({ ...draft, connection_timeout_seconds: Number(event.target.value) })} /></label>
          <label className={styles.erpCheckbox}><input type="checkbox" checked={draft.is_enabled} onChange={(event) => setDraft({ ...draft, is_enabled: event.target.checked })} /><span><T>Enable this ERP connection</T></span></label>
          <div className={styles.erpActions}><button type="submit" disabled={Boolean(busy)}>{t(busy === "save" ? "Saving…" : "Save connection")}</button><button type="button" onClick={() => void test()} disabled={Boolean(busy) || !connection?.configured}>{t(busy === "test" ? "Testing…" : "Test connection")}</button></div>
        </form>
        <div className={styles.erpSecurityNote}><strong><T>Network security:</T></strong> <T>this legacy SQL Server accepted the supplied SQL login through TDS. Use a VPN or private network for production traffic because the server does not currently provide a verified TLS certificate.</T></div>
      </section>

      <section className={styles.panel}>
        <header><div><span><T>GMS PRODUCT MASTER PRESET</T></span><h3><T>Preview and synchronize products</T></h3><p><T>Reads Product, ProductUnits, ProductPrice, ProductOnhand, and the ERP brand/category hierarchy. Catalogue descriptions and uploaded images are preserved.</T></p></div><button type="button" onClick={() => void openPreview()} disabled={Boolean(busy) || connection?.last_test_status !== "connected"}>{t(busy === "preview" ? "Loading…" : "Preview 20 rows")}</button></header>
        <div className={styles.erpSyncControls}>
          <label><span><T>Maximum products</T></span><input type="number" min={1} max={50000} value={syncLimit} onChange={(event) => setSyncLimit(Math.min(50000, Math.max(1, Number(event.target.value))))} /></label>
          <label className={styles.erpCheckbox}><input type="checkbox" checked={includeDiscontinued} onChange={(event) => setIncludeDiscontinued(event.target.checked)} /><span><T>Include blocked/discontinued ERP products</T></span></label>
          <button type="button" onClick={() => void synchronize()} disabled={Boolean(busy) || connection?.last_test_status !== "connected"}>{t(busy === "sync" ? "Synchronizing…" : "Synchronize products")}</button>
        </div>
        {preview && <div className={styles.erpPreview}><div><strong>{t("{{count}} preview rows", { count: preview.rows.length })}</strong><small>{preview.source}</small></div><div className={styles.erpTableScroll}><table><thead><tr>{preview.columns.map((column) => <th key={column}>{column.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{preview.rows.map((row, index) => <tr key={String(row.erp_id || index)}>{preview.columns.map((column) => <td key={column}>{valueText(row[column], language)}</td>)}</tr>)}</tbody></table></div></div>}
      </section>

      <section className={styles.panel}>
        <header><div><span><T>DATABASE DISCOVERY</T></span><h3><T>Available ERP tables</T></h3><p>{t("{{count}} base tables were reported by SQL Server.", { count: connection?.discovered_table_count?.toLocaleString(locale) || 0 })}</p></div><button type="button" onClick={() => void discoverTables()} disabled={Boolean(busy) || connection?.last_test_status !== "connected"}>{t(busy === "tables" ? "Discovering…" : "Discover tables")}</button></header>
        {tables.length > 0 && <><input className={styles.erpSearch} type="search" placeholder={t("Filter table names")} value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} /><div className={styles.erpTableList}>{filteredTables.slice(0, 120).map((item) => <code key={`${item.schema_name}.${item.table_name}`}>{item.schema_name}.{item.table_name}</code>)}</div>{filteredTables.length > 120 && <p className={styles.empty}><T>Showing the first 120 matching tables.</T></p>}</>}
      </section>

      <section className={styles.panel}>
        <header><div><span><T>AUDITED IMPORT HISTORY</T></span><h3><T>Recent ERP synchronization runs</T></h3></div></header>
        <div className={styles.erpRuns}>{runs.map((run) => <article key={run.id} data-status={run.status}><div><strong>{t(run.status)}</strong><small>{date(run.started_at, locale, t("Never"))}</small></div><span>{t("{{count}} read", { count: run.rows_read })}</span><span>{t("{{count}} created", { count: run.rows_created })}</span><span>{t("{{count}} updated", { count: run.rows_updated })}</span><span>{t("{{count}} skipped", { count: run.rows_skipped })}</span></article>)}{!runs.length && <div className={styles.empty}><T>No ERP synchronization has been run yet.</T></div>}</div>
      </section>
    </>
  );
}
