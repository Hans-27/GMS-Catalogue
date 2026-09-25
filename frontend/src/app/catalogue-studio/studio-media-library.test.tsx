import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StudioAsset } from "@/lib/studio-api";
import { StudioMediaLibrary } from "./studio-media-library";

const adapter: StudioAsset = { id: "asset-1", asset_type: "image", original_filename: "adapter.jpg", mime_type: "image/jpeg", file_size: 4096, width: 600, height: 600, alt_text: "USB connector", tags: [], url: "/api/asset-1/content", created_at: "2026-09-15" };
const cable: StudioAsset = { ...adapter, id: "asset-2", original_filename: "cable.jpg", alt_text: "Audio cable", url: "/api/asset-2/content" };

describe("Studio uploaded media library", () => {
  // Catches a nonfunctional search or callbacks bound to the wrong filtered item.
  it("searches authorized uploads by alt text and adds the original matching asset", () => {
    const onAdd = vi.fn();
    render(<StudioMediaLibrary assets={[adapter, cable]} onAdd={onAdd} />);
    fireEvent.change(screen.getByLabelText("Search uploads"), { target: { value: "CONNECTOR" } });
    expect(screen.queryByRole("button", { name: /cable.jpg/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /adapter.jpg/ }));
    expect(onAdd).toHaveBeenCalledWith(adapter);
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("button", { name: /cable.jpg/ })).toBeInTheDocument();
  });

  // Catches losing the item action when its real image endpoint fails.
  it("retains a labelled item when the image preview fails", () => {
    render(<StudioMediaLibrary assets={[adapter]} onAdd={vi.fn()} />);
    fireEvent.error(screen.getByRole("img", { name: "USB connector" }));
    expect(screen.getByText("Image preview unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /adapter.jpg/ })).toBeEnabled();
  });

  // Catches conflating an empty library with a search that hides existing items.
  it("distinguishes an empty library from a search with no matches", () => {
    const { rerender } = render(<StudioMediaLibrary assets={[]} onAdd={vi.fn()} />);
    expect(screen.getByText("No uploads yet. Upload an image or video to get started.")).toBeInTheDocument();
    rerender(<StudioMediaLibrary assets={[adapter]} onAdd={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Search uploads"), { target: { value: "no-match" } });
    expect(screen.getByText("No uploads match your search.")).toBeInTheDocument();
  });
});
