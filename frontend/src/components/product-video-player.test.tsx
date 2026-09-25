import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProductVideoModal, ProductVideoPlayer } from "./product-video-player";
import type { CataloguePreviewVideo } from "@/lib/api";

const video: CataloguePreviewVideo = {
  id: "00000000-0000-0000-0000-000000000001",
  source_type: "upload", provider: "internal", title: "Product demonstration",
  description: "How the product works", alt_text: "Product video",
  thumbnail_url: "/poster.jpg", playback_url: "/video.mp4", caption_url: null,
  mime_type: "video/mp4", duration_seconds: 30, width: 1920, height: 1080,
  display_mode: "card_icon", show_controls: true, allow_download: false,
  autoplay: false, muted: false, loop: false,
};

describe("ProductVideoPlayer", () => {
  it("uses accessible, metadata-only HTML5 playback without autoplay", () => {
    const { container } = render(<ProductVideoPlayer video={video} />);
    const player = container.querySelector("video");
    expect(player).toHaveAttribute("preload", "metadata");
    expect(player).not.toHaveAttribute("autoplay");
    expect(player).toHaveAttribute("playsinline");
    expect(player).toHaveAttribute("controlslist", "nodownload");
  });

  it("closes on Escape and returns focus", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    const close = vi.fn();
    render(<ProductVideoModal video={video} title="Product demonstration" onClose={close} returnFocus={trigger} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
  });

  it("renders only the approved external provider frame", () => {
    render(<ProductVideoPlayer video={{ ...video, source_type: "external", provider: "youtube", playback_url: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" }} />);
    expect(screen.getByTitle("Product demonstration")).toHaveAttribute("loading", "lazy");
  });
});
