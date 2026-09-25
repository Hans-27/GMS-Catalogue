"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { AuthenticatedUser } from "@/lib/api";
import { canAccessAny } from "@/lib/access";
import { LanguageSwitcher, useLanguage } from "@/lib/i18n";
import styles from "./admin-management.module.css";

const LINKS: Array<[string, string, string[]]> = [
  [
    "Organization",
    "/dashboard?view=organization",
    ["departments.view", "departments.manage", "teams.view", "positions.view"],
  ],
  [
    "Users",
    "/dashboard?view=users",
    ["users.view"],
  ],
];

export function AccessDenied() {
  const { t } = useLanguage();
  return (
    <main className={styles.accessDenied}>
      <div>
        <span className={styles.eyebrow}>{t("ACCESS CONTROL")}</span>
        <h1>{t("Access denied")}</h1>
        <p>
          {t(
            "You do not have permission to open this administration page. Ask a SuperAdmin to grant the required permission.",
          )}
        </p>
        <Link href="/dashboard">{t("Return to dashboard")}</Link>
      </div>
    </main>
  );
}

export function AdminPageFrame({
  user,
  children,
}: {
  user: AuthenticatedUser;
  children: ReactNode;
}) {
  const { t } = useLanguage();
  const visible = LINKS.filter(([, , permissions]) =>
    canAccessAny(user, permissions),
  );
  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/dashboard">GMS Catalogue</Link>
        {visible.length > 0 && (
          <nav aria-label={t("Organization and access control")}>
            {visible.map(([label, href]) => (
              <Link key={href} href={href}>
                {t(label)}
              </Link>
            ))}
          </nav>
        )}
        <div>
          <LanguageSwitcher />
          <span>{user.full_name}</span>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
