export const DEFAULT_STUDIO_TABLE = "Code | Barcode | Stock\n23-01178 | 8859790002006 | 1,181\n23-01179 | 8859790002013 | 1,455";

export const STUDIO_TABLE_PRESETS = {
  product: DEFAULT_STUDIO_TABLE,
  pricing: "Product | Normal | VIP BKK | Dealer\nProduct A | THB 100 | THB 90 | THB 80\nProduct B | THB 200 | THB 180 | THB 160",
  specification: "Specification | Value\nModel | Product model\nSize | Product size\nWarranty | 1 year",
  blank: " |  | \n |  | \n |  | ",
} as const;

export function parseStudioTable(value?: string | null) {
  const source = String(value == null ? DEFAULT_STUDIO_TABLE : value).replace(/\r/g, "");
  const rawRows = source
    .split("\n")
    .filter((line) => line.includes("|") || Boolean(line.trim()))
    .map((line) => line.split("|").slice(0, 12).map((cell) => cell.trim()))
    .slice(0, 30);
  const rows = rawRows.length ? rawRows : [[""]];
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  return rows.map((row) => Array.from({ length: columnCount }, (_, index) => row[index] || ""));
}

export function studioTableColumnFractions(rows: string[][]) {
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const weights = Array.from({ length: columnCount }, (_, columnIndex) => {
    const header = String(rows[0]?.[columnIndex] || "").trim().toLowerCase();
    const longest = Math.max(1, ...rows.map((row) => String(row[columnIndex] || "").length));
    if (header === "barcode") return Math.max(1.8, Math.min(2.6, longest / 7));
    if (header === "stock") return Math.max(0.8, Math.min(1.15, longest / 7));
    if (header === "code" || header === "product code") return Math.max(1.15, Math.min(1.65, longest / 7));
    return Math.max(1, Math.min(2.5, longest / 8));
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  return weights.map((weight) => weight / total);
}

export function serializeStudioTable(rows: string[][]) {
  return rows.map((row) => row.join(" | ")).join("\n");
}

export function resizeStudioTable(value: string | null | undefined, rowCount: number, columnCount: number) {
  const rows = parseStudioTable(value);
  const safeRows = Math.max(1, Math.min(30, Math.round(rowCount)));
  const safeColumns = Math.max(1, Math.min(12, Math.round(columnCount)));
  return serializeStudioTable(Array.from({ length: safeRows }, (_, rowIndex) =>
    Array.from({ length: safeColumns }, (_, columnIndex) => rows[rowIndex]?.[columnIndex] || ""),
  ));
}

export function appendStudioTableRow(value?: string | null) {
  const rows = parseStudioTable(value);
  const columnCount = rows[0]?.length || 1;
  return serializeStudioTable([...rows, Array.from({ length: columnCount }, () => "Value")]);
}

export function appendStudioTableColumn(value?: string | null) {
  const rows = parseStudioTable(value);
  return serializeStudioTable(rows.map((row, index) => [...row, index === 0 ? "Heading" : "Value"]));
}

export function removeStudioTableRow(value?: string | null) {
  const rows = parseStudioTable(value);
  return serializeStudioTable(rows.length > 1 ? rows.slice(0, -1) : rows);
}

export function removeStudioTableColumn(value?: string | null) {
  const rows = parseStudioTable(value);
  return serializeStudioTable(rows[0].length > 1 ? rows.map((row) => row.slice(0, -1)) : rows);
}
