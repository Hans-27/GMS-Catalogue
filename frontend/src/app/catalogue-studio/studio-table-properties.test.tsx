import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StudioElement } from "@/lib/studio-api";
import { StudioTableProperties } from "./studio-table-properties";
import { parseStudioTable } from "./studio-table";

const element: StudioElement = {
  id: "table-1", type: "table", name: "Table", xPercent: 10, yPercent: 10,
  widthPercent: 60, heightPercent: 30, rotation: 0, opacity: 1, zIndex: 1,
  locked: false, visible: true, text: "Code | Stock\nA-1 | 5", responsive: {},
  style: { tableHeader: true, tableStriped: true, tableShowBorders: true },
};

describe("StudioTableProperties", () => {
  it("edits individual cells and adds rows", () => {
    const onElementChange = vi.fn();
    render(<StudioTableProperties element={element} onElementChange={onElementChange} onStyleChange={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Row 2, column 2" }), { target: { value: "12" } });
    expect(parseStudioTable(onElementChange.mock.calls.at(-1)?.[0].text)[1][1]).toBe("12");
    fireEvent.click(screen.getByRole("button", { name: "+ Row" }));
    expect(parseStudioTable(onElementChange.mock.calls.at(-1)?.[0].text)).toHaveLength(3);
  });

  it("updates table layout settings", () => {
    const onStyleChange = vi.fn();
    render(<StudioTableProperties element={element} onElementChange={vi.fn()} onStyleChange={onStyleChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Cell borders" }));
    expect(onStyleChange).toHaveBeenLastCalledWith({ tableShowBorders: false });
    fireEvent.change(screen.getByLabelText("Vertical alignment"), { target: { value: "bottom" } });
    expect(onStyleChange).toHaveBeenLastCalledWith({ tableVerticalAlign: "bottom" });
    fireEvent.input(screen.getByLabelText("First row text colour"), { target: { value: "#123456" } });
    expect(onStyleChange).toHaveBeenLastCalledWith({ tableHeaderTextColor: "#123456" });
  });

  it("allows table fills to be transparent", () => {
    const onStyleChange = vi.fn();
    render(<StudioTableProperties element={element} onElementChange={vi.fn()} onStyleChange={onStyleChange} />);

    fireEvent.click(screen.getAllByRole("button", { name: "No colour" })[0]);
    expect(onStyleChange).toHaveBeenLastCalledWith({ tableHeaderColor: "transparent" });
    fireEvent.click(screen.getAllByRole("button", { name: "No colour" })[1]);
    expect(onStyleChange).toHaveBeenLastCalledWith({ tableCellColor: "transparent" });
    fireEvent.click(screen.getAllByRole("button", { name: "No colour" })[2]);
    expect(onStyleChange).toHaveBeenLastCalledWith({ tableAlternateColor: "transparent" });
  });
});
