import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import { CustomerPortal } from "./customer-portal";

const { replace, getCustomerPortal, logout } = vi.hoisted(() => ({
  replace: vi.fn(),
  getCustomerPortal: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams("access=secure-customer-token-1234567890"),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    getCurrentUser: vi.fn().mockResolvedValue({
      id: "customer-user-1",
      username: "customer",
      email: "customer@example.com",
      full_name: "Customer Account",
      roles: ["customer_user"],
      permissions: ["catalogues.view"],
    }),
    getCustomerPortal,
    logout,
  };
});

const portal = {
  customer: {
    code: "SIAM-RETAIL-CO",
    name: "Siam Retail Co.",
    audience_code: "normal",
    audience_name: "Normal",
  },
  catalogues: [
    {
      id: "catalogue-1",
      title: "Nubwo X-Series 2026",
      brand: "Nubwo",
      description: "Gaming products",
      updated_at: "2026-08-12T00:00:00Z",
      product_count: 24,
      cover_url: "/api/v1/catalogues/catalogue-1/cover/assets/cover-1/content?preview=true",
      public_url: "http://localhost/c/catalogue-token",
      pdf_url: "http://localhost:8000/api/v1/public/catalogues/catalogue-token/pdf",
      allow_pdf_download: true,
    },
  ],
  promotions: [
    {
      id: "promotion-1",
      name: "September Business Offers",
      description: "Save on selected products.",
      cover_url: "/uploads/promotion-cover.webp",
      start_at: "2026-09-01T00:00:00Z",
      end_at: "2026-09-30T00:00:00Z",
      public_url: "http://localhost/p/promotion-token",
      catalogue_ids: ["catalogue-1"],
    },
  ],
  brand_prices: [
    { brand: "Nubwo", price_list_code: "SP2", price_list_name: "SP2", is_brand_override: true },
  ],
};

describe("CustomerPortal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("gms-catalogue-language", "en");
    getCustomerPortal.mockResolvedValue(portal);
  });

  it("shows a customer-scoped home with published catalogues, promotions and pricing context", async () => {
    render(
      <LanguageProvider>
        <CustomerPortal />
      </LanguageProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Good morning, Siam Retail Co." })).toBeInTheDocument();
    expect(screen.getByText("1 available catalogue")).toBeInTheDocument();
    expect(screen.getByText("1 active promotion")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nubwo X-Series 2026" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Nubwo X-Series 2026 cover" })).toBeInTheDocument();
    expect(screen.getByText("Nubwo → SP2")).toBeInTheDocument();
    await waitFor(() => {
      expect(window.sessionStorage.getItem("gms-customer-access")).toBe("secure-customer-token-1234567890");
    });
  });

  it("opens an account menu before signing the customer out", async () => {
    render(
      <LanguageProvider>
        <CustomerPortal />
      </LanguageProvider>,
    );

    const accountMenu = await screen.findByRole("button", { name: "Open customer account menu" });
    fireEvent.click(accountMenu);

    expect(logout).not.toHaveBeenCalled();
    const signOut = screen.getByRole("menuitem", { name: "Sign out" });
    fireEvent.click(signOut);

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(replace).toHaveBeenCalledWith("/login");
  });
});
