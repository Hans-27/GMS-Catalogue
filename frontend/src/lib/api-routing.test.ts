import { afterEach, describe, expect, it, vi } from "vitest";

describe("public API routing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses the same-origin API path when the public URL is relative", async () => {
    // Regression: a relative /api URL used to be passed to new URL(), which
    // crashed in the browser and forced public users to call localhost:8000.
    vi.stubEnv("NEXT_PUBLIC_API_URL", "/api");

    const { API_ORIGIN, API_URL } = await import("./api");

    expect(API_URL).toBe("/api");
    expect(API_ORIGIN).toBe("");
  });
});
