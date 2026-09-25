"use client";

import styles from "./catalogue-explore-link.module.css";

type Props = {
  href: string;
  label: string;
  onExplore?: (behavior: ScrollBehavior) => void;
};

function preferredScrollBehavior(): ScrollBehavior {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

export function CatalogueExploreLink({ href, label, onExplore }: Props) {
  return (
    <a
      className={styles.link}
      data-catalogue-explore="true"
      href={href}
      onClick={(event) => {
        event.stopPropagation();
        const behavior = preferredScrollBehavior();
        if (onExplore) {
          event.preventDefault();
          onExplore(behavior);
          return;
        }

        if (!href.startsWith("#")) return;
        const target = document.getElementById(decodeURIComponent(href.slice(1)));
        if (!target) return;

        event.preventDefault();
        window.history.pushState(null, "", href);
        target.scrollIntoView({ behavior, block: "start" });
      }}
    >
      {label} ↓
    </a>
  );
}
