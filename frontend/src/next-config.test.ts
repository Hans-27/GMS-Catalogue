import { afterEach, describe, expect, it, vi } from "vitest";

describe("server-side backend proxy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("forwards stored product images to the internal backend", async () => {
    // Regression: same-origin catalogue cards request /uploads/*, but only
    // /api/* was proxied after the public frontend moved to port 3000.
    vi.stubEnv("INTERNAL_API_URL", "http://backend.internal:8001/api");

    const { default: config } = await import("../next.config");
    const rewrites = await config.rewrites?.();

    expect(rewrites).toMatchObject({
      fallback: expect.arrayContaining([
        {
          source: "/uploads/:path*",
          destination: "http://backend.internal:8001/uploads/:path*",
        },
      ]),
    });
  });

  it("emits the minimal standalone server used by the production image", async () => {
    const { default: config } = await import("../next.config");

    expect(config.output).toBe("standalone");
    expect(config.agentRules).toBe(false);
  });
});
