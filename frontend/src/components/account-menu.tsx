"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AuthenticatedUser } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";
import styles from "./account-menu.module.css";

type AccountMenuProps = {
  user: AuthenticatedUser;
  roleLabel: string;
  canViewSettings: boolean;
  onSignOut: () => void | Promise<void>;
};

export function AccountMenu({
  user,
  roleLabel,
  canViewSettings,
  onSignOut,
}: AccountMenuProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const initial = user.full_name.trim().slice(0, 1).toUpperCase() || "U";

  return (
    <div className={styles.accountMenu} ref={containerRef}>
      <button
        ref={triggerRef}
        className={styles.trigger}
        type="button"
        aria-label={t("Account menu for {{name}}", { name: user.full_name })}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={styles.avatar} aria-hidden="true">{initial}</span>
        <span className={styles.triggerText}>
          <span>{user.full_name}</span>
          <small>{roleLabel}</small>
        </span>
        <svg className={styles.chevron} viewBox="0 0 20 20" aria-hidden="true">
          <path d="m6 8 4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className={styles.menu} role="menu">
          <div className={styles.identity}>
            <span className={styles.avatar} aria-hidden="true">{initial}</span>
            <span>
              <span className={styles.name}>{user.full_name}</span>
              <small>{user.email}</small>
              <small className={styles.department}>
                {user.department?.trim() || t("Not assigned")}
              </small>
            </span>
          </div>

          {canViewSettings && (
            <Link
              className={styles.menuItem}
              href="/admin/settings/general"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5Z" />
                <path d="m19.4 15 .1.1-1.8 3.1-.2-.1a2 2 0 0 0-2.3.3l-.1.1V21h-3.6v-.2a2 2 0 0 0-1.3-1.9H10a2 2 0 0 0-2.2.4l-.2.1-1.8-3.1.2-.1a2 2 0 0 0 1-2v-.3a2 2 0 0 0-1-2l-.2-.1 1.8-3.1.2.1a2 2 0 0 0 2.2.4h.2a2 2 0 0 0 1.3-1.9V7h3.6v.2a2 2 0 0 0 1.3 1.9h.2a2 2 0 0 0 2.2-.4l.2-.1 1.8 3.1-.2.1a2 2 0 0 0-1 2v.3a2 2 0 0 0 1 2Z" />
              </svg>
              <span>{t("Settings")}</span>
            </Link>
          )}

          <button
            className={`${styles.menuItem} ${styles.signOut}`}
            type="button"
            role="menuitem"
            onClick={() => void onSignOut()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10 17v2H5V5h5v2M14 8l4 4-4 4M18 12H9" />
            </svg>
            <span>{t("Sign out")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
