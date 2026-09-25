import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PriceManagement,
  customerLevelLabel,
  customerLevelNamesForPriceList,
} from "./price-management";

const mocks = vi.hoisted(() => ({
  getPriceLists: vi.fn(),
  getErpCustomerPriceLevels: vi.fn(),
  getMyCataloguePriceMappings: vi.fn(),
  getMyCataloguePriceMappingSummary: vi.fn(),
  updateMyCataloguePriceMappings: vi.fn(),
  getErpProductPriceMatrix: vi.fn(),
  getErpCustomerPriceFilters: vi.fn(),
  getProductPrices: vi.fn(),
  getPriceChangeRequests: vi.fn(),
  getProducts: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  createPriceList: vi.fn(),
  createProductPrice: vi.fn(),
  getPriceChangeRequests: mocks.getPriceChangeRequests,
  getErpCustomerPriceFilters: mocks.getErpCustomerPriceFilters,
  getErpCustomerPriceLevels: mocks.getErpCustomerPriceLevels,
  getErpProductPriceMatrix: mocks.getErpProductPriceMatrix,
  getMyCataloguePriceMappings: mocks.getMyCataloguePriceMappings,
  getMyCataloguePriceMappingSummary: mocks.getMyCataloguePriceMappingSummary,
  getPriceLists: mocks.getPriceLists,
  getProductPrices: mocks.getProductPrices,
  getProducts: mocks.getProducts,
  proposePriceChange: vi.fn(),
  reviewPriceChange: vi.fn(),
  updateMyCataloguePriceMappings: mocks.updateMyCataloguePriceMappings,
}));

const priceLists = [
  { id: 1, code: "NORMAL", name: "Normal", description: "", currency: "THB", is_no_price: false, is_active: true, created_at: "2026-08-11T00:00:00Z", updated_at: "2026-08-11T00:00:00Z" },
  { id: 2, code: "VIP", name: "VIP", description: "", currency: "THB", is_no_price: false, is_active: true, created_at: "2026-08-11T00:00:00Z", updated_at: "2026-08-11T00:00:00Z" },
  { id: 3, code: "BIG_CUSTOMER", name: "Big Customer", description: "", currency: "THB", is_no_price: false, is_active: true, created_at: "2026-08-11T00:00:00Z", updated_at: "2026-08-11T00:00:00Z" },
];

const levels = [
  { id: 1, erp_price_type_id: 1, source_code: "SP1", source_name: "Normal", price_list_id: 1, price_list_code: "NORMAL", price_list_name: "Normal", product_count: 10, sort_order: 1, is_active: true, last_synced_at: "2026-08-11T00:00:00Z" },
  { id: 2, erp_price_type_id: 2, source_code: "SP2", source_name: "VIP", price_list_id: 2, price_list_code: "VIP", price_list_name: "VIP", product_count: 10, sort_order: 2, is_active: true, last_synced_at: "2026-08-11T00:00:00Z" },
  { id: 3, erp_price_type_id: 3, source_code: "SP3", source_name: "Big Customer", price_list_id: 3, price_list_code: "BIG_CUSTOMER", price_list_name: "Big Customer", product_count: 10, sort_order: 3, is_active: true, last_synced_at: "2026-08-11T00:00:00Z" },
];

const mappings = [
  { audience_type_id: 1, audience_code: "normal", audience_name: "SP1 \u00b7 Normal", price_list_id: 1, price_list_code: "NORMAL", price_list_name: "Normal", erp_source_code: "SP1", erp_source_name: "Normal", show_prices: true, is_custom: false },
  { audience_type_id: 2, audience_code: "vip", audience_name: "VIP BKK", price_list_id: 2, price_list_code: "VIP", price_list_name: "VIP", erp_source_code: "SP2", erp_source_name: "VIP", show_prices: true, is_custom: false },
];

describe("customerLevelLabel", () => {
  it.each([
    ["SP1 \u00b7 Normal", "Normal"],
    ["SP2 \u00c2\u00b7 VIP", "VIP BKK"],
    ["SP3 \u0e22\u0e17 Big Customer", "Big Customer"],
    ["SRP - Retail", "Retail"],
    ["VIP Province", "VIP Province"],
    ["No Price", "No Price"],
  ])("turns %s into %s", (source, expected) => {
    expect(customerLevelLabel(source)).toBe(expected);
  });

  it("uses the stable customer-level code when legacy text is malformed", () => {
    expect(customerLevelLabel("SP1 broken value", "normal")).toBe("Normal");
    expect(customerLevelLabel("SP3 broken value", "big_customer_vip")).toBe(
      "Big Customer",
    );
  });

  it("groups the signed-in user's selected customer levels under their ERP price", () => {
    expect(customerLevelNamesForPriceList(mappings, 1)).toEqual(["Normal"]);
    expect(customerLevelNamesForPriceList(mappings, 2)).toEqual(["VIP BKK"]);
    expect(customerLevelNamesForPriceList(mappings, 3)).toEqual([]);
  });
});

describe("PriceManagement customer-level mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPriceLists.mockResolvedValue(priceLists);
    mocks.getErpCustomerPriceLevels.mockResolvedValue(levels);
    mocks.getMyCataloguePriceMappings.mockResolvedValue(mappings);
    mocks.getMyCataloguePriceMappingSummary.mockResolvedValue([]);
    mocks.getErpProductPriceMatrix.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50, pages: 1 });
    mocks.getErpCustomerPriceFilters.mockResolvedValue({ brands: [], categories: [] });
    mocks.getProductPrices.mockResolvedValue([]);
    mocks.getPriceChangeRequests.mockResolvedValue([]);
    mocks.getProducts.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20, pages: 1 });
    mocks.updateMyCataloguePriceMappings.mockResolvedValue([
      mappings[0],
      { ...mappings[1], price_list_id: 3, price_list_code: "BIG_CUSTOMER", price_list_name: "Big Customer", erp_source_code: "SP3", erp_source_name: "Big Customer", is_custom: true },
    ]);
  });

  it("lets the signed-in user map a customer level to a different ERP price", async () => {
    const onToast = vi.fn();
    render(
      <PriceManagement
        currentUser={{ id: "user-a", username: "user.a", email: "a@example.com", full_name: "User A", roles: [], permissions: ["prices.view"] }}
        onToast={onToast}
      />,
    );

    const vipSelect = await screen.findByRole("combobox", { name: "ERP price for VIP BKK" });
    expect(vipSelect).toHaveValue("2");
    expect(screen.getAllByRole("option", { name: /^SP2\s/ }).length).toBeGreaterThan(0);
    expect(screen.getByText("ERP level: SP2")).toBeInTheDocument();

    fireEvent.change(vipSelect, { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save default mapping" }));

    await waitFor(() => {
      expect(mocks.updateMyCataloguePriceMappings).toHaveBeenCalledWith([
        { audience_type_id: 1, price_list_id: 1 },
        { audience_type_id: 2, price_list_id: 3 },
      ]);
    });
    expect(onToast).toHaveBeenCalledWith("Your catalogue price mapping was saved.");
  });

  it("loads and saves an independent mapping for the selected brand", async () => {
    mocks.getErpCustomerPriceFilters.mockResolvedValue({
      brands: [{ name: "NUBWO", product_count: 24 }],
      categories: [],
    });
    mocks.getMyCataloguePriceMappingSummary.mockResolvedValue([
      { brand: "NUBWO", product_count: 24, override_count: 0, audience_count: 2, status: "default" },
    ]);
    const brandMappings = mappings.map((mapping) => ({
      ...mapping,
      brand: "NUBWO",
      is_brand_override: false,
    }));
    mocks.getMyCataloguePriceMappings
      .mockResolvedValueOnce(mappings)
      .mockResolvedValueOnce(brandMappings);
    mocks.updateMyCataloguePriceMappings.mockResolvedValue(
      brandMappings.map((mapping) => ({ ...mapping, is_brand_override: true })),
    );

    render(
      <PriceManagement
        currentUser={{ id: "user-a", username: "user.a", email: "a@example.com", full_name: "User A", roles: [], permissions: ["prices.view"] }}
        onToast={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /^NUBWO/ }));
    await screen.findByText("NUBWO price mapping");
    fireEvent.click(screen.getByRole("button", { name: "Save brand mapping" }));

    await waitFor(() => {
      expect(mocks.updateMyCataloguePriceMappings).toHaveBeenCalledWith(
        mappings.map((mapping) => ({ audience_type_id: mapping.audience_type_id, price_list_id: mapping.price_list_id })),
        "NUBWO",
      );
    });
  });

  it("reloads all pricing data when Refresh is clicked", async () => {
    const onToast = vi.fn();
    render(
      <PriceManagement
        currentUser={{ id: "user-a", username: "user.a", email: "a@example.com", full_name: "User A", roles: [], permissions: ["prices.view"] }}
        onToast={onToast}
      />,
    );

    await screen.findByRole("button", { name: "Refresh" });
    const initialPriceListCalls = mocks.getPriceLists.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(mocks.getPriceLists).toHaveBeenCalledTimes(initialPriceListCalls + 1);
      expect(mocks.getErpCustomerPriceLevels).toHaveBeenCalledTimes(2);
      expect(mocks.getMyCataloguePriceMappings).toHaveBeenCalledTimes(2);
      expect(mocks.getMyCataloguePriceMappingSummary).toHaveBeenCalledTimes(2);
      expect(mocks.getErpProductPriceMatrix).toHaveBeenCalledTimes(2);
      expect(mocks.getErpCustomerPriceFilters).toHaveBeenCalledTimes(2);
      expect(mocks.getProductPrices).toHaveBeenCalledTimes(2);
      expect(mocks.getPriceChangeRequests).toHaveBeenCalledTimes(2);
      expect(mocks.getProducts).toHaveBeenCalledTimes(2);
    });
    expect(onToast).toHaveBeenCalledWith("Price data refreshed.");
  });

  it("removes the redundant catalogue mapping tab without removing either pricing view", async () => {
    render(
      <PriceManagement
        currentUser={{ id: "user-a", username: "user.a", email: "a@example.com", full_name: "User A", roles: [], permissions: ["prices.view"] }}
        onToast={vi.fn()}
      />,
    );

    await screen.findByRole("heading", { name: "Choose a brand" });
    expect(
      screen.queryByRole("button", { name: "Catalogue price mapping" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ERP price matrix" }));
    await screen.findByRole("heading", { name: "ERP customer price matrix" });
    fireEvent.click(screen.getByRole("button", { name: "Back to price mapping" }));
    await screen.findByRole("heading", { name: "Choose a brand" });
    expect(
      screen.queryByRole("button", { name: "Price history" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Approval queue/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Price lists" }),
    ).not.toBeInTheDocument();
  });
});
