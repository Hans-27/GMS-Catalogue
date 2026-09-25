import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudioOnlineCover } from "./studio-online-cover";

const cover = { asset_id: "cover-1", file_name: "cover.png", width: 900, height: 1200, url: "/api/cover/content" };
beforeEach(() => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:cover-preview");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

describe("Online cover panel", () => {
  it("previews a chosen image and saves only after Save cover", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<StudioOnlineCover cover={null} canEdit onSave={onSave} onRemove={vi.fn()} />);
    const file = new File(["image"], "finished.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Choose cover image"), { target: { files: [file] } });
    expect(screen.getByRole("img", { name: "Online cover preview" })).toHaveAttribute("src", "blob:cover-preview");
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save cover" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(file));
    expect(await screen.findByRole("status")).toHaveTextContent("Cover saved. Publish to update the online catalogue.");
  });

  it("rejects unsupported images without replacing the current preview", () => {
    render(<StudioOnlineCover cover={cover} canEdit onSave={vi.fn()} onRemove={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Choose cover image"), { target: { files: [new File(["pdf"], "cover.pdf", { type: "application/pdf" })] } });
    expect(screen.getByRole("alert")).toHaveTextContent("PNG, JPG or WebP");
    expect(screen.getByRole("img")).not.toHaveAttribute("src", "blob:cover-preview");
  });

  it("reports failed saves and allows retry", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("Could not save cover. Try again."));
    render(<StudioOnlineCover cover={null} canEdit onSave={onSave} onRemove={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Choose cover image"), { target: { files: [new File(["image"], "cover.jpg", { type: "image/jpeg" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Save cover" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save cover");
    expect(screen.getByRole("button", { name: "Save cover" })).toBeEnabled();
  });

  it("removes the saved cover only after confirmation", async () => {
    const onRemove = vi.fn().mockResolvedValue(undefined);
    render(<StudioOnlineCover cover={cover} canEdit onSave={vi.fn()} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove cover" }));
    expect(onRemove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
    await waitFor(() => expect(onRemove).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("status")).toHaveTextContent("Publish to use the generated cover");
  });

  it("keeps read-only users from changing the cover", () => {
    render(<StudioOnlineCover cover={cover} canEdit={false} onSave={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Remove cover" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Choose cover image")).toBeDisabled();
    expect(screen.getByText(/need catalogue edit permission/i)).toBeVisible();
  });

  it("rejects images larger than 20 MB", () => {
    render(<StudioOnlineCover cover={cover} canEdit onSave={vi.fn()} onRemove={vi.fn()} />);
    const file = new File(["image"], "cover.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: 20 * 1024 * 1024 + 1 });
    fireEvent.change(screen.getByLabelText("Choose cover image"), { target: { files: [file] } });
    expect(screen.getByRole("alert")).toHaveTextContent("20 MB or smaller");
  });
});
