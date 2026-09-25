import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import type { AuthenticatedUser, Category } from "@/lib/api";
import DashboardPage from "./page";

const apiMocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getCategories: vi.fn(),
  getDashboardSyncStatus: vi.fn(),
  updateCategory: vi.fn(),
  updateBrandStatus: vi.fn(),
}));
const routerMock = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  ...apiMocks,
}));

const user: AuthenticatedUser = {
  id: "admin-1",
  username: "admin",
  email: "admin@example.com",
  full_name: "Catalogue Admin",
  roles: ["superadmin"],
  permissions: ["categories.view", "categories.edit"],
  is_superadmin: true,
};

const categories: Category[] = [
  {
    id: 1,
    name: "Mouse",
    slug: "mouse",
    description: "Pointing devices",
    is_active: true,
    product_count: 8,
    brands: [
      { id: 10, name: "EGA", product_count: 3, is_active: true, inactive_reason: "" },
      { id: 11, name: "Nubwo", product_count: 5, is_active: true, inactive_reason: "" },
    ],
  },
  {
    id: 2,
    name: "Keyboard",
    slug: "keyboard",
    description: "Input devices",
    is_active: false,
    product_count: 4,
    brands: [{ id: 11, name: "Nubwo", product_count: 4, is_active: true, inactive_reason: "" }],
  },
];

function renderPage() {
  return render(
    <LanguageProvider>
      <DashboardPage />
    </LanguageProvider>,
  );
}

describe("category management", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/dashboard?view=categories");
    window.localStorage.clear();
    Object.defineProperty(window, "scrollTo", { configurable: true, value: vi.fn() });
    apiMocks.getCurrentUser.mockResolvedValue(user);
    apiMocks.getCategories.mockResolvedValue(categories);
    apiMocks.getDashboardSyncStatus.mockResolvedValue(null);
    apiMocks.updateCategory.mockImplementation(async (categoryId, payload) => ({
      ...categories.find((category) => category.id === categoryId)!,
      ...payload,
    }));
    apiMocks.updateBrandStatus.mockImplementation(async (brandId, payload) => ({
      id: brandId,
      name: brandId === 10 ? "EGA" : "Nubwo",
      code: brandId === 10 ? "EGA" : "NUBWO",
      description: "",
      is_active: payload.is_active,
      inactive_reason: payload.inactive_reason || "",
      team_count: 0,
    }));
  });

  it("loads active and inactive categories for management", async () => {
    renderPage();

    await screen.findByRole("heading", { name: "Categories" });
    expect(apiMocks.getCategories).toHaveBeenCalledWith(true, true);
    fireEvent.click(screen.getByRole("button", { name: "Nubwo categories" }));
    expect(screen.getByText("Keyboard")).toBeInTheDocument();
  });

  it("shows every brand as a collapsed dropdown and reveals its categories on demand", async () => {
    renderPage();

    const egaDropdown = await screen.findByRole("button", {
      name: "EGA categories",
    });
    const nubwoDropdown = screen.getByRole("button", {
      name: "Nubwo categories",
    });

    expect(egaDropdown).toHaveAttribute("aria-expanded", "false");
    expect(nubwoDropdown).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: "Open Mouse product list for EGA" }),
    ).not.toBeInTheDocument();

    fireEvent.click(egaDropdown);

    expect(egaDropdown).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: "Open Mouse product list for EGA" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open Keyboard product list for Nubwo" }),
    ).not.toBeInTheDocument();

    fireEvent.click(egaDropdown);

    expect(egaDropdown).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: "Open Mouse product list for EGA" }),
    ).not.toBeInTheDocument();
  });

  it("does not render the separate brand filter chips", async () => {
    renderPage();

    await screen.findByRole("button", { name: "EGA categories" });
    expect(
      screen.queryByRole("group", { name: "Filter categories by brand" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "All brands" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Nubwo categories" }),
    ).toBeInTheDocument();
  });

  it("changes each category between Active and Inactive", async () => {
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Nubwo categories" }),
    );
    const toggle = await screen.findByRole("switch", { name: "Keyboard (Nubwo) category status" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).toHaveTextContent("Inactive");

    fireEvent.click(toggle);

    await waitFor(() => expect(apiMocks.updateCategory).toHaveBeenCalledWith(2, { is_active: true }));
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "Keyboard (Nubwo) category status" }),
      ).toHaveAttribute("aria-checked", "true"),
    );
    expect(
      screen.getByRole("switch", { name: "Keyboard (Nubwo) category status" }),
    ).toHaveTextContent("Active");
  });

  it("requires a reason before disabling a category", async () => {
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "EGA categories" }),
    );
    fireEvent.click(
      screen.getByRole("switch", { name: "Mouse (EGA) category status" }),
    );

    const dialog = screen.getByRole("dialog", { name: "Disable category" });
    const confirm = within(dialog).getByRole("button", { name: "Disable category" });
    expect(confirm).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText("Reason for disabling"), {
      target: { value: "Seasonal range paused" },
    });
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(apiMocks.updateCategory).toHaveBeenCalledWith(1, {
        is_active: false,
        inactive_reason: "Seasonal range paused",
      }),
    );
  });

  it("shows a small status control for each brand and requires a disable reason", async () => {
    renderPage();

    fireEvent.click(
      await screen.findByRole("switch", { name: "Nubwo brand status" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Disable brand" });
    fireEvent.change(within(dialog).getByLabelText("Reason for disabling"), {
      target: { value: "Brand temporarily withheld" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Disable brand" }));

    await waitFor(() =>
      expect(apiMocks.updateBrandStatus).toHaveBeenCalledWith(11, {
        is_active: false,
        inactive_reason: "Brand temporarily withheld",
      }),
    );
  });
});
