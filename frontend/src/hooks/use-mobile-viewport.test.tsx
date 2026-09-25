import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MOBILE_VIEWPORT_QUERY, useMobileViewport } from "./use-mobile-viewport";

type Listener = (event: MediaQueryListEvent) => void;

function installMatchMedia(matches: boolean) {
  let current = matches;
  const listeners = new Set<Listener>();
  const media = {
    get matches() { return current; },
    media: MOBILE_VIEWPORT_QUERY,
    onchange: null,
    addEventListener: (_: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_: string, listener: Listener) => listeners.delete(listener),
    addListener: (listener: Listener) => listeners.add(listener),
    removeListener: (listener: Listener) => listeners.delete(listener),
    dispatchEvent: () => true,
  } as MediaQueryList;
  vi.stubGlobal("matchMedia", vi.fn(() => media));
  return (next: boolean) => {
    current = next;
    const event = { matches: next, media: MOBILE_VIEWPORT_QUERY } as MediaQueryListEvent;
    listeners.forEach((listener) => listener(event));
  };
}

describe("useMobileViewport", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the 760px boundary and reacts when the viewport crosses it", () => {
    const resize = installMatchMedia(true);
    const { result } = renderHook(() => useMobileViewport());
    expect(matchMedia).toHaveBeenCalledWith("(max-width: 760px)");
    expect(result.current).toBe(true);

    act(() => resize(false));
    expect(result.current).toBe(false);
  });
});
