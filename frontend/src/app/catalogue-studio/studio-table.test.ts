import { describe, expect, it } from "vitest";
import { appendStudioTableColumn, appendStudioTableRow, parseStudioTable, removeStudioTableColumn, removeStudioTableRow, resizeStudioTable, STUDIO_TABLE_PRESETS } from "./studio-table";

describe("Studio table helpers", () => {
  it("normalizes uneven pipe-separated rows", () => {
    expect(parseStudioTable("Code | Stock\nA-1 | 5\nA-2")).toEqual([
      ["Code", "Stock"],
      ["A-1", "5"],
      ["A-2", ""],
    ]);
  });

  it("adds rows and columns without losing existing cells", () => {
    const withRow = appendStudioTableRow("Code | Stock\nA-1 | 5");
    expect(parseStudioTable(withRow)).toHaveLength(3);
    const withColumn = appendStudioTableColumn(withRow);
    expect(parseStudioTable(withColumn)[0]).toEqual(["Code", "Stock", "Heading"]);
  });

  it("resizes and removes rows and columns while preserving existing data", () => {
    const resized = resizeStudioTable("Code | Stock\nA-1 | 5", 4, 3);
    expect(parseStudioTable(resized)).toHaveLength(4);
    expect(parseStudioTable(resized)[0]).toEqual(["Code", "Stock", ""]);
    expect(parseStudioTable(removeStudioTableRow(resized))).toHaveLength(3);
    expect(parseStudioTable(removeStudioTableColumn(resized))[0]).toEqual(["Code", "Stock"]);
  });

  it("provides a genuinely empty three-by-three blank table", () => {
    expect(parseStudioTable(STUDIO_TABLE_PRESETS.blank)).toEqual([
      ["", "", ""],
      ["", "", ""],
      ["", "", ""],
    ]);
  });
});
