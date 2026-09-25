import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NewStudioDesign from "./page";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  create: vi.fn(),
  upload: vi.fn(),
  updatePage: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams("catalogueId=cat-1"),
}));

vi.mock("@/lib/api", () => ({
  getBrands: vi.fn().mockResolvedValue([
    { id: 1, name: "A", code: "A", description: "", is_active: true, team_count: 0 },
    { id: 2, name: "B", code: "B", description: "", is_active: true, team_count: 0 },
  ]),
  getPriceLists: vi.fn().mockResolvedValue([
    { id: 1, name: "Normal", code: "NORMAL", description: "", currency: "THB", is_no_price: false, is_active: true, created_at: "", updated_at: "" },
    { id: 2, name: "VIP BKK", code: "VIP", description: "", currency: "THB", is_no_price: false, is_active: true, created_at: "", updated_at: "" },
    { id: 3, name: "No Price", code: "NO_PRICE", description: "", currency: "THB", is_no_price: true, is_active: true, created_at: "", updated_at: "" },
  ]),
  getPromotionOccasions: vi.fn().mockResolvedValue([
    { id: 1, name_en: "New Year", is_active: true },
  ]),
}));

vi.mock("@/lib/studio-api", () => ({
  createStudioDesign: (payload: unknown) => mocks.create(payload),
  getStudioTemplates: vi.fn().mockResolvedValue([]),
  updateStudioPage: (...args: unknown[]) => mocks.updatePage(...args),
  uploadStudioAsset: (...args: unknown[]) => mocks.upload(...args),
}));

function continueSetup() {
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

function enterDetails(name: string, type: "standard" | "booklet" | "promotion" = "standard") {
  continueSetup();
  fireEvent.change(screen.getByLabelText("Catalogue name"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Catalogue type"), { target: { value: type } });
  continueSetup();
}

describe("Studio creation workflow", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.push.mockReset();
    mocks.upload.mockReset();
    mocks.updatePage.mockReset();
    mocks.create.mockResolvedValue({
      id: "design-1",
      revision: 1,
      pages: [{ id: "page-1", page_data_json: { elements: [] } }],
    });
    mocks.upload.mockResolvedValue({ id: "asset-1" });
    mocks.updatePage.mockResolvedValue({});
  });

  it("uses three clear workflows and validates required details", () => {
    render(<NewStudioDesign />);
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Blank catalogue")).toBeChecked();
    expect(screen.getByLabelText("Use a template")).toBeInTheDocument();
    expect(screen.getByLabelText("Upload finished artwork")).toBeInTheDocument();
    expect(screen.queryByLabelText("A4 Blank Image Page")).not.toBeInTheDocument();

    continueSetup();
    expect(screen.getByRole("heading", { name: "Name and format" })).toBeInTheDocument();
    continueSetup();
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Catalogue name")).toBeInvalid();
  });

  it("explains that ERP stock stays live when prices and product details are fixed", () => {
    // Production defect: the setup copy said snapshot mode froze stock even
    // though every account must receive current ERP inventory.
    render(<NewStudioDesign />);
    continueSetup();

    expect(screen.getByText("Keep ERP prices and product details synchronized")).toBeInTheDocument();
    expect(screen.getByText("Stock always stays live. Turn off to keep prices and product details fixed.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Catalogue name"), {
      target: { value: "Fixed prices, live stock" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    continueSetup();

    expect(screen.getByText("Live stock · fixed prices and details")).toBeInTheDocument();
  });

  it("creates a blank multi-brand design", async () => {
    render(<NewStudioDesign />);
    enterDetails("Blank test");
    fireEvent.click(screen.getByLabelText("Selected brands"));
    fireEvent.click(await screen.findByLabelText("A"));
    fireEvent.click(await screen.findByLabelText("B"));
    fireEvent.click(screen.getByRole("button", { name: "Create and open Studio" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.create.mock.calls[0][0]).toMatchObject({
      name: "Blank test",
      start_mode: "blank",
      brand_mode: "multiple",
      brand_ids: [1, 2],
      catalogue_id: "cat-1",
    });
    expect(mocks.push).toHaveBeenCalledWith("/catalogue-studio/design-1/editor");
  });

  it("keeps promotion scheduling in the final third step", () => {
    render(<NewStudioDesign />);
    enterDetails("New Year", "promotion");
    expect(screen.getByText("Step 3 of 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Start date and time")).toBeInTheDocument();
    expect(screen.getByLabelText("End date and time")).toBeInTheDocument();
  });

  it("adds VIP Province only after the user enables customer prices", async () => {
    render(<NewStudioDesign />);
    enterDetails("Province catalogue");
    expect(screen.queryByLabelText("Primary price")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Show customer prices"));

    const price = screen.getByLabelText("Primary price") as HTMLSelectElement;
    await waitFor(() =>
      expect(Array.from(price.options).map((option) => option.text)).toContain("VIP Province"),
    );
    fireEvent.change(price, { target: { value: "vip-province:2" } });
    fireEvent.click(screen.getByRole("button", { name: "Create and open Studio" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.create.mock.calls[0][0].price_slots).toEqual([
      {
        slot_number: 1,
        price_list_id: 2,
        display_label: "VIP Province",
        currency_display: "code",
        decimal_places: 2,
        is_visible: true,
      },
    ]);
  });

  it("creates a booklet presentation", async () => {
    render(<NewStudioDesign />);
    enterDetails("Interactive book", "booklet");
    fireEvent.click(screen.getByRole("button", { name: "Create and open Studio" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.create.mock.calls[0][0]).toMatchObject({
      name: "Interactive book",
      catalogue_type: "booklet",
    });
  });

  it("merges image-only setup into the finished artwork workflow", async () => {
    render(<NewStudioDesign />);
    fireEvent.click(screen.getByLabelText("Upload finished artwork"));
    const file = new File(["image"], "brochure.webp", { type: "image/webp" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    continueSetup();

    fireEvent.change(screen.getByLabelText("Catalogue name"), {
      target: { value: "Uploaded brochure" },
    });
    fireEvent.change(screen.getByLabelText("Catalogue type"), {
      target: { value: "booklet" },
    });
    fireEvent.change(screen.getByLabelText("Page size"), {
      target: { value: "a4_landscape" },
    });
    continueSetup();
    expect(screen.queryByText("Customer prices")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create and open Studio" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.create.mock.calls[0][0]).toMatchObject({
      start_mode: "upload_template",
      size_preset: "a4_landscape",
      page_width: 1123,
      page_height: 794,
      orientation: "landscape",
      data_mode: "snapshot",
      catalogue_id: null,
      catalogue_type: "booklet",
      brand_ids: [],
      price_slots: [],
    });
    await waitFor(() => expect(mocks.updatePage).toHaveBeenCalled());
    expect(mocks.updatePage.mock.calls[0][2].page_data.elements[0].style).toEqual({
      objectFit: "contain",
    });
  });
});
