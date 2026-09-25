import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudioLibrary } from "./studio-library";

const mocks = vi.hoisted(() => ({
  deleteExport: vi.fn(),
  getExports: vi.fn(),
  getTemplates: vi.fn(),
  importTemplate: vi.fn(),
}));

vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/lib/api", () => ({ API_ORIGIN: "http://127.0.0.1:8000" }));
vi.mock("@/lib/studio-api", () => ({
  deleteStudioExport: mocks.deleteExport,
  getStudioAssets: vi.fn(),
  getStudioExports: mocks.getExports,
  getStudioTemplates: mocks.getTemplates,
  importStudioTemplate: mocks.importTemplate,
  uploadStudioAsset: vi.fn(),
}));

describe("Studio export history", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.deleteExport.mockResolvedValue(undefined);
    mocks.getTemplates.mockResolvedValue([]);
    mocks.getExports.mockResolvedValue([{
      id: "export-1",
      design_id: "design-1",
      version_id: null,
      export_type: "print_pdf",
      status: "completed",
      options_json: {},
      storage_key: "catalogue-studio/exports/export-1.pdf",
      file_size: 1572864,
      error_message: null,
      started_at: "2026-08-14T06:30:05",
      completed_at: "2026-08-14T06:30:10Z",
      created_at: "2026-08-14T06:30:00",
    }]);
  });

  it("shows created and completed times in Bangkok time", async () => {
    render(<StudioLibrary mode="exports" />);
    expect(await screen.findByRole("heading", { name: "Print PDF" })).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(await screen.findByText("14 Aug 2026, 13:30:00")).toBeInTheDocument();
    expect(screen.getByText("14 Aug 2026, 13:30:05")).toBeInTheDocument();
    expect(screen.getByText("14 Aug 2026, 13:30:10")).toBeInTheDocument();
    expect(screen.getByText("Bangkok (UTC+7)")).toBeInTheDocument();
    expect(screen.getByText("1.5 MB")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute("href", "http://127.0.0.1:8000/api/v1/catalogue-studio/exports/export-1/content");
  });

  it("confirms and deletes a completed PDF beside its download action", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<StudioLibrary mode="exports" />);
    expect(await screen.findByRole("link", { name: "Download" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete PDF" }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("permanently removed"));
    await waitFor(() => expect(mocks.deleteExport).toHaveBeenCalledWith("export-1"));
    await waitFor(() => expect(screen.queryByRole("link", { name: "Download" })).not.toBeInTheDocument());
  });
});

describe("Studio template library", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getTemplates.mockResolvedValue([]);
    mocks.importTemplate.mockResolvedValue({
      id: "template-uploaded",
      template_type: "catalogue",
      name: "My uploaded template",
      description: "Imported Catalogue Studio template",
      template_data_json: { pages: [] },
      owner_user_id: "user-1",
      department_id: null,
      team_id: null,
      brand_scope_json: [],
      category_scope_json: [],
      visibility_scope: "private",
      is_company_template: false,
      approval_status: "draft",
      approved_by_id: null,
      approved_at: null,
      version: 1,
      is_active: true,
      usage_count: 0,
      tags: [],
      created_at: "2026-08-20T05:00:00Z",
      updated_at: "2026-08-20T05:00:00Z",
    });
  });

  it("uploads a GMS Template file and adds it to the library", async () => {
    render(<StudioLibrary mode="templates" />);
    const file = new File(
      [JSON.stringify({ format: "gms-catalogue-studio" })],
      "my-template.gmstemplate",
      { type: "application/vnd.gms.catalogue-template+json" },
    );

    fireEvent.change(screen.getByLabelText("↑ Choose template file"), { target: { files: [file] } });

    await waitFor(() => expect(mocks.importTemplate).toHaveBeenCalledWith(file, "catalogue"));
    expect(await screen.findByRole("heading", { name: "My uploaded template" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("ready to use");
  });

  it("rejects unsupported template files before upload", async () => {
    render(<StudioLibrary mode="templates" />);
    const file = new File(["not a template"], "template.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });

    fireEvent.change(screen.getByLabelText("↑ Choose template file"), { target: { files: [file] } });

    expect(await screen.findByRole("alert")).toHaveTextContent("PDF, PNG, JPG, WebP");
    expect(mocks.importTemplate).not.toHaveBeenCalled();
  });

  it.each([
    ["PDF", "catalogue.pdf", "application/pdf"],
    ["PNG", "catalogue.png", "image/png"],
    ["JPG", "catalogue.jpg", "image/jpeg"],
    ["WebP", "catalogue.webp", "image/webp"],
  ])("accepts a %s file as a catalogue template", async (_, fileName, type) => {
    render(<StudioLibrary mode="templates" />);
    const file = new File(["visual template"], fileName, { type });

    fireEvent.change(screen.getByLabelText("↑ Choose template file"), { target: { files: [file] } });

    await waitFor(() => expect(mocks.importTemplate).toHaveBeenCalledWith(file, "catalogue"));
  });

  it("does not expose JSON terminology in the template upload interface", async () => {
    render(<StudioLibrary mode="templates" />);

    await screen.findByText("Import a saved template");
    expect(screen.queryByText(/JSON/i)).not.toBeInTheDocument();
    expect(screen.getByText(/PDF, PNG, JPG, or WebP/)).toBeInTheDocument();
  });

  it("uploads a valid cover template from the Cover Templates page", async () => {
    mocks.importTemplate.mockResolvedValue({
      id: "cover-uploaded",
      template_type: "cover",
      name: "My cover template",
      description: "Uploaded cover",
      template_data_json: { pages: [] },
      visibility_scope: "private",
      version: 1,
    });
    render(<StudioLibrary mode="cover" />);
    const file = new File([JSON.stringify({
      format: "gms-catalogue-studio",
      schema_version: 1,
      template: { template_type: "cover" },
    })], "cover-template.gmstemplate", { type: "application/vnd.gms.catalogue-template+json" });

    fireEvent.change(screen.getByLabelText("↑ Choose cover file"), { target: { files: [file] } });

    await waitFor(() => expect(mocks.importTemplate).toHaveBeenCalledWith(file, "cover"));
    expect(await screen.findByRole("heading", { name: "My cover template" })).toBeInTheDocument();
  });

  it.each([
    ["PDF", "cover.pdf", "application/pdf"],
    ["PNG", "cover.png", "image/png"],
    ["JPG", "cover.jpg", "image/jpeg"],
    ["WebP", "cover.webp", "image/webp"],
  ])("accepts a %s file as a cover template", async (_, fileName, type) => {
    render(<StudioLibrary mode="cover" />);
    const file = new File(["cover artwork"], fileName, { type });

    fireEvent.change(screen.getByLabelText("↑ Choose cover file"), { target: { files: [file] } });

    await waitFor(() => expect(mocks.importTemplate).toHaveBeenCalledWith(file, "cover"));
  });

  it("does not import a non-cover template into the Cover Templates library", async () => {
    render(<StudioLibrary mode="cover" />);
    const file = new File([JSON.stringify({
      format: "gms-catalogue-studio",
      schema_version: 1,
      template: { template_type: "catalogue" },
    })], "catalogue-template.gmstemplate", { type: "application/vnd.gms.catalogue-template+json" });

    fireEvent.change(screen.getByLabelText("↑ Choose cover file"), { target: { files: [file] } });

    expect(await screen.findByRole("alert")).toHaveTextContent("cover template exported from Catalogue Studio");
    expect(mocks.importTemplate).not.toHaveBeenCalled();
  });

  it("previews saved template pages without creating a catalogue", async () => {
    mocks.getTemplates.mockResolvedValue([{
      id: "template-standard",
      template_type: "catalogue",
      name: "GMS Standard Brand Catalogue",
      description: "Approved four-page catalogue structure",
      template_data_json: {
        pages: [
          {
            id: "cover-page",
            page_name: "Cover",
            page_type: "cover",
            display_order: 1,
            width: 1123,
            height: 794,
            background_color: "#ECF8F0",
            page_data_json: {
              pageId: "cover-page",
              pageType: "cover",
              name: "Cover",
              canvas: { width: 1123, height: 794, backgroundColor: "#ECF8F0", gridSize: 16, showGrid: false, showGuides: false, showSafeArea: false, bleed: 0 },
              elements: [],
              dataMode: "snapshot",
            },
          },
          {
            id: "products-page",
            page_name: "Products",
            page_type: "product_grid",
            display_order: 2,
            width: 794,
            height: 1123,
            background_color: "#FFFFFF",
            page_data_json: {
              pageId: "products-page",
              pageType: "product_grid",
              name: "Products",
              canvas: { width: 794, height: 1123, backgroundColor: "#FFFFFF", gridSize: 16, showGrid: false, showGuides: false, showSafeArea: false, bleed: 0 },
              elements: [],
              dataMode: "snapshot",
            },
          },
        ],
      },
      visibility_scope: "company",
      version: 3,
    }]);

    render(<StudioLibrary mode="templates" />);
    fireEvent.click(await screen.findByRole("button", { name: "Preview" }));

    const dialog = screen.getByRole("dialog", { name: "Preview GMS Standard Brand Catalogue" });
    expect(within(dialog).getByText("Page 1 of 2")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Use this template" })).toHaveAttribute("href", "/catalogue-studio/new?templateId=template-standard");

    fireEvent.click(within(dialog).getByRole("button", { name: /2\s+Products/ }));
    expect(within(dialog).getByText("Page 2 of 2")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close template preview" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
