import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CatalogueImageDialog,
  type CatalogueImageSelection,
} from "./catalogue-image-dialog";

vi.mock("@/lib/api", () => ({ API_ORIGIN: "http://127.0.0.1:8000" }));

const originalFetch = globalThis.fetch;

function selection(images = [
  { url: "http://127.0.0.1:8000/media/front.png", altText: "Adapter front" },
  { url: "http://127.0.0.1:8000/media/back.jpg", altText: "Adapter back" },
]): CatalogueImageSelection {
  const returnFocus = document.createElement("button");
  returnFocus.textContent = "Open images";
  document.body.appendChild(returnFocus);
  return {
    productName: "Universal adapter",
    productCode: "LP-002U",
    images,
    index: 0,
    returnFocus,
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  document.body.style.overflow = "";
});

describe("CatalogueImageDialog", () => {
  it("shows every image action and wraps through the product images", () => {
    const selected = selection();
    render(
      <CatalogueImageDialog selection={selected} onClose={vi.fn()} />,
    );

    expect(screen.getByRole("dialog", { name: "Universal adapter" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close image preview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous image" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Download image" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next image" })).toBeEnabled();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous image" }));
    expect(screen.getByRole("img", { name: "Adapter back" })).toBeInTheDocument();
    expect(screen.getByText("2 of 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByRole("img", { name: "Adapter front" })).toBeInTheDocument();
  });

  it("keeps navigation visible but disabled for one image", () => {
    render(
      <CatalogueImageDialog
        selection={selection([{ url: "http://127.0.0.1:8000/media/front.png", altText: "Adapter front" }])}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Previous image" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next image" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download image" })).toBeEnabled();
  });

  it("closes from Escape and restores page state and opener focus on unmount", () => {
    const selected = selection();
    const onClose = vi.fn();
    const { unmount } = render(
      <CatalogueImageDialog selection={selected} onClose={onClose} />,
    );

    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    unmount();
    expect(document.body.style.overflow).toBe("");
    expect(selected.returnFocus).toHaveFocus();
  });

  it("downloads the selected backend image without transforming its response", async () => {
    const imageBlob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(imageBlob, {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Content-Disposition": 'attachment; filename="adapter-original.jpg"',
        },
      }),
    );
    globalThis.fetch = fetchMock;

    render(
      <CatalogueImageDialog
        selection={selection()}
        requestHeaders={{ "X-Catalogue-Password": "secret" }}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Download image" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/media/front.png",
      expect.objectContaining({ headers: { "X-Catalogue-Password": "secret" } }),
    );
    expect(URL.createObjectURL).toHaveBeenCalledWith(imageBlob);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:catalogue-preview");
  });

  it("downloads an ERP upload through the same-origin image route in its original format", async () => {
    const originalImage = new Blob([new Uint8Array([82, 73, 70, 70])], { type: "image/webp" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(originalImage, {
        status: 200,
        headers: { "Content-Type": "image/webp" },
      }),
    );
    globalThis.fetch = fetchMock;
    const selected = selection([{
      url: "http://127.0.0.1:8000/uploads/erp-front.webp",
      altText: "Adapter front",
    }]);

    render(<CatalogueImageDialog selection={selected} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Download image" }));

    await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/catalogue-card-image?path=%2Fuploads%2Ferp-front.webp",
      expect.any(Object),
    );
    expect(URL.createObjectURL).toHaveBeenCalledWith(originalImage);
    expect((HTMLAnchorElement.prototype.click as ReturnType<typeof vi.fn>).mock.instances[0].download)
      .toBe("erp-front.webp");
  });

  it("does not forward backend credentials to an external image host", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Blob(["image"], { type: "image/png" }), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );
    globalThis.fetch = fetchMock;

    render(
      <CatalogueImageDialog
        selection={selection([{ url: "https://cdn.example.com/product.png", altText: "Adapter" }])}
        requestHeaders={{ "X-Catalogue-Password": "secret" }}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Download image" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "https://cdn.example.com/product.png",
      expect.objectContaining({ headers: {} }),
    );
  });

  it("shows a retryable error for a non-image response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("not an image", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      }),
    );
    render(
      <CatalogueImageDialog selection={selection()} onClose={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Download image" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Image download failed. Try again.",
    );
    expect(screen.getByRole("button", { name: "Download image" })).toBeEnabled();
  });
});
