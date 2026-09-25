"use client";

import type { StudioElement } from "@/lib/studio-api";
import {
  appendStudioTableColumn,
  appendStudioTableRow,
  parseStudioTable,
  removeStudioTableColumn,
  removeStudioTableRow,
  resizeStudioTable,
  serializeStudioTable,
  STUDIO_TABLE_PRESETS,
} from "./studio-table";
import styles from "./studio.module.css";

type StylePatch = Record<string, string | number | boolean | null>;

function TableFillColor({ label, value, fallback, onChange }: { label: string; value: unknown; fallback: string; onChange: (value: string) => void }) {
  const transparent = value === "transparent";
  const color = typeof value === "string" && value.startsWith("#") ? value.slice(0, 7) : fallback;
  return <div className={styles.tableColorControl}><span>{label}</span><div><input aria-label={`${label} colour`} type="color" value={color} disabled={transparent} onChange={(event) => onChange(event.target.value.toUpperCase())} /><button type="button" data-active={transparent} aria-pressed={transparent} onClick={() => onChange(transparent ? fallback : "transparent")}>{transparent ? "Use colour" : "No colour"}</button></div></div>;
}

export function StudioTableProperties({
  element,
  onElementChange,
  onStyleChange,
}: {
  element: StudioElement;
  onElementChange: (changes: Partial<StudioElement>) => void;
  onStyleChange: (changes: StylePatch) => void;
}) {
  const rows = parseStudioTable(element.text);
  const rowCount = rows.length;
  const columnCount = rows[0]?.length || 1;

  function updateCell(rowIndex: number, columnIndex: number, value: string) {
    const next = rows.map((row) => [...row]);
    next[rowIndex][columnIndex] = value;
    onElementChange({ text: serializeStudioTable(next) });
  }

  return <section className={styles.cardProperties}>
    <div><strong>Table builder</strong><small>Edit cells visually or paste rows using | between columns. Maximum 30 rows and 12 columns.</small></div>

    <div className={styles.tablePresetGrid} aria-label="Table presets">
      <button type="button" onClick={() => onElementChange({ text: STUDIO_TABLE_PRESETS.blank })}>Blank</button>
      <button type="button" onClick={() => { onElementChange({ text: STUDIO_TABLE_PRESETS.product }); onStyleChange({ tableSource: "erp_catalogue", tableHeaderColor: "transparent", tableHeaderTextColor: "#000000", tableCellColor: "transparent", tableAlternateColor: "transparent", tableStriped: false, tableStockColor: "#16884C" }); }}>Live ERP stock</button>
      <button type="button" onClick={() => onElementChange({ text: STUDIO_TABLE_PRESETS.pricing })}>Price comparison</button>
      <button type="button" onClick={() => onElementChange({ text: STUDIO_TABLE_PRESETS.specification })}>Specifications</button>
    </div>

    <div className={styles.propertyGrid}>
      <label>Rows<input type="number" min="1" max="30" value={rowCount} onChange={(event) => onElementChange({ text: resizeStudioTable(element.text, Number(event.target.value), columnCount) })} /></label>
      <label>Columns<input type="number" min="1" max="12" value={columnCount} onChange={(event) => onElementChange({ text: resizeStudioTable(element.text, rowCount, Number(event.target.value)) })} /></label>
    </div>
    <div className={styles.tableActions}>
      <button type="button" onClick={() => onElementChange({ text: appendStudioTableRow(element.text) })}>+ Row</button>
      <button type="button" onClick={() => onElementChange({ text: removeStudioTableRow(element.text) })} disabled={rowCount <= 1}>− Row</button>
      <button type="button" onClick={() => onElementChange({ text: appendStudioTableColumn(element.text) })}>+ Column</button>
      <button type="button" onClick={() => onElementChange({ text: removeStudioTableColumn(element.text) })} disabled={columnCount <= 1}>− Column</button>
    </div>

    <div className={styles.tableCellEditor} aria-label="Table cells">
      <div className={styles.tableCellGrid} style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(100px, 1fr))` }}>
        {rows.flatMap((row, rowIndex) => row.map((cell, columnIndex) => <input key={`${rowIndex}-${columnIndex}`} aria-label={`Row ${rowIndex + 1}, column ${columnIndex + 1}`} value={cell} onChange={(event) => updateCell(rowIndex, columnIndex, event.target.value)} />))}
      </div>
    </div>

    <label>Paste or edit table data<textarea rows={6} value={element.text || ""} onChange={(event) => onElementChange({ text: event.target.value })} placeholder="Heading 1 | Heading 2" /></label>

    <div className={styles.toggleGrid}>
      <label><input type="checkbox" checked={element.style.tableHeader !== false} onChange={(event) => onStyleChange({ tableHeader: event.target.checked })} /> Header row</label>
      <label><input type="checkbox" checked={element.style.tableStriped !== false} onChange={(event) => onStyleChange({ tableStriped: event.target.checked })} /> Alternating rows</label>
      <label><input type="checkbox" checked={element.style.tableShowBorders !== false} onChange={(event) => onStyleChange({ tableShowBorders: event.target.checked })} /> Cell borders</label>
    </div>

    <div className={styles.propertyGrid}><label>Horizontal alignment<select value={String(element.style.textAlign || "left")} onChange={(event) => onStyleChange({ textAlign: event.target.value })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option><option value="justify">Justify</option></select></label><label>Vertical alignment<select value={String(element.style.tableVerticalAlign || "middle")} onChange={(event) => onStyleChange({ tableVerticalAlign: event.target.value })}><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option></select></label></div>
    <div className={styles.propertyGrid}><label>Cell padding<input type="number" min="0" max="40" value={Number(element.style.tableCellPadding ?? 8)} onChange={(event) => onStyleChange({ tableCellPadding: Number(event.target.value) })} /></label><label>Grid width<input type="number" min="0" max="10" value={Number(element.style.tableBorderWidth ?? 1)} onChange={(event) => onStyleChange({ tableBorderWidth: Number(event.target.value) })} /></label></div>
    <div className={styles.propertyGrid}><TableFillColor label="Header" value={element.style.tableHeaderColor} fallback="#126B3A" onChange={(value) => onStyleChange({ tableHeaderColor: value })} /><label>First row text colour<input aria-label="First row text colour" type="color" value={String(element.style.tableHeaderTextColor || "#FFFFFF").slice(0, 7)} onInput={(event) => onStyleChange({ tableHeaderTextColor: event.currentTarget.value.toUpperCase() })} /></label></div>
    <div className={styles.propertyGrid}><TableFillColor label="Cells" value={element.style.tableCellColor} fallback="#FFFFFF" onChange={(value) => onStyleChange({ tableCellColor: value })} /><TableFillColor label="Alternate rows" value={element.style.tableAlternateColor} fallback="#F2F8F4" onChange={(value) => onStyleChange({ tableAlternateColor: value })} /></div>
    <div className={styles.propertyGrid}><label>Grid color<input type="color" value={String(element.style.tableGridColor || "#B9CCC0").slice(0, 7)} onChange={(event) => onStyleChange({ tableGridColor: event.target.value.toUpperCase() })} /></label><label>Text size<input type="number" min="6" max="80" value={Number(element.style.fontSize || 16)} onChange={(event) => onStyleChange({ fontSize: Number(event.target.value) })} /></label></div>
  </section>;
}
