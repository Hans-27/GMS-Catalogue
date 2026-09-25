import { describe, expect, it } from "vitest";
import { formatApiDate, parseApiDate } from "./date-time";

describe("API timestamp formatting", () => {
  it("treats a timezone-less SQLite timestamp as UTC", () => {
    expect(parseApiDate("2026-08-05T06:30:00").toISOString()).toBe("2026-08-05T06:30:00.000Z");
  });

  it("displays API timestamps in Bangkok time", () => {
    expect(formatApiDate("2026-08-05T06:30:00", "en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })).toBe("13:30");
  });

  it("does not alter timestamps that already include an offset", () => {
    expect(parseApiDate("2026-08-05T13:30:00+07:00").toISOString()).toBe("2026-08-05T06:30:00.000Z");
  });
});
