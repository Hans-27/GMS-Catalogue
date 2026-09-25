export type DashboardView =
  | "overview"
  | "products"
  | "categories"
  | "activity"
  | "organization"
  | "users"
  | "pricing"
  | "catalogues"
  | "feedback";

export const APP_ROUTES = {
  overview: "/dashboard",
  products: "/dashboard?view=products",
  categories: "/dashboard?view=categories",
  catalogues: "/dashboard?view=catalogues",
  prices: "/dashboard?view=pricing",
  users: "/dashboard?view=users",
  organization: "/dashboard?view=organization",
  settings: "/admin/settings/general",
  dataSync: "/admin/settings/data-sync",
  systemHealth: "/admin/settings/system-health",
  promotions: "/promotions",
  catalogueStudio: "/catalogue-studio",
  catalogueStudioNew: "/catalogue-studio/new",
  productMedia: "/catalogue-studio/media",
  productCards: "/product-cards",
} as const;

export type SidebarRouteItem = {
  label: string;
  icon: string;
  href: string;
  permissions: readonly string[];
  dashboardView?: DashboardView;
};

export type SidebarRouteGroup = {
  label: string;
  items: readonly SidebarRouteItem[];
};

export const SIDEBAR_GROUPS: readonly SidebarRouteGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Dashboard", icon: "OV", href: APP_ROUTES.overview, permissions: ["dashboard.view"], dashboardView: "overview" },
      { label: "Catalogues", icon: "CM", href: APP_ROUTES.catalogues, permissions: ["catalogues.view"], dashboardView: "catalogues" },
      { label: "Catalogue Studio", icon: "DS", href: APP_ROUTES.catalogueStudio, permissions: ["catalogue_designs.view", "catalogue_designs.create"] },
    ],
  },
  {
    label: "Content",
    items: [
      { label: "Products", icon: "PR", href: APP_ROUTES.products, permissions: ["products.view"], dashboardView: "products" },
      { label: "Categories", icon: "CA", href: APP_ROUTES.categories, permissions: ["categories.view"], dashboardView: "categories" },
      { label: "Price Lists", icon: "PM", href: APP_ROUTES.prices, permissions: ["prices.view"], dashboardView: "pricing" },
      { label: "Product Media", icon: "MD", href: APP_ROUTES.productMedia, permissions: ["product_images.view", "product_videos.view", "catalogue_designs.view"] },
      { label: "Product Cards", icon: "PC", href: APP_ROUTES.productCards, permissions: ["product_cards.view"] },
    ],
  },
  {
    label: "Campaigns",
    items: [
      { label: "Promotions", icon: "PO", href: APP_ROUTES.promotions, permissions: ["promotions.view"] },
    ],
  },
  {
    label: "People & Access",
    items: [
      { label: "Organization", icon: "OR", href: APP_ROUTES.organization, permissions: ["departments.view", "teams.view", "positions.view"], dashboardView: "organization" },
      { label: "Users", icon: "US", href: APP_ROUTES.users, permissions: ["users.view"], dashboardView: "users" },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Data Synchronization", icon: "SY", href: APP_ROUTES.dataSync, permissions: ["data_sync.view", "data_sync.run", "data_sync.configure"] },
      { label: "System Health", icon: "SH", href: APP_ROUTES.systemHealth, permissions: ["system_metrics.view"] },
      { label: "Settings", icon: "SE", href: APP_ROUTES.settings, permissions: ["settings.view", "settings.manage"] },
    ],
  },
] as const;
