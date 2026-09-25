import { expect, test } from "@playwright/test";

const catalogue = {
  catalogue_id: "lan-dev-origin-fixture",
  version: 1,
  title: "LAN development catalogue",
  description: "Illustrative fixture only.",
  audience: "Normal",
  audience_type: "Normal",
  audience_code: "normal",
  language: "en",
  status: "published",
  is_draft: false,
  price_list: { id: 1, name: "Normal", show_price: true },
  show_prices: true,
  currency: "THB",
  product_count: 1,
  cover: null,
  categories: [
    {
      slug: "products",
      name: "Products",
      description: "",
      display_order: 1,
      product_count: 1,
      show_product_count: true,
      default_expanded: true,
    },
  ],
  products: [
    {
      id: "fixture-product",
      code: "FIXTURE-001",
      name: "LAN visible product",
      name_en: "LAN visible product",
      brand: "Illustrative Brand",
      category_name: "Products",
      categories: ["Products"],
      description: "Illustrative only.",
      long_description: "",
      main_image_url: null,
      image_urls: [],
      section_title: "Products",
      display_order: 1,
      featured: false,
      price: "100.00",
      currency: "THB",
    },
  ],
  allow_pdf_download: false,
  allow_print: false,
  password_protected: false,
};

test("public catalogue hydrates when Next development is opened through a LAN address", async ({
  page,
}) => {
  let catalogueRequests = 0;
  await page.route("**/api/v1/public/catalogues/lan-dev-origin-token", async (route) => {
    catalogueRequests += 1;
    await route.fulfill({ json: catalogue });
  });

  await page.goto("/c/lan-dev-origin-token");

  await expect(page.getByRole("heading", { name: catalogue.title })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Opening catalogue", { exact: true })).toBeHidden();
  expect(catalogueRequests).toBe(1);
});
