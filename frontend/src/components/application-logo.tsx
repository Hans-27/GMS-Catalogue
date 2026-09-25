"use client";
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { applicationBranding } from "@/lib/branding";
import styles from "./application-logo.module.css";

type Props = {
  className?: string;
  compact?: boolean;
  priority?: boolean;
};

export function ApplicationLogo({ className = "", compact = false, priority = false }: Props) {
  const [failed, setFailed] = useState(false);
  const classes = [styles.logo, compact ? styles.compact : "", className].filter(Boolean).join(" ");

  if (failed) {
    return <span className={`${classes} ${styles.fallback}`} role="img" aria-label={applicationBranding.logoAlt}>GMS</span>;
  }

  return (
    <img
      className={classes}
      src={applicationBranding.defaultLogo}
      alt={applicationBranding.logoAlt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      onError={() => setFailed(true)}
    />
  );
}

