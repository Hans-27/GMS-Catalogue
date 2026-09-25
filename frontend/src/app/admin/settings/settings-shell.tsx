"use client";
import { LanguageSwitcher, T, useLanguage } from "@/lib/i18n";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApplicationLogo } from "@/components/application-logo";
import { applicationBranding } from "@/lib/branding";
import { APP_ROUTES } from "@/lib/routes";
import { accountTypeLabel, canAccess, isSalesUser } from "@/lib/access";
import {
  ApiError,
  createBackup,
  deleteBackup,
  downloadBackup,
  getBackups,
  getCurrentUser,
  getSystemInformation,
  getSystemMetrics,
  type AuthenticatedUser,
  type BackupJob,
  type SystemMetrics,
} from "@/lib/api";
import styles from "./settings.module.css";
import { ErpSettingsView } from "./erp-settings";
import { DataSyncSettingsView } from "./data-sync-settings";
import { formatApiDate } from "@/lib/date-time";

type View =
  | "general"
  | "erp"
  | "data-sync"
  | "backups"
  | "system-health"
  | "system-information";

function permitted(user: AuthenticatedUser | null, code: string) {
  return canAccess(user, code);
}
function bytes(value: unknown) {
  const number = Number(value || 0);
  if (!number) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(number) / Math.log(1024)),
    units.length - 1,
  );
  return `${(number / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}
function duration(seconds: unknown) {
  const value = Number(seconds || 0);
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return [days && `${days}d`, hours && `${hours}h`, `${minutes}m`]
    .filter(Boolean)
    .join(" ");
}
function date(value: string | null) {
  return value
    ? formatApiDate(value, "en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Not available";
}

function Gauge({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <article className={styles.gauge}>
      <div
        style={{ "--value": `${Math.min(100, value)}%` } as React.CSSProperties}
      >
        <strong>{value.toFixed(1)}%</strong>
      </div>
      <span>{label}</span>
      <small>{detail}</small>
    </article>
  );
}

function HealthView() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [error, setError] = useState("");
  const [failures, setFailures] = useState(0);
  const load = useCallback(async () => {
    if (document.hidden || failures >= 3) return;
    try {
      setMetrics(await getSystemMetrics());
      setFailures(0);
      setError("");
    } catch (caught) {
      setFailures((count) => count + 1);
      setError(
        caught instanceof Error ? caught.message : "Metrics are unavailable.",
      );
    }
  }, [failures]);
  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 7000);
    const visible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [load]);
  if (!metrics && !error)
    return (
      <div className={styles.loading}>
        <T>Loading live system metrics…</T>
      </div>
    );
  if (!metrics)
    return (
      <div className={styles.error}>
        {error}
        <button
          type="button"
          onClick={() => {
            setFailures(0);
            void load();
          }}
        >
          <T>Try again</T>
        </button>
      </div>
    );
  const system = metrics.system;
  const database = metrics.database;
  const application = metrics.application;
  return (
    <>
      <div className={styles.healthBanner} data-status={metrics.status}>
        <div>
          <span>
            <T>OVERALL SYSTEM STATUS</T>
          </span>
          <h2>{metrics.status}</h2>
          <p>
            <T>Last checked</T>{" "}
            {new Date(metrics.timestamp).toLocaleTimeString()}
          </p>
        </div>
        <b>{metrics.status === "healthy" ? "✓" : "!"}</b>
      </div>
      <div className={styles.gaugeGrid}>
        <Gauge
          label="CPU usage"
          value={Number(system.cpu_percent)}
          detail={`${system.physical_cores} physical · ${system.logical_processors} logical cores`}
        />
        <Gauge
          label="Memory usage"
          value={Number(system.memory_percent)}
          detail={`${bytes(system.memory_used_bytes)} of ${bytes(system.memory_total_bytes)}`}
        />
        <Gauge
          label="Disk usage"
          value={Number(system.disk_percent)}
          detail={`${bytes(system.disk_free_bytes)} available`}
        />
      </div>
      <div className={styles.metricGrid}>
        <article>
          <span>
            <T>System uptime</T>
          </span>
          <strong>{duration(system.uptime_seconds)}</strong>
          <small>
            {String(system.platform)} {String(system.platform_release)}
          </small>
        </article>
        <article>
          <span>
            <T>Application uptime</T>
          </span>
          <strong>{duration(application.uptime_seconds)}</strong>
          <small>
            <T>Version</T> {String(application.version)}
          </small>
        </article>
        <article>
          <span>
            <T>Database</T>
          </span>
          <strong data-good={database.status === "connected"}>
            {String(database.status)}
          </strong>
          <small>
            {Number(database.response_ms).toFixed(1)} <T>ms response</T>
          </small>
        </article>
        <article>
          <span>
            <T>Backup storage</T>
          </span>
          <strong>{bytes(system.backup_storage_bytes)}</strong>
          <small>
            <T>Media</T> {bytes(system.media_storage_bytes)}
          </small>
        </article>
      </div>
      <section className={styles.panel}>
        <header>
          <div>
            <span>
              <T>RESOURCE DETAIL</T>
            </span>
            <h3>
              <T>Current operating profile</T>
            </h3>
          </div>
          <small>
            <T>Refreshes every 7 seconds while this tab is visible</T>
          </small>
        </header>
        <div className={styles.bars}>
          {["cpu_percent", "memory_percent", "disk_percent"].map((key) => (
            <div key={key}>
              <label>
                {key.replace("_percent", "").toUpperCase()}
                <span>{Number(system[key]).toFixed(1)}%</span>
              </label>
              <i>
                <b
                  style={{ width: `${Math.min(100, Number(system[key]))}%` }}
                />
              </i>
            </div>
          ))}
        </div>
      </section>
      <section className={styles.panel}>
        <header>
          <div>
            <span>
              <T>WARNINGS</T>
            </span>
            <h3>
              <T>Recent system warnings</T>
            </h3>
          </div>
        </header>
        {metrics.warnings.length ? (
          <ul>
            {metrics.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : (
          <div className={styles.empty}>
            <T>No current system warnings.</T>
          </div>
        )}
      </section>
    </>
  );
}

function BackupTable({
  type,
  jobs,
  reload,
  user,
}: {
  type: "database" | "application";
  jobs: BackupJob[];
  reload: () => Promise<void>;
  user: AuthenticatedUser;
}) {
  const { t } = useLanguage();
  const [description, setDescription] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  async function create() {
    setWorking(true);
    setError("");
    try {
      await createBackup(
        type,
        description,
        type === "application"
          ? ["source", "uploads", "static", "config_templates", "migrations"]
          : [],
      );
      setDescription("");
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Backup failed.");
    } finally {
      setWorking(false);
    }
  }
  return (
    <section className={styles.panel}>
      <header>
        <div>
          <span>
            {type.toUpperCase()} <T>BACKUP</T>
          </span>
          <h3>
            {type === "database"
              ? "PostgreSQL database"
              : "Application and uploads"}
          </h3>
          <p>
            {type === "database"
              ? "Creates a real custom-format pg_dump file."
              : "Creates a sanitized ZIP archive without secrets or build caches."}
          </p>
        </div>
        {permitted(user, "backups.create") && (
          <button
            type="button"
            disabled={working}
            onClick={() => void create()}
          >
            {t(working ? "Creating…" : "Create Backup Now")}
          </button>
        )}
      </header>
      {permitted(user, "backups.create") && (
        <input
          className={styles.description}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t("Optional backup description")}
          maxLength={500}
        />
      )}
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.backupTable}>
        <div className={styles.tableHeader}>
          <span>
            <T>Status</T>
          </span>
          <span>
            <T>Backup</T>
          </span>
          <span>
            <T>Created</T>
          </span>
          <span>
            <T>Size</T>
          </span>
          <span>
            <T>Actions</T>
          </span>
        </div>
        {jobs.map((job) => (
          <article key={job.id}>
            <span data-status={job.status}>{job.status}</span>
            <div>
              <strong>{job.file_name || `${type} backup`}</strong>
              <small>
                {job.description ||
                  job.error_message ||
                  `Requested by ${job.requested_by_name || "System user"}`}
              </small>
              {job.checksum && (
                <code title={job.checksum}>
                  <T>SHA-256</T> {job.checksum.slice(0, 12)}…
                </code>
              )}
            </div>
            <span>
              {date(job.completed_at || job.started_at || job.created_at)}
              <small>
                {job.duration_seconds !== null
                  ? `${job.duration_seconds.toFixed(1)} sec`
                  : ""}
              </small>
            </span>
            <span>{bytes(job.file_size)}</span>
            <div>
              {job.status === "completed" &&
                permitted(user, "backups.download") && (
                  <button
                    type="button"
                    onClick={() =>
                      void downloadBackup(
                        type,
                        job.id,
                        job.file_name || `${type}-backup`,
                      )
                    }
                  >
                    <T>Download</T>
                  </button>
                )}
              {job.status !== "running" &&
                permitted(user, "backups.delete") && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (confirm(t("Delete this backup file?"))) {
                        await deleteBackup(type, job.id);
                        await reload();
                      }
                    }}
                  >
                    <T>Delete</T>
                  </button>
                )}
            </div>
          </article>
        ))}
        {!jobs.length && (
          <div className={styles.empty}>
            <T>No</T> {type} <T>backups have been created.</T>
          </div>
        )}
      </div>
    </section>
  );
}

function BackupsView({ user }: { user: AuthenticatedUser }) {
  const [database, setDatabase] = useState<BackupJob[]>([]);
  const [application, setApplication] = useState<BackupJob[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const [db, app] = await Promise.all([
        getBackups("database"),
        getBackups("application"),
      ]);
      setDatabase(db);
      setApplication(app);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Backup history could not be loaded.",
      );
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  return (
    <>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.restoreNotice}>
        <b>
          <T>Restore is disabled in this demo environment.</T>
        </b>
        <span>
          <T>
            Backups can be created, verified, downloaded, and deleted. Restore
            can only be enabled during controlled maintenance.
          </T>
        </span>
      </div>
      <BackupTable type="database" jobs={database} reload={load} user={user} />
      <BackupTable
        type="application"
        jobs={application}
        reload={load}
        user={user}
      />
    </>
  );
}

export function SettingsShell({ view }: { view: View }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState<Record<string, string | boolean>>({});
  useEffect(() => {
    getCurrentUser()
      .then((current) => {
        if (
          !permitted(current, "settings.view") &&
          !permitted(current, "settings.manage") &&
          !permitted(current, "system_metrics.view") &&
          !permitted(current, "data_sync.view") &&
          !permitted(current, "backups.view")
        )
          throw new ApiError(
            "You do not have permission to open Settings.",
            403,
          );
        setUser(current);
        if (
          view === "system-information" &&
          permitted(current, "system_information.view")
        )
          void getSystemInformation().then(setInfo);
      })
      .catch((caught) => {
        if (caught instanceof ApiError && caught.status === 401)
          router.replace("/login");
        else
          setError(
            caught instanceof Error
              ? caught.message
              : "Settings are unavailable.",
          );
      });
  }, [router, view]);
  if (error)
    return (
      <main className={styles.accessDenied}>
        <b>!</b>
        <h1>
          <T>Settings access unavailable</T>
        </h1>
        <p>{error}</p>
        <Link href={APP_ROUTES.overview}>
          <T>Return to dashboard</T>
        </Link>
      </main>
    );
  if (!user)
    return (
      <main className={styles.loading}>
        <T>Loading Settings…</T>
      </main>
    );
  const salesOnly = isSalesUser(user);
  const homeRoute = salesOnly ? APP_ROUTES.catalogues : APP_ROUTES.overview;
  const links = [
    {
      id: "general",
      label: "General Settings",
      permission: "settings.view",
      href: "/admin/settings/general",
    },
    {
      id: "erp",
      label: "ERP Database",
      permission: "settings.manage",
      href: "/admin/settings/erp",
    },
    {
      id: "backups",
      label: "Backup Management",
      permission: "backups.view",
      href: "/admin/settings/backups",
    },
    {
      id: "data-sync",
      label: "Data Synchronization",
      permission: "data_sync.view",
      href: "/admin/settings/data-sync",
    },
    {
      id: "system-health",
      label: "System Health",
      permission: "system_metrics.view",
      href: "/admin/settings/system-health",
    },
    {
      id: "system-information",
      label: "System Information",
      permission: "system_information.view",
      href: "/admin/settings/system-information",
    },
  ] as const;
  return (
    <div className={styles.page}>
      <aside>
        <Link
          className={styles.logo}
          href={homeRoute}
          title={t(salesOnly ? "Go to Catalogues" : "Go to Overview")}
          aria-label={t(salesOnly ? "Go to Catalogues" : "Go to Overview")}
        >
          <b>
            <ApplicationLogo priority />
          </b>
          <span>
            {applicationBranding.companyName}
            <small>
              <T>SETTINGS</T>
            </small>
          </span>
        </Link>
        <nav>
          {links
            .filter(
              (item) =>
                permitted(user, item.permission) ||
                (item.id === "general" && permitted(user, "settings.manage")),
            )
            .map((item) => (
              <Link
                key={item.id}
                data-active={view === item.id}
                href={item.href}
              >
                {t(item.label)}
              </Link>
            ))}
        </nav>
        <Link className={styles.back} href={homeRoute}>
          ← <T>Back to catalogue</T>
        </Link>
      </aside>
      <main>
        <header className={styles.pageHeader}>
          <div>
            <span>
              <T>{salesOnly ? "SYSTEM TOOLS" : "SUPERADMIN SETTINGS"}</T>
            </span>
            <h1>
              {t(links.find((item) => item.id === view)?.label ?? "Settings")}
            </h1>
            <p>
              <T>
                {salesOnly
                  ? "Read-only platform information and monitoring."
                  : "Protected platform operations and monitoring."}
              </T>
            </p>
          </div>
          <div>
            <LanguageSwitcher />
            <b>{user.full_name}</b>
            <small>{accountTypeLabel(user)}</small>
          </div>
        </header>
        <div className={`${styles.content} ${view === "erp" ? styles.erpContent : ""}`}>
          {view === "system-health" && <HealthView />}
          {view === "erp" && <ErpSettingsView />}
          {view === "data-sync" && <DataSyncSettingsView user={user} />}
          {view === "backups" && <BackupsView user={user} />}
          {view === "general" && (
            <section className={styles.panel}>
              <header>
                <div>
                  <span>
                    <T>PLATFORM DEFAULTS</T>
                  </span>
                  <h3>
                    <T>Catalogue Management Platform</T>
                  </h3>
                  <p>
                    <T>General settings are managed securely by the server.</T>
                  </p>
                </div>
              </header>
              <div className={styles.settingList}>
                <div>
                  <span>
                    <T>Catalogue branding</T>
                  </span>
                  <strong>
                    <T>Configurable per catalogue</T>
                  </strong>
                </div>
                <div className={styles.languageSetting}>
                  <span>
                    <T>Languages</T>
                  </span>
                  <LanguageSwitcher className={styles.settingLanguageSwitcher} />
                </div>
                <div>
                  <span>
                    <T>Storage</T>
                  </span>
                  <strong>
                    <T>Validated local storage abstraction</T>
                  </strong>
                </div>
                <div>
                  <span>
                    <T>Restore</T>
                  </span>
                  <strong>
                    <T>Disabled by server policy</T>
                  </strong>
                </div>
              </div>
            </section>
          )}
          {view === "system-information" && (
            <section className={styles.panel}>
              <header>
                <div>
                  <span>
                    <T>SAFE SYSTEM INFORMATION</T>
                  </span>
                  <h3>
                    <T>Application environment</T>
                  </h3>
                  <p>
                    <T>
                      Credentials, connection strings, paths, tokens, and
                      private keys are never returned.
                    </T>
                  </p>
                </div>
              </header>
              <div className={styles.settingList}>
                {Object.entries(info).map(([key, value]) => (
                  <div key={key}>
                    <span>{key.replaceAll("_", " ")}</span>
                    <strong>{String(value)}</strong>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
