"use client";

import { useEffect, useState } from "react";

export const MOBILE_VIEWPORT_QUERY = "(max-width: 760px)";

export function useMobileViewport() {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(MOBILE_VIEWPORT_QUERY);
    const update = (event?: MediaQueryListEvent) => setMobile(event?.matches ?? query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  return mobile;
}
