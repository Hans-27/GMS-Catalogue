import { afterEach, describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "./clipboard";

describe("catalogue link clipboard helper", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("uses the browser clipboard API when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await expect(copyTextToClipboard("https://catalogue.test/c/token")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("https://catalogue.test/c/token");
  });

  it("falls back to a temporary selected textarea when clipboard access is blocked", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("blocked")) } });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });
    await expect(copyTextToClipboard("https://catalogue.test/c/fallback")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
  });
});
