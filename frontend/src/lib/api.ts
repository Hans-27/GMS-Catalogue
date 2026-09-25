import { CATALOGUE_PDF_CONFIG } from "./catalogue-pdf";

const CONFIGURED_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

function resolveApiUrl() {
  if (typeof window === "undefined") {
    if (CONFIGURED_API_URL.startsWith("/")) {
      return (
        process.env.INTERNAL_API_URL ?? "http://127.0.0.1:8000/api"
      ).replace(/\/$/, "");
    }
    return CONFIGURED_API_URL;
  }

  if (CONFIGURED_API_URL.startsWith("/")) {
    return CONFIGURED_API_URL.replace(/\/$/, "");
  }

  const configured = new URL(CONFIGURED_API_URL);
  const browserHost = window.location.hostname;
  const loopbackHosts = new Set(["localhost", "127.0.0.1"]);

  if (
    loopbackHosts.has(configured.hostname) &&
    loopbackHosts.has(browserHost)
  ) {
    configured.hostname = browserHost;
  }
  return configured.toString().replace(/\/$/, "");
}

export const API_URL = resolveApiUrl();
export const API_ORIGIN = API_URL.replace(/\/api\/?$/, "");

export type AuthenticatedUser = {
  id: string;
  username: string;
  email: string;
  full_name: string;
  roles: string[];
  permissions: string[];
  effective_permissions?: string[];
  is_superadmin?: boolean;
  department?: string | null;
  position?: string | null;
  permissions_version?: number;
  data_scopes?: Record<string, unknown>;
};

export type CustomerPortalCatalogue = {
  id: string;
  title: string;
  brand: string | null;
  description: string;
  updated_at: string;
  product_count: number;
  cover_url: string | null;
  public_url: string;
  pdf_url: string | null;
  allow_pdf_download: boolean;
};

export type CustomerPortalPromotion = {
  id: string;
  name: string;
  description: string;
  cover_url: string | null;
  start_at: string;
  end_at: string;
  public_url: string;
  catalogue_ids: string[];
};

export type CustomerPortalBrandPrice = {
  brand: string;
  price_list_code: string;
  price_list_name: string;
  is_brand_override: boolean;
};

export type CustomerPortalResponse = {
  customer: {
    code: string;
    name: string;
    audience_code: string;
    audience_name: string;
  };
  catalogues: CustomerPortalCatalogue[];
  promotions: CustomerPortalPromotion[];
  brand_prices: CustomerPortalBrandPrice[];
};

export type ErpConnection = {
  configured: boolean;
  name: string;
  server: string;
  port: number;
  database_name: string;
  username: string;
  password_configured: boolean;
  connector: string;
  source_preset: string;
  is_enabled: boolean;
  connection_timeout_seconds: number;
  last_test_status: "not_tested" | "connected" | "failed";
  last_test_message: string;
  last_test_latency_ms: number | null;
  last_tested_at: string | null;
  last_server_name: string | null;
  discovered_table_count: number | null;
  last_sync_status: string;
  last_synced_at: string | null;
  last_sync_summary: Record<string, number> | null;
  updated_at: string | null;
};

export type ErpConnectionTest = {
  connected: boolean;
  message: string;
  latency_ms: number;
  server_name: string | null;
  database_name: string | null;
  product_count: number | null;
  table_count: number | null;
};

export type ErpPreview = {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  source: string;
  limit: number;
};

export type ErpSyncRun = {
  id: string;
  status: string;
  source_preset: string;
  requested_limit: number;
  rows_read: number;
  rows_created: number;
  rows_updated: number;
  rows_skipped: number;
  error_count: number;
  message: string;
  details: Record<string, number> | null;
  requested_by_id: string | null;
  started_at: string;
  completed_at: string | null;
};

export type ProductSyncRun = {
  id: string;
  status: string;
  sync_type: string;
  trigger: string;
  source_database: string;
  rows_read: number;
  rows_created: number;
  rows_updated: number;
  rows_skipped: number;
  products_matched: number;
  stock_values_updated: number;
  price_values_updated: number;
  products_missing: number;
  error_count: number;
  retry_count: number;
  duration_seconds: number | null;
  message: string;
  error_summary: string;
  details: Record<string, unknown> | null;
  requested_by_id: string | null;
  started_at: string;
  completed_at: string | null;
};

export type ProductSyncStatus = {
  status: string;
  enabled: boolean;
  interval_seconds: number;
  batch_size: number;
  next_scheduled_sync: string | null;
  last_successful_sync: string | null;
  last_failed_sync: string | null;
  current_run: ProductSyncRun | null;
  latest_run: ProductSyncRun | null;
  source_database_status: string;
  records_read: number;
  products_updated: number;
  stock_values_updated: number;
  price_values_updated: number;
  products_missing: number;
  duration_seconds: number | null;
  data_is_stale: boolean;
  stale_level: "fresh" | "warning" | "critical";
  stale_warning_seconds: number;
  stale_critical_seconds: number;
};

export type LoginPayload = {
  identifier: string;
  password: string;
  remember_me: boolean;
};

export type RegisterPayload = {
  full_name: string;
  username: string;
  email: string;
  password: string;
};

export type FeedbackType =
  | "bug"
  | "improvement"
  | "new_feature"
  | "ui_change"
  | "workflow_change"
  | "permission_change"
  | "report_request";

export type FeedbackPriority = "low" | "medium" | "high";

export type FeedbackStatus =
  | "new"
  | "under_review"
  | "accepted"
  | "rejected"
  | "completed";

export type FeedbackItem = {
  id: string;
  module_page: string;
  feedback_type: FeedbackType;
  title: string;
  description: string;
  suggested_change: string;
  priority: FeedbackPriority;
  status: FeedbackStatus;
  screenshot_url: string | null;
  screenshot_original_name: string | null;
  screenshot_content_type: string | null;
  screenshot_size: number | null;
  submitted_by_id: string | null;
  submitted_by_name: string;
  assigned_to_id: string | null;
  assigned_to_name: string | null;
  internal_note: string;
  created_at: string;
  updated_at: string;
};

export type FeedbackPage = {
  items: FeedbackItem[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
};

export type FeedbackSubmitPayload = {
  module_page: string;
  feedback_type: FeedbackType;
  title: string;
  description: string;
  suggested_change: string;
  priority: FeedbackPriority;
  screenshot?: File | null;
};

export type FeedbackUpdatePayload = {
  priority: FeedbackPriority;
  status: FeedbackStatus;
  internal_note: string;
  assigned_to_id?: string | null;
  clear_assignment?: boolean;
};

export type WorkflowStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "published";

export type Category = {
  id: number;
  name: string;
  slug: string;
  description: string;
  is_active: boolean;
  inactive_reason?: string;
  product_count: number;
  brands: Array<{
    id?: number | null;
    name: string;
    product_count: number;
    is_active?: boolean;
    inactive_reason?: string;
  }>;
};

export type ProductImage = {
  id: string;
  file_name: string;
  public_url: string;
  content_type: string;
  alt_text: string;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
};

export type ProductVideo = {
  id: string;
  product_id: string;
  source_type: "upload" | "external";
  title_en: string;
  title_th: string;
  description: string;
  alt_text: string;
  provider: "internal" | "youtube" | "vimeo" | "direct_url";
  external_url: string | null;
  external_video_id: string | null;
  playback_url: string;
  thumbnail_url: string | null;
  caption_url: string | null;
  original_filename: string | null;
  mime_type: string | null;
  file_size: number | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  display_order: number;
  is_featured: boolean;
  is_active: boolean;
  show_in_catalogue: boolean;
  show_in_public_catalogue: boolean;
  show_controls: boolean;
  allow_download: boolean;
  autoplay: boolean;
  muted: boolean;
  loop: boolean;
  processing_status: string;
  uploaded_by_id: string | null;
  uploaded_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductListItem = {
  id: string;
  sku: string;
  erp_name: string;
  display_name: string;
  brand: string | null;
  price: string | null;
  stock_quantity: number;
  product_status: "active" | "inactive";
  inactive_reason: string | null;
  inactive_note?: string;
  status_updated_at: string;
  stock_last_synced_at: string | null;
  price_last_synced_at: string | null;
  source_sync_status: string;
  source_record_exists: boolean;
  is_discontinued: boolean;
  lifecycle_status_source?: string;
  legacy_catalogue_present?: boolean;
  workflow_status: WorkflowStatus;
  visibility: "hidden" | "public";
  is_featured: boolean;
  short_description: string;
  primary_image_url: string | null;
  image_urls: string[];
  price_level_code: string | null;
  price_list_name: string | null;
  price_currency: string;
  category_names: string[];
  updated_at: string;
  has_video: boolean;
};

export type ProductDetail = ProductListItem & {
  barcode: string | null;
  unit: string;
  erp_category: string | null;
  erp_name_th?: string | null;
  erp_pos_name?: string | null;
  erp_description_en?: string | null;
  erp_description_th?: string | null;
  erp_how_to_use?: string | null;
  erp_remark?: string | null;
  size_width?: string | null;
  size_length?: string | null;
  size_height?: string | null;
  gross_weight?: string | null;
  net_weight?: string | null;
  pack_size?: number | null;
  warranty_description?: string | null;
  warranty_days?: number | null;
  erp_details?: Record<string, string>;
  erp_updated_at: string;
  legacy_catalogue_synced_at?: string | null;
  long_description: string;
  seo_title: string;
  seo_description: string;
  version: number;
  submitted_at: string | null;
  approved_at: string | null;
  published_at: string | null;
  categories: Category[];
  images: ProductImage[];
  videos: ProductVideo[];
  inactive_note: string;
  inactivated_at: string | null;
  reactivated_at: string | null;
  status_history: Array<{
    id: string;
    old_status: "active" | "inactive";
    new_status: "active" | "inactive";
    reason: string;
    note: string;
    changed_by_user_id: string | null;
    changed_at: string;
  }>;
  catalogue_assignments: Array<{ id: string; title: string; status: string }>;
};

export type ProductPage = {
  items: ProductListItem[];
  brands: string[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
};

export type ErpProductImageCandidate = {
  slot: number;
  description: string;
  file_size: number;
  mime_type: string | null;
  supported: boolean;
  preview_url: string;
};

export type CatalogueStats = {
  total_products: number;
  active_products: number;
  inactive_products: number | null;
  products_missing_from_source: number | null;
  products_with_stale_stock: number | null;
  products_with_stale_prices: number | null;
  current_sync_status: string | null;
  last_successful_sync: string | null;
  last_failed_sync: string | null;
  draft: number;
  in_review: number;
  approved: number;
  published: number;
  hidden: number;
  missing_images: number;
  missing_descriptions: number;
  missing_categories: number;
  ready_products: number;
  completion_rate: number;
};

export type DashboardSummary = {
  active_products: number | null;
  inactive_products: number | null;
  published_catalogues: number | null;
  draft_catalogues: number | null;
  active_promotions: number | null;
  pending_my_approval: number | null;
};

export type DashboardAttentionItem = {
  key: string;
  title: string;
  count: number;
  severity: "information" | "warning" | "critical";
  target: "products" | "catalogues" | "promotions";
  filter_name: string;
  filter_value: string;
};

export type DashboardWorkItem = {
  id: string;
  item_type:
    | "catalogue"
    | "studio_design"
    | "promotion"
    | "product_approval"
    | "price_approval";
  name: string;
  status: string;
  priority: "normal" | "high" | "critical";
  updated_at: string;
  due_at: string | null;
  action: string;
  href: string;
};

export type DashboardCatalogueItem = {
  id: string;
  title: string;
  brand: string | null;
  brand_mode: "single" | "multi";
  catalogue_type: string;
  status: string;
  product_count: number;
  price_mode: "priced" | "no_price" | "restricted";
  updated_by: string | null;
  updated_at: string;
  primary_action: string;
  href: string;
  studio_href: string | null;
  cover_thumbnail_url: string | null;
};

export type DashboardProductItem = {
  id: string;
  code: string;
  name: string;
  brand: string | null;
  category: string | null;
  status: "active" | "inactive";
  workflow_status: string;
  stock: number;
  price: string | null;
  currency: string | null;
  image_url: string | null;
  updated_by: string | null;
  updated_at: string;
};

export type DashboardPromotionItem = {
  id: string;
  name: string;
  occasion: string | null;
  brands: string[];
  start_at: string;
  end_at: string;
  timezone: string;
  status: string;
  audiences: string[];
  product_count: number;
  href: string;
};

export type DashboardSyncStatus = {
  safe_status:
    | "up_to_date"
    | "updating"
    | "data_may_be_outdated"
    | "disabled"
    | "unknown";
  display_label: string;
  last_successful_at: string | null;
  technical_status: string | null;
  last_failed_at: string | null;
  can_open_details: boolean;
};

export type DashboardSystemHealth = {
  status: string;
  measured_at: string;
  cpu_percent: number | null;
  memory_percent: number | null;
  disk_percent: number | null;
  database_status: string | null;
  database_response_ms: number | null;
  api_response_ms: number | null;
  application_uptime_seconds: number | null;
  last_database_backup: string | null;
  last_application_backup: string | null;
  current_background_jobs: number | null;
  recent_failed_logins: number | null;
  recent_server_errors: number | null;
  warnings: string[];
};

export type DashboardOverview = {
  summary: DashboardSummary;
  product_metrics: CatalogueStats | null;
  attention: DashboardAttentionItem[];
  my_work: DashboardWorkItem[];
  recent_catalogues: DashboardCatalogueItem[];
  recent_products: DashboardProductItem[];
  upcoming_promotions: DashboardPromotionItem[];
  sync_status: DashboardSyncStatus;
  system_health: DashboardSystemHealth | null;
};

export type GlobalSearchItem = {
  kind: "product" | "catalogue" | "promotion" | "brand" | "category";
  id: string;
  title: string;
  subtitle: string;
  href: string;
  search_value: string;
};

export type GlobalSearchResponse = {
  query: string;
  groups: Record<string, GlobalSearchItem[]>;
  total: number;
};

export type SystemHealth = {
  status: string;
  service: string;
  database: string;
};

export type CatalogueContentPayload = {
  display_name: string;
  short_description: string;
  long_description: string;
  seo_title: string;
  seo_description: string;
  visibility: "hidden" | "public";
  is_featured: boolean;
  category_ids: number[];
};

export type ProductMasterPayload = {
  erp_name: string;
  brand: string | null;
  barcode: string | null;
  erp_category: string | null;
  price: string | null;
  stock_quantity: number;
};

export type ProductCreatePayload = {
  sku: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  unit: string;
  erp_category: string | null;
  price: string | null;
  stock_quantity: number;
  short_description: string;
  long_description: string;
  category_ids: number[];
};

export type ActivityItem = {
  id: string;
  action: string;
  status: string;
  user_name: string | null;
  identifier: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

export type ManagedUser = {
  id: string;
  username: string;
  email: string;
  full_name: string;
  is_active: boolean;
  roles: string[];
  department_id: number | null;
  department_name: string | null;
  position_id: number | null;
  position_name: string | null;
  primary_team_id: number | null;
  primary_team_name: string | null;
  employee_code: string | null;
  team_ids: number[];
  team_names: string[];
  brand_names: string[];
  direct_roles: string[];
  inherited_roles: Array<{ name: string; source: string; source_name: string }>;
  failed_login_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
  created_at: string;
};

export type OrganizationPermission = {
  id: number;
  code: string;
  module: string;
  description: string;
  role_names: string[];
};

export type UserPermissionOverride = {
  permission_id: number;
  key: string;
  effect: "allow" | "deny";
  access_scope: string;
  reason: string;
  expires_at: string | null;
};

export type ManagedUserAccess = {
  user_id: string;
  username: string;
  full_name: string;
  is_super_admin: boolean;
  permissions_version: number;
  direct_role_ids: number[];
  inherited_roles: Array<Record<string, unknown>>;
  overrides: UserPermissionOverride[];
  data_scope: {
    all_access: boolean;
    own_department: boolean;
    own_records: boolean;
    published_only: boolean;
  };
  brand_ids: number[];
  category_ids: number[];
  product_ids: string[];
  catalogue_ids: string[];
  price_list_ids: number[];
  effective_permissions: Array<{
    key: string;
    scopes: string[];
    sources: string[];
  }>;
  visible_modules: string[];
  restricted_fields: string[];
};

export type OrganizationSummary = {
  departments: number;
  positions: number;
  teams: number;
  brands: number;
  permissions: number;
  assigned_users: number;
};

export type Department = {
  id: number;
  name: string;
  code: string;
  description: string;
  parent_id: number | null;
  is_active: boolean;
  position_count: number;
  team_count: number;
  user_count: number;
};

export type Position = {
  id: number;
  name: string;
  code: string;
  description: string;
  department_id: number;
  department_name: string;
  is_active: boolean;
  user_count: number;
  permission_ids: number[];
};

export type Brand = {
  id: number;
  name: string;
  code: string;
  description: string;
  is_active: boolean;
  inactive_reason: string;
  team_count: number;
};

export type CatalogueBrandOption = Pick<Brand, "id" | "name" | "code"> & {
  product_count: number;
};

export type Team = {
  id: number;
  name: string;
  code: string;
  description: string;
  department_id: number;
  department_name: string;
  brand_ids: number[];
  brand_names: string[];
  is_active: boolean;
  user_count: number;
  permission_ids: number[];
};

export type AdminPosition = {
  id: number;
  code: string;
  name_en: string;
  name_th: string;
  description: string;
  department_id: number;
  department_name: string;
  default_team_id: number | null;
  default_team_name: string | null;
  reports_to_position_id: number | null;
  reports_to_position_name: string | null;
  management_level: string;
  display_order: number;
  is_active: boolean;
  user_count: number;
  child_position_count: number;
  default_role_ids: number[];
  created_at: string;
  updated_at: string;
};

export type AdminPositionPayload = {
  code: string;
  name_en: string;
  name_th: string;
  description: string;
  department_id: number;
  default_team_id: number | null;
  reports_to_position_id: number | null;
  management_level: string;
  default_role_ids: number[];
  is_active: boolean;
  display_order: number;
};

export type AdminPositionPage = { items: AdminPosition[]; total: number; page: number; page_size: number; pages: number };

export type AdminTeam = {
  id: number;
  code: string;
  name_en: string;
  name_th: string;
  description: string;
  department_id: number;
  department_name: string;
  team_leader_user_id: string | null;
  team_leader_name: string | null;
  parent_team_id: number | null;
  parent_team_name: string | null;
  display_order: number;
  is_active: boolean;
  member_count: number;
  child_team_count: number;
  default_position_ids: number[];
  default_role_ids: number[];
  brand_ids: number[];
  created_at: string;
  updated_at: string;
};

export type AdminTeamPayload = {
  code: string;
  name_en: string;
  name_th: string;
  description: string;
  department_id: number;
  team_leader_user_id: string | null;
  parent_team_id: number | null;
  default_position_ids: number[];
  default_role_ids: number[];
  brand_ids: number[];
  is_active: boolean;
  display_order: number;
  allow_cross_department_leader: boolean;
};

export type AdminTeamPage = { items: AdminTeam[]; total: number; page: number; page_size: number; pages: number };
export type AdminUserSummary = { id: string; username: string; full_name: string; email: string; is_active: boolean; department_id: number | null };

export type CatalogueAccessRule = {
  department_id: number;
  department_name: string;
  brand_id: number;
  brand_name: string;
  can_view: boolean;
  can_manage: boolean;
};

export type PriceList = {
  id: number;
  code: string;
  name: string;
  description: string;
  currency: string;
  is_no_price: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ErpCustomerPriceLevel = {
  id: number;
  erp_price_type_id: number;
  source_code: string;
  source_name: string;
  price_list_id: number;
  price_list_code: string;
  price_list_name: string;
  product_count: number;
  sort_order: number;
  is_active: boolean;
  last_synced_at: string;
};

export type UserCataloguePriceMapping = {
  audience_type_id: number;
  audience_code: string;
  audience_name: string;
  price_list_id: number;
  price_list_code: string;
  price_list_name: string;
  erp_source_code: string | null;
  erp_source_name: string | null;
  show_prices: boolean;
  is_custom: boolean;
  brand?: string | null;
  is_brand_override?: boolean;
};

export type UserBrandCataloguePriceMappingSummary = {
  brand: string;
  product_count: number;
  override_count: number;
  audience_count: number;
  status: "custom" | "partial" | "default";
};

export type ErpProductCustomerPrice = {
  id: string;
  product_id: string;
  product_sku: string;
  product_name: string;
  product_brand: string | null;
  category_names: string[];
  price_level_id: number;
  source_code: string;
  source_name: string;
  price_list_code: string;
  price_list_name: string;
  amount: string;
  currency: string;
  source_updated_at: string | null;
  last_synced_at: string;
};

export type ErpCustomerPriceFilters = {
  brands: Array<{ name: string; product_count: number }>;
  categories: Array<{ id: number; name: string; product_count: number }>;
};

export type ErpProductPriceMatrixValue = {
  price_level_id: number;
  source_code: string;
  source_name: string;
  price_list_code: string;
  price_list_name: string;
  amount: string;
  currency: string;
  last_synced_at: string;
};

export type ErpProductPriceMatrixItem = {
  product_id: string;
  product_sku: string;
  product_name: string;
  product_brand: string | null;
  category_names: string[];
  prices: ErpProductPriceMatrixValue[];
};

export type ErpProductPriceMatrixPage = {
  items: ErpProductPriceMatrixItem[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
};

export type ErpProductCustomerPricePage = {
  items: ErpProductCustomerPrice[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
};

export type PriceListPayload = {
  code: string;
  name: string;
  description: string;
  currency: string;
  is_no_price: boolean;
  is_active: boolean;
};

export type PriceProposalPayload = {
  product_id: string;
  price_list_id: number;
  proposed_amount: string;
  effective_from: string;
  reason: string;
};

export type ProductPrice = {
  id: string;
  product_id: string;
  product_sku: string;
  product_name: string;
  price_list_id: number;
  price_list_name: string;
  currency: string;
  amount: string;
  effective_from: string;
  expires_at: string | null;
  status: string;
  reason: string;
  created_by_id: string | null;
  approved_by_id: string | null;
  created_at: string;
  approved_at: string | null;
};

export type PriceRequestStatus = "pending" | "approved" | "rejected";

export type PriceChangeRequest = {
  id: string;
  product_id: string;
  product_sku: string;
  product_name: string;
  price_list_id: number;
  price_list_name: string;
  current_amount: string | null;
  proposed_amount: string;
  currency: string;
  effective_from: string;
  reason: string;
  status: PriceRequestStatus;
  requested_by_id: string | null;
  reviewed_by_id: string | null;
  review_reason: string;
  resulting_price_id: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export type CatalogueStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "published"
  | "wip"
  | "archived";

export type CatalogueLanguage = "en" | "th" | "en-th";

export type CataloguePayload = {
  title: string;
  slug: string | null;
  description: string;
  brand: string | null;
  audience: string;
  price_list_id: number | null;
  show_prices: boolean;
  currency: string;
  language: CatalogueLanguage;
  valid_from: string | null;
  valid_until: string | null;
  is_public: boolean;
};

export type CatalogueGenerationResult = {
  created: number;
  updated: number;
  brand_count: number;
  product_count: number;
  products_with_images: number;
  products_missing_images: number;
  category_setting_count: number;
  customer_level_count: number;
  legacy_category_rows: number;
  legacy_matched_brands: number;
  cover_count: number;
  covers_with_erp_image: number;
  covers_with_fallback_design: number;
  warnings: string[];
};

export type CatalogueProductInput = {
  product_id: string;
  section_title: string;
  override_description: string;
  hide_price: boolean;
  include_video: boolean;
  selected_video_id: string | null;
  video_title_override: string;
  video_description_override: string;
  video_display_mode: "card_icon" | "product_detail" | "media_section";
  video_thumbnail_mode: "video_thumbnail" | "product_image" | "placeholder";
};

export type CatalogueProduct = CatalogueProductInput & {
  sort_order: number;
  sku: string;
  name: string;
  brand: string | null;
  primary_image_url: string | null;
};

export type ManagedCatalogue = {
  id: string;
  title: string;
  slug: string;
  description: string;
  brand: string | null;
  audience: string;
  price_list_id: number | null;
  price_list_name: string | null;
  show_prices: boolean;
  currency: string;
  language: CatalogueLanguage;
  status: CatalogueStatus;
  version: number;
  revision: number;
  valid_from: string | null;
  valid_until: string | null;
  is_public: boolean;
  owner_id: string | null;
  product_count: number;
  products: CatalogueProduct[];
  created_at: string;
  updated_at: string;
  published_at: string | null;
  studio_design_id: string | null;
  catalogue_type: "standard" | "booklet" | "promotion";
  brand_logo_url: string | null;
  studio_editor_href: string | null;
  studio_preview_href: string | null;
};

export type ProductCardAppearance = {
  accent_color?: string;
  strong_color?: string;
  surface_color?: string;
  border_color?: string;
  text_color?: string;
};

export type ProductCardPresentation = {
  display_name?: string;
  display_name_th?: string;
  description?: string;
  description_th?: string;
  badge?: string;
  image_urls?: string[];
  appearance?: ProductCardAppearance;
  visible_fields?: Record<string, boolean>;
  layout?: string;
};

export type GlobalProductCardSummary = {
  product_id: string;
  code: string;
  name: string;
  brand: string | null;
  category: string | null;
  primary_image_url: string | null;
  template_id: string | null;
  has_draft: boolean;
  is_published: boolean;
  draft_revision: number;
  active_version: number;
  affected_catalogue_count: number;
  updated_at: string | null;
};

export type GlobalProductCardDetail = GlobalProductCardSummary & {
  draft: ProductCardPresentation;
  published: ProductCardPresentation | null;
  images: Array<{ id: string; url: string; alt_text: string; is_primary: boolean }>;
  affected_catalogues: Array<{ id: string; title: string; status: string }>;
  erp_fields: {
    code: string;
    barcode: string | null;
    stock_quantity: number | null;
    price: string | null;
    name: string;
    description: string;
  };
  published_at: string | null;
};

export type GlobalProductCardPage = {
  items: GlobalProductCardSummary[];
  total: number;
  page: number;
  page_size: number;
};

export type GlobalProductCardVersion = {
  id: string;
  version_number: number;
  template_id: string | null;
  presentation_json: ProductCardPresentation;
  change_note: string;
  published_by_id: string | null;
  published_at: string;
};

export type CataloguePreviewProduct = {
  id?: string;
  code: string;
  name: string;
  name_th?: string;
  name_en?: string;
  brand: string | null;
  category_name: string | null;
  description: string;
  long_description: string;
  description_en?: string;
  description_th?: string;
  long_description_en?: string;
  long_description_th?: string;
  erp_details?: Record<string, string>;
  categories: string[];
  main_image_url: string | null;
  image_urls?: string[];
  barcode?: string | null;
  stock_quantity?: number | null;
  card_presentation?: ProductCardPresentation | null;
  section_title: string;
  display_order: number;
  featured: boolean;
  product_status: "active" | "inactive";
  price?: string;
  wholesale_price?: string;
  online_price?: string;
  retail_price?: string;
  currency?: string;
  promotion_code?: string;
  promotion_name?: string;
  promotion_badge?: string;
  original_price?: string;
  promotion_price?: string;
  discount_percent?: string;
  promotion_end_at?: string;
  video?: CataloguePreviewVideo | null;
};

export type CataloguePreviewVideo = {
  id: string;
  source_type: "upload" | "external";
  provider: "internal" | "youtube" | "vimeo" | "direct_url";
  title: string;
  description: string;
  alt_text: string;
  thumbnail_url: string | null;
  playback_url: string | null;
  caption_url: string | null;
  mime_type: string | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  display_mode: "card_icon" | "product_detail" | "media_section";
  show_controls: boolean;
  allow_download: boolean;
  autoplay: boolean;
  muted: boolean;
  loop: boolean;
};

export type CatalogueCoverAssetType = "background" | "brand_logo" | "secondary_logo" | "decorative_image" | "full_cover";

export type CatalogueCoverAsset = {
  id: string;
  catalogue_id: string;
  asset_type: CatalogueCoverAssetType;
  original_filename: string;
  mime_type: string;
  file_size: number;
  width: number;
  height: number;
  checksum: string;
  file_url: string;
  preview_url: string;
  alt_text: string;
  position_x_percent: number;
  position_y_percent: number;
  width_percent: number;
  height_percent: number;
  opacity: number;
  rotation: number;
  z_index: number;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CatalogueCover = {
  id: string;
  catalogue_id: string;
  cover_mode: "full_image" | "custom";
  catalogue_name: string;
  catalogue_year: string;
  subtitle: string;
  company_name: string;
  collection_name: string;
  background_color: string;
  overlay_color: string;
  overlay_opacity: number;
  background_fit: "contain" | "cover" | "full-page";
  show_catalogue_name: boolean;
  show_catalogue_year: boolean;
  show_subtitle: boolean;
  show_brand_logo: boolean;
  show_company_logo: boolean;
  show_start_button: boolean;
  title_color: string;
  title_font_size: number;
  title_alignment: "left" | "center" | "right";
  title_position_x_percent: number;
  title_position_y_percent: number;
  title_width_percent: number;
  title_z_index: number;
  subtitle_color: string;
  subtitle_font_size: number;
  subtitle_position_x_percent: number;
  subtitle_position_y_percent: number;
  cover_alt_text: string;
  default_company_logo_version?: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  assets: CatalogueCoverAsset[];
  asset_history: CatalogueCoverAsset[];
};

export type CatalogueCategorySetting = {
  id: string | null;
  category_id: number;
  master_name: string;
  slug: string;
  master_description: string;
  display_name: string;
  description: string;
  display_order: number;
  is_visible: boolean;
  show_product_count: boolean;
  default_expanded: boolean;
  banner_url: string | null;
  product_count: number;
};

export type CataloguePreviewCategory = {
  id?: number;
  slug: string;
  name: string;
  description: string;
  banner_url?: string;
  display_order: number;
  product_count: number;
  show_product_count: boolean;
  default_expanded: boolean;
};

export type CataloguePreview = {
  catalogue_id: string;
  studio_design_id?: string | null;
  studio_preview_href?: string | null;
  version?: number;
  title: string;
  description: string;
  audience: string;
  language: string;
  status: CatalogueStatus;
  is_draft: boolean;
  product_card_style?: "standard" | "erp_detail";
  product_card_theme?: {
    key: string;
    variant: "rounded" | "editorial" | "framed" | "contrast" | "minimal";
    accent_color: string;
    strong_color: string;
    surface_color: string;
    border_color: string;
    text_color: string;
  } | null;
  price_list?: {
    id?: number;
    name: string;
    show_price: boolean;
  };
  show_prices: boolean;
  currency?: string;
  product_count: number;
  products: CataloguePreviewProduct[];
  online_cover?: { asset_id: string; file_name: string; width: number; height: number; url: string } | null;
  categories?: CataloguePreviewCategory[];
  cover?: Omit<CatalogueCover, "id" | "catalogue_id" | "created_by" | "updated_by" | "created_at" | "updated_at" | "asset_history">;
  valid_from?: string;
  valid_until?: string;
  generated_at: string;
  promotions?: Array<{id:string;code:string;name_en:string;name_th:string;short_title:string;occasion:string|null;end_at:string;banner_url:string|null}>;
};

export type BackupJob = {
  id: string;
  backup_type: "database" | "application";
  status: "pending" | "running" | "completed" | "failed" | "deleted";
  description: string;
  requested_by: string | null;
  requested_by_name: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  file_name: string | null;
  file_size: number | null;
  checksum: string | null;
  application_version: string | null;
  error_message: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
  deleted_at: string | null;
};

export type SystemMetrics = {
  status: "healthy" | "warning" | "critical" | "unknown";
  timestamp: string;
  thresholds: Record<string, number>;
  system: Record<string, number | string | boolean | number[] | null>;
  application: Record<string, number | string | boolean | null>;
  database: Record<string, number | string | null>;
  backups: Record<string, string | boolean | null>;
  warnings: string[];
};

export type CatalogueVersion = {
  id: string;
  catalogue_id: string;
  version_number: number;
  snapshot: Record<string, unknown>;
  published_by_id: string | null;
  published_at: string;
};

export type CatalogueAudienceType = {
  id: number;
  code: string;
  display_name: string;
  price_list_id: number | null;
  price_list_name: string | null;
  show_prices: boolean;
  display_order: number;
  button_style_key: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CatalogueShareLink = {
  id: string | null;
  catalogue_id: string;
  audience_type_id: number;
  audience_code: string;
  audience_name: string;
  customer_code?: string | null;
  customer_name?: string | null;
  price_list_id: number | null;
  price_list_name: string | null;
  show_prices: boolean;
  button_style_key: string;
  status: "active" | "revoked" | "expired" | "not_generated";
  version_mode: "latest_published" | "fixed_published";
  fixed_version_number: number | null;
  expires_at: string | null;
  has_password: boolean;
  allow_pdf_download: boolean;
  allow_print: boolean;
  created_at: string | null;
  updated_at: string | null;
  last_accessed_at: string | null;
  view_count: number;
  public_url: string | null;
};

export type PublicCatalogue = CataloguePreview & {
  audience_type: string;
  audience_code: string;
  customer_name?: string | null;
  allow_pdf_download: boolean;
  allow_print: boolean;
  password_protected: boolean;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function parseError(response: Response): Promise<ApiError> {
  let message = "Something went wrong. Please try again.";

  try {
    const body = (await response.json()) as {
      detail?: string | Array<{ msg?: string }>;
    };
    if (typeof body.detail === "string") {
      message = body.detail;
    } else if (Array.isArray(body.detail) && body.detail[0]?.msg) {
      message = body.detail[0].msg.replace(/^Value error,\s*/i, "");
    }
  } catch {
    // Use the safe fallback when the server did not return JSON.
  }

  return new ApiError(message, response.status);
}

export async function catalogueRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export async function login(
  payload: LoginPayload,
): Promise<AuthenticatedUser> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  const body = (await response.json()) as {
    user: AuthenticatedUser;
  };
  return body.user;
}

export async function registerAccount(
  payload: RegisterPayload,
): Promise<AuthenticatedUser> {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  const body = (await response.json()) as {
    user: AuthenticatedUser;
  };
  return body.user;
}

export async function getCurrentUser(): Promise<AuthenticatedUser> {
  const response = await fetch(`${API_URL}/auth/me`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return response.json() as Promise<AuthenticatedUser>;
}

export async function getCustomerPortal(
  accessCode: string,
): Promise<CustomerPortalResponse> {
  return catalogueRequest<CustomerPortalResponse>("/v1/customer-portal", {
    headers: { "X-Customer-Access": accessCode },
  });
}

export async function logout(): Promise<void> {
  const response = await fetch(`${API_URL}/auth/logout`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw await parseError(response);
  }
}

export type PromotionStatus = "draft" | "pending_review" | "rejected" | "approved" | "scheduled" | "active" | "paused" | "expired" | "cancelled";
export type PromotionType = "percentage" | "fixed_amount" | "special_price";
export type PromotionOccasion = { id: number; code: string; name_en: string; name_th: string; description: string; icon_key: string; default_banner_style: string; recurring_annually: boolean; default_start_month: number | null; default_start_day: number | null; default_end_month: number | null; default_end_day: number | null; display_order: number; is_active: boolean; created_at: string; updated_at: string };
export type PromotionBrand = { brand_id: number; brand_name: string; brand_code: string; include_all_active_products: boolean; active_product_count: number; selected_product_count: number };
export type PromotionProduct = { id: string; product_id: string; product_code: string; product_name: string; image_url: string | null; brand: string | null; category: string | null; stock: number; product_status: string; audience_type_id: number | null; price_list_id: number | null; price_list_name: string | null; promotion_type: string; base_price: string | null; approved_base_price: string | null; discount_percent: string | null; discount_amount: string | null; promotion_price: string | null; currency: string; include_in_promotion: boolean; warning: string | null };
export type PromotionAudience = { audience_type_id: number; audience_code: string; audience_name: string; price_list_id: number | null; price_list_name: string | null; show_prices: boolean };
export type PromotionMedia = { id: string; media_type: string; url: string | null; external_url: string | null; original_filename: string; mime_type: string | null; file_size: number | null; alt_text: string; display_order: number };
export type Promotion = { id: string; code: string; name_en: string; name_th: string; short_title: string; description_en: string; description_th: string; occasion_id: number | null; occasion_name: string | null; promotion_type: string; status: PromotionStatus; priority: number; allow_stacking: boolean; base_price_change_behavior: string; owner_user_id: string | null; department_id: number | null; team_id: number | null; start_at: string; end_at: string; timezone: string; publish_at: string | null; automatic_activation: boolean; automatic_expiration: boolean; repeat_annually: boolean; expiration_warning_days: number; show_stock: boolean; hide_out_of_stock: boolean; minimum_stock: number; stop_product_at_zero_stock: boolean; terms_en: string; terms_th: string; internal_note: string | null; is_active: boolean; published_at: string | null; approved_at: string | null; rejection_reason: string | null; created_by_id: string | null; updated_by_id: string | null; created_at: string; updated_at: string; brands: PromotionBrand[]; products: PromotionProduct[]; audiences: PromotionAudience[]; catalogue_ids: string[]; media: PromotionMedia[]; cover_url: string | null; conflicts: Array<Record<string, unknown>> };
export type PromotionPage = { items: Promotion[]; total: number; page: number; page_size: number; pages: number; summary: Record<string, number> };
export type PromotionMetadata = { brands: Array<{id:number; code:string; name:string}>; products: Array<{id:string; code:string; name:string; brand:string|null; category:string|null; barcode:string|null; price:string|null; stock:number; status:string; image_url:string|null}>; product_total:number; product_page:number; product_pages:number; audiences:Array<{id:number;code:string;name:string;price_list_id:number|null;show_prices:boolean}>; price_lists:Array<{id:number;code:string;name:string;currency:string;is_no_price:boolean}>; catalogues:Array<{id:string;title:string;status:string}>; occasions:PromotionOccasion[]; departments:Array<{id:number;name:string}>; teams:Array<{id:number;name:string;department_id:number}>; users:Array<{id:string;name:string}> };
export type PromotionPayload = { code?: string | null; name_en:string; name_th:string; short_title:string; description_en:string; description_th:string; occasion_id:number|null; promotion_type:PromotionType; discount_percent?:number|null; discount_amount?:number|null; promotion_price?:number|null; priority:number; base_price_change_behavior:"keep_approved"|"recalculate"|"require_reapproval"|"pause_products"; owner_user_id?:string|null; department_id:number|null; team_id:number|null; start_at:string; end_at:string; timezone:string; automatic_activation:boolean; automatic_expiration:boolean; repeat_annually:boolean; expiration_warning_days:number; show_stock:boolean; hide_out_of_stock:boolean; minimum_stock:number; stop_product_at_zero_stock:boolean; terms_en:string; terms_th:string; internal_note:string; is_active:boolean; brand_rules:Array<{brand_id:number;include_all_active_products:boolean}>; products:Array<{product_id:string;promotion_type?:PromotionType;discount_percent?:number|null;discount_amount?:number|null;promotion_price?:number|null;include_in_promotion?:boolean;display_order?:number}>; audiences:Array<{audience_type_id:number;price_list_id:number|null;show_prices:boolean}>; catalogue_ids:string[] };
export type PromotionShareLink = { id:string; promotion_id:string; audience_type_id:number; audience_name:string; status:string; url:string|null; expires_at:string|null; allow_pdf:boolean; allow_print:boolean; view_count:number; created_at:string };
export type PublicPromotion = { id:string; code:string; name_en:string; name_th:string; short_title:string; description_en:string; description_th:string; occasion_name:string|null; start_at:string; end_at:string; timezone:string; terms_en:string; terms_th:string; banner_url:string|null; video_url:string|null; audience:string; audience_code:string; show_prices:boolean; allow_pdf:boolean; allow_print:boolean; products:Array<{id:string;code:string;name:string;name_th:string|null;brand:string|null;category:string|null;image_url:string|null;stock:number|null;out_of_stock:boolean;base_price:string|null;promotion_price:string|null;discount_percent:string|null;currency:string|null;price_message:string|null}> };

export async function getPromotions(params: Record<string,string|number|boolean|undefined> = {}): Promise<PromotionPage> { const query = new URLSearchParams(); Object.entries(params).forEach(([key,value]) => { if(value !== undefined && value !== "") query.set(key,String(value)); }); return catalogueRequest(`/v1/promotions${query.size ? `?${query}` : ""}`); }
export async function getPromotion(id:string):Promise<Promotion>{ return catalogueRequest(`/v1/promotions/${id}`); }
export async function getPromotionMetadata(params:Record<string,string|number|undefined>={}):Promise<PromotionMetadata>{ const query=new URLSearchParams(); Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!=="")query.set(k,String(v));}); return catalogueRequest(`/v1/promotions/metadata${query.size?`?${query}`:""}`); }
export async function createPromotion(payload:PromotionPayload):Promise<Promotion>{ return catalogueRequest("/v1/promotions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}); }
export async function updatePromotion(id:string,payload:Partial<PromotionPayload>):Promise<Promotion>{ return catalogueRequest(`/v1/promotions/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}); }
export async function attachPromotionToCatalogue(id:string,catalogueId:string):Promise<Promotion>{ return catalogueRequest(`/v1/promotions/${id}/catalogues/${catalogueId}`,{method:"POST"}); }
export async function detachPromotionFromCatalogue(id:string,catalogueId:string):Promise<Promotion>{ return catalogueRequest(`/v1/promotions/${id}/catalogues/${catalogueId}`,{method:"DELETE"}); }
export async function deletePromotion(id:string):Promise<void>{ return catalogueRequest(`/v1/promotions/${id}`,{method:"DELETE"}); }
export async function duplicatePromotion(id:string):Promise<Promotion>{ return catalogueRequest(`/v1/promotions/${id}/duplicate`,{method:"POST"}); }
export async function promotionWorkflow(id:string,action:"publish"|"pause"|"resume"|"cancel",reason=""):Promise<Promotion>{ return catalogueRequest(`/v1/promotions/${id}/${action}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reason})}); }
export async function uploadPromotionMedia(id:string,mediaType:string,file:File|null,altText="",externalUrl=""):Promise<Promotion>{ const body=new FormData();body.set("media_type",mediaType);body.set("alt_text",altText);if(file)body.set("file",file);if(externalUrl)body.set("external_url",externalUrl);return catalogueRequest(`/v1/promotions/${id}/media`,{method:"POST",body}); }
export async function deletePromotionMedia(id:string,mediaId:string):Promise<void>{return catalogueRequest(`/v1/promotions/${id}/media/${mediaId}`,{method:"DELETE"});}
export async function getPromotionLinks(id:string):Promise<PromotionShareLink[]>{return catalogueRequest(`/v1/promotions/${id}/share-links`);}
export async function createPromotionLink(id:string,payload:{audience_type_id:number;expires_at:string|null;allow_pdf:boolean;allow_print:boolean}):Promise<PromotionShareLink>{return catalogueRequest(`/v1/promotions/${id}/share-links`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});}
export async function revokePromotionLink(id:string,linkId:string):Promise<PromotionShareLink>{return catalogueRequest(`/v1/promotions/${id}/share-links/${linkId}/revoke`,{method:"POST"});}
export async function getPromotionOccasions():Promise<PromotionOccasion[]>{return catalogueRequest("/v1/promotion-occasions");}
export async function createPromotionOccasion(payload:Omit<PromotionOccasion,"id"|"created_at"|"updated_at">):Promise<PromotionOccasion>{return catalogueRequest("/v1/promotion-occasions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});}
export async function updatePromotionOccasion(id:number,payload:Partial<PromotionOccasion>):Promise<PromotionOccasion>{return catalogueRequest(`/v1/promotion-occasions/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});}
export async function getPublicPromotion(token:string):Promise<PublicPromotion>{const response=await fetch(`${API_URL}/v1/public/promotions/${encodeURIComponent(token)}`,{headers:{Accept:"application/json"}});if(!response.ok)throw await parseError(response);return response.json();}

export function getCatalogueStats(): Promise<CatalogueStats> {
  return catalogueRequest<CatalogueStats>("/catalogue/stats");
}

export function getDashboardOverview(): Promise<DashboardOverview> {
  return catalogueRequest<DashboardOverview>("/v1/dashboard/overview");
}

export function getDashboardSyncStatus(): Promise<DashboardSyncStatus> {
  return catalogueRequest<DashboardSyncStatus>("/v1/dashboard/sync-status");
}

export function searchGlobally(query: string, signal?: AbortSignal): Promise<GlobalSearchResponse> {
  return catalogueRequest<GlobalSearchResponse>(`/v1/search/global?q=${encodeURIComponent(query)}`, { signal });
}

export function getSystemHealth(): Promise<SystemHealth> {
  return catalogueRequest<SystemHealth>("/health");
}

export function getGlobalProductCards(filters: {
  q?: string;
  brand?: string;
  category?: string;
  templateId?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<GlobalProductCardPage> {
  const query = new URLSearchParams();
  if (filters.q) query.set("q", filters.q);
  if (filters.brand) query.set("brand", filters.brand);
  if (filters.category) query.set("category", filters.category);
  if (filters.templateId) query.set("template_id", filters.templateId);
  query.set("page", String(filters.page ?? 1));
  query.set("page_size", String(filters.pageSize ?? 24));
  return catalogueRequest(`/v1/product-cards?${query}`, { cache: "no-store" });
}

export function getGlobalProductCard(productId: string): Promise<GlobalProductCardDetail> {
  return catalogueRequest(`/v1/product-cards/${productId}`, { cache: "no-store" });
}

export function saveGlobalProductCardDraft(
  productId: string,
  payload: { template_id: string | null; revision: number; presentation: ProductCardPresentation },
): Promise<GlobalProductCardDetail> {
  return catalogueRequest(`/v1/product-cards/${productId}/draft`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function publishGlobalProductCard(
  productId: string,
  revision: number,
  changeNote = "Published from Product Cards",
): Promise<GlobalProductCardDetail> {
  return catalogueRequest(`/v1/product-cards/${productId}/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision, change_note: changeNote }),
  });
}

export function getGlobalProductCardVersions(productId: string): Promise<GlobalProductCardVersion[]> {
  return catalogueRequest(`/v1/product-cards/${productId}/versions`, { cache: "no-store" });
}

export function restoreGlobalProductCardVersion(
  productId: string,
  versionId: string,
): Promise<GlobalProductCardDetail> {
  return catalogueRequest(`/v1/product-cards/${productId}/restore/${versionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ change_note: "Restored from Product Cards" }),
  });
}

export function getProducts(filters?: {
  q?: string;
  status?: string;
  productStatus?: "active" | "inactive" | "all";
  brand?: string;
  categoryId?: number;
  needs?: string;
  priceLevelId?: number;
  audienceTypeId?: number;
  page?: number;
}): Promise<ProductPage> {
  const query = new URLSearchParams();
  if (filters?.q) query.set("q", filters.q);
  if (filters?.status) query.set("status", filters.status);
  if (filters?.productStatus) query.set("product_status", filters.productStatus);
  if (filters?.brand) query.set("brand", filters.brand);
  if (filters?.categoryId) {
    query.set("category_id", String(filters.categoryId));
  }
  if (filters?.needs) query.set("needs", filters.needs);
  if (filters?.priceLevelId) {
    query.set("price_level_id", String(filters.priceLevelId));
  }
  if (filters?.audienceTypeId) {
    query.set("audience_type_id", String(filters.audienceTypeId));
  }
  query.set("page", String(filters?.page ?? 1));
  query.set("page_size", "20");
  return catalogueRequest<ProductPage>(`/catalogue/products?${query}`);
}

export function changeProductStatus(
  productId: string,
  payload: { status: "active" | "inactive"; reason?: string; note?: string },
): Promise<ProductDetail> {
  return catalogueRequest<ProductDetail>(`/v1/products/${productId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getProduct(productId: string): Promise<ProductDetail> {
  return catalogueRequest<ProductDetail>(`/catalogue/products/${productId}`);
}

export function createProduct(
  payload: ProductCreatePayload,
): Promise<ProductDetail> {
  return catalogueRequest<ProductDetail>("/catalogue/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateProductContent(
  productId: string,
  payload: CatalogueContentPayload,
): Promise<ProductDetail> {
  return catalogueRequest<ProductDetail>(
    `/catalogue/products/${productId}/content`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export function updateProductMasterData(
  productId: string,
  payload: ProductMasterPayload,
): Promise<ProductDetail> {
  return catalogueRequest<ProductDetail>(
    `/catalogue/products/${productId}/master-data`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function performWorkflowAction(
  productId: string,
  action: "submit" | "approve" | "publish" | "unpublish",
): Promise<ProductDetail> {
  const response = await catalogueRequest<{ product: ProductDetail }>(
    `/catalogue/products/${productId}/${action}`,
    { method: "POST" },
  );
  return response.product;
}

export function getCategories(
  includeInactive = false,
  includeBrands = true,
): Promise<Category[]> {
  return catalogueRequest<Category[]>(
    `/catalogue/categories?include_inactive=${includeInactive}&include_brands=${includeBrands}`,
  );
}

export function createCategory(payload: {
  name: string;
  description: string;
}): Promise<Category> {
  return catalogueRequest<Category>("/catalogue/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateCategory(
  categoryId: number,
  payload: Partial<
    Pick<Category, "name" | "description" | "is_active" | "inactive_reason">
  >,
): Promise<Category> {
  return catalogueRequest<Category>(`/catalogue/categories/${categoryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getActivity(limit = 30): Promise<ActivityItem[]> {
  return catalogueRequest<ActivityItem[]>(
    `/catalogue/activity?limit=${limit}`,
  );
}

export function uploadProductImage(
  productId: string,
  file: File,
  altText: string,
): Promise<ProductImage> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("alt_text", altText);
  return catalogueRequest<ProductImage>(
    `/catalogue/products/${productId}/images`,
    {
      method: "POST",
      body: formData,
    },
  );
}

export function getErpProductImages(
  productId: string,
): Promise<ErpProductImageCandidate[]> {
  return catalogueRequest<ErpProductImageCandidate[]>(
    `/catalogue/products/${productId}/erp-images`,
  );
}

export function importErpProductImage(
  productId: string,
  slot: number,
  payload: { alt_text: string; make_primary: boolean },
): Promise<ProductImage> {
  return catalogueRequest<ProductImage>(
    `/catalogue/products/${productId}/erp-images/${slot}/import`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export function setPrimaryImage(
  productId: string,
  imageId: string,
): Promise<ProductImage> {
  return catalogueRequest<ProductImage>(
    `/catalogue/products/${productId}/images/${imageId}/primary`,
    { method: "POST" },
  );
}

export function deleteProductImage(
  productId: string,
  imageId: string,
): Promise<void> {
  return catalogueRequest<void>(
    `/catalogue/products/${productId}/images/${imageId}`,
    { method: "DELETE" },
  );
}

export function deleteProduct(productId: string): Promise<void> {
  return catalogueRequest<void>(`/catalogue/products/${productId}`, {
    method: "DELETE",
  });
}

export function getProductVideos(productId: string): Promise<ProductVideo[]> {
  return catalogueRequest<ProductVideo[]>(`/v1/products/${productId}/videos`);
}

export type ProductVideoForm = {
  source_type: "upload" | "external";
  file?: File | null;
  external_url?: string;
  title_en?: string;
  title_th?: string;
  description?: string;
  alt_text?: string;
  is_featured?: boolean;
  is_active?: boolean;
  show_in_catalogue?: boolean;
  show_in_public_catalogue?: boolean;
  show_controls?: boolean;
  allow_download?: boolean;
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
};

function videoFormData(values: ProductVideoForm): FormData {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null) data.append(key, value instanceof File ? value : String(value));
  });
  return data;
}

export function createProductVideo(
  productId: string,
  values: ProductVideoForm,
  onProgress?: (percent: number) => void,
): { promise: Promise<ProductVideo>; cancel: () => void } {
  const request = new XMLHttpRequest();
  const promise = new Promise<ProductVideo>((resolve, reject) => {
    request.open("POST", `${API_URL}/v1/products/${productId}/videos`);
    request.withCredentials = true;
    request.setRequestHeader("Accept", "application/json");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new ApiError("The video could not be uploaded. Please try again.", 0));
    request.onabort = () => reject(new ApiError("Video upload cancelled.", 0));
    request.onload = () => {
      let body: { detail?: string } | ProductVideo = {};
      try { body = JSON.parse(request.responseText) as typeof body; } catch { /* safe fallback */ }
      if (request.status >= 200 && request.status < 300) resolve(body as ProductVideo);
      else reject(new ApiError((body as { detail?: string }).detail || "The video could not be uploaded. Please try again.", request.status));
    };
    request.send(videoFormData(values));
  });
  return { promise, cancel: () => request.abort() };
}

export function updateProductVideo(productId: string, videoId: string, values: Partial<Omit<ProductVideoForm, "source_type" | "file" | "external_url">>): Promise<ProductVideo> {
  return catalogueRequest<ProductVideo>(`/v1/products/${productId}/videos/${videoId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values),
  });
}

export function setFeaturedProductVideo(productId: string, videoId: string): Promise<ProductVideo> {
  return catalogueRequest<ProductVideo>(`/v1/products/${productId}/videos/${videoId}/set-featured`, { method: "POST" });
}

export function deleteProductVideo(productId: string, videoId: string): Promise<void> {
  return catalogueRequest<void>(`/v1/products/${productId}/videos/${videoId}`, { method: "DELETE" });
}

export function uploadProductVideoThumbnail(productId: string, videoId: string, file: File): Promise<ProductVideo> {
  const data = new FormData(); data.append("file", file);
  return catalogueRequest<ProductVideo>(`/v1/products/${productId}/videos/${videoId}/thumbnail`, { method: "POST", body: data });
}

export function replaceProductVideo(productId: string, videoId: string, file: File): Promise<ProductVideo> {
  const data = new FormData(); data.append("file", file);
  return catalogueRequest<ProductVideo>(`/v1/products/${productId}/videos/${videoId}/replace`, { method: "POST", body: data });
}

export function uploadProductVideoCaption(productId: string, videoId: string, file: File): Promise<ProductVideo> {
  const data = new FormData(); data.append("file", file);
  return catalogueRequest<ProductVideo>(`/v1/products/${productId}/videos/${videoId}/caption`, { method: "POST", body: data });
}

export function getManagedUsers(q = ""): Promise<ManagedUser[]> {
  const query = new URLSearchParams();
  if (q) query.set("q", q);
  return catalogueRequest<ManagedUser[]>(`/users?${query}`);
}

export function getOrganizationPermissions(): Promise<OrganizationPermission[]> {
  return catalogueRequest<OrganizationPermission[]>("/organization/permissions");
}

export function getManagedUserAccess(userId: string): Promise<ManagedUserAccess> {
  return catalogueRequest<ManagedUserAccess>(`/v1/access/users/${userId}`);
}

export function updateManagedUserAccess(
  userId: string,
  payload: {
    overrides: Array<{
      permission_id: number;
      effect: "allow" | "deny";
      access_scope: string;
      reason: string;
      expires_at: string | null;
    }>;
    reason: string;
  },
): Promise<ManagedUserAccess> {
  return catalogueRequest<ManagedUserAccess>(`/v1/access/users/${userId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function createManagedUser(payload: {
  full_name: string;
  username: string;
  email: string;
  password: string;
  role_names: string[];
  department_id: number | null;
  position_id: number | null;
  employee_code: string | null;
  team_ids: number[];
  primary_team_id: number | null;
}): Promise<ManagedUser> {
  return catalogueRequest<ManagedUser>("/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateManagedUser(
  userId: string,
  payload: {
    full_name: string;
    email: string;
    is_active: boolean;
    role_names: string[];
    department_id: number | null;
    position_id: number | null;
    employee_code: string | null;
    team_ids: number[];
    primary_team_id: number | null;
  },
): Promise<ManagedUser> {
  return catalogueRequest<ManagedUser>(`/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function resetManagedUserPassword(
  userId: string,
  password: string,
): Promise<ManagedUser> {
  const response = await catalogueRequest<{ user: ManagedUser }>(
    `/users/${userId}/reset-password`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    },
  );
  return response.user;
}

export async function unlockManagedUser(
  userId: string,
): Promise<ManagedUser> {
  const response = await catalogueRequest<{ user: ManagedUser }>(
    `/users/${userId}/unlock`,
    { method: "POST" },
  );
  return response.user;
}

type NamedEntityPayload = {
  name: string;
  code: string;
  description: string;
  is_active: boolean;
};

export function getOrganizationSummary(): Promise<OrganizationSummary> {
  return catalogueRequest<OrganizationSummary>("/organization/summary");
}

export function getDepartments(): Promise<Department[]> {
  return catalogueRequest<Department[]>("/organization/departments");
}

export function saveDepartment(
  payload: NamedEntityPayload & { parent_id: number | null },
  id?: number,
): Promise<Department> {
  return catalogueRequest<Department>(
    `/organization/departments${id ? `/${id}` : ""}`,
    {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export function getPositions(): Promise<Position[]> {
  return catalogueRequest<Position[]>("/organization/positions");
}

export function savePosition(
  payload: NamedEntityPayload & { department_id: number },
  id?: number,
): Promise<Position> {
  return catalogueRequest<Position>(
    `/organization/positions${id ? `/${id}` : ""}`,
    {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export function getBrands(): Promise<Brand[]> {
  return catalogueRequest<Brand[]>("/organization/brands");
}

export function updateBrandStatus(
  brandId: number,
  payload: { is_active: boolean; inactive_reason: string },
): Promise<Brand> {
  return catalogueRequest<Brand>(`/organization/brands/${brandId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function saveBrand(
  payload: NamedEntityPayload,
  id?: number,
): Promise<Brand> {
  return catalogueRequest<Brand>(
    `/organization/brands${id ? `/${id}` : ""}`,
    {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export function getTeams(): Promise<Team[]> {
  return catalogueRequest<Team[]>("/organization/teams");
}

export function saveTeam(
  payload: NamedEntityPayload & {
    department_id: number;
    brand_ids: number[];
  },
  id?: number,
): Promise<Team> {
  return catalogueRequest<Team>(
    `/organization/teams${id ? `/${id}` : ""}`,
    {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export function getCatalogueAccessRules(): Promise<CatalogueAccessRule[]> {
  return catalogueRequest<CatalogueAccessRule[]>(
    "/organization/catalogue-access",
  );
}

export function saveCatalogueAccessRule(
  departmentId: number,
  brandId: number,
  payload: { can_view: boolean; can_manage: boolean },
): Promise<CatalogueAccessRule> {
  return catalogueRequest<CatalogueAccessRule>(
    `/organization/catalogue-access/${departmentId}/${brandId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export function getPriceLists(includeInactive = false): Promise<PriceList[]> {
  return catalogueRequest<PriceList[]>(
    `/v1/price-lists?include_inactive=${includeInactive}`,
  );
}

export function getErpCustomerPriceLevels(): Promise<ErpCustomerPriceLevel[]> {
  return catalogueRequest<ErpCustomerPriceLevel[]>("/v1/price-levels");
}

export function getMyCataloguePriceMappings(brand?: string): Promise<UserCataloguePriceMapping[]> {
  const query = brand ? `?brand=${encodeURIComponent(brand)}` : "";
  return catalogueRequest<UserCataloguePriceMapping[]>(
    `/v1/my-catalogue-price-mappings${query}`,
  );
}

export function getMyCataloguePriceMappingSummary(): Promise<UserBrandCataloguePriceMappingSummary[]> {
  return catalogueRequest<UserBrandCataloguePriceMappingSummary[]>(
    "/v1/my-catalogue-price-mapping-summary",
  );
}

export function updateMyCataloguePriceMappings(
  mappings: Array<{ audience_type_id: number; price_list_id: number }>,
  brand?: string,
): Promise<UserCataloguePriceMapping[]> {
  return catalogueRequest<UserCataloguePriceMapping[]>(
    "/v1/my-catalogue-price-mappings",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mappings, brand: brand || null }),
    },
  );
}

export function getErpProductCustomerPrices(filters?: {
  q?: string;
  priceLevelId?: number;
  brand?: string;
  categoryId?: number;
  page?: number;
  pageSize?: number;
}): Promise<ErpProductCustomerPricePage> {
  const query = new URLSearchParams();
  if (filters?.q) query.set("q", filters.q);
  if (filters?.priceLevelId) {
    query.set("price_level_id", String(filters.priceLevelId));
  }
  if (filters?.brand) query.set("brand", filters.brand);
  if (filters?.categoryId) {
    query.set("category_id", String(filters.categoryId));
  }
  query.set("page", String(filters?.page ?? 1));
  query.set("page_size", String(filters?.pageSize ?? 100));
  return catalogueRequest<ErpProductCustomerPricePage>(
    `/v1/erp-customer-prices?${query}`,
  );
}

export function getErpCustomerPriceFilters(): Promise<ErpCustomerPriceFilters> {
  return catalogueRequest<ErpCustomerPriceFilters>(
    "/v1/erp-customer-price-filters",
  );
}

export function getErpProductPriceMatrix(filters?: {
  q?: string;
  brand?: string;
  categoryId?: number;
  page?: number;
  pageSize?: number;
}): Promise<ErpProductPriceMatrixPage> {
  const query = new URLSearchParams();
  if (filters?.q) query.set("q", filters.q);
  if (filters?.brand) query.set("brand", filters.brand);
  if (filters?.categoryId) {
    query.set("category_id", String(filters.categoryId));
  }
  query.set("page", String(filters?.page ?? 1));
  query.set("page_size", String(filters?.pageSize ?? 50));
  return catalogueRequest<ErpProductPriceMatrixPage>(
    `/v1/erp-product-price-matrix?${query}`,
  );
}

export function createPriceList(
  payload: PriceListPayload,
): Promise<PriceList> {
  return catalogueRequest<PriceList>("/v1/price-lists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getProductPrices(filters?: {
  productId?: string;
  priceListId?: number;
}): Promise<ProductPrice[]> {
  const query = new URLSearchParams();
  if (filters?.productId) query.set("product_id", filters.productId);
  if (filters?.priceListId) {
    query.set("price_list_id", String(filters.priceListId));
  }
  const suffix = query.size ? `?${query}` : "";
  return catalogueRequest<ProductPrice[]>(`/v1/product-prices${suffix}`);
}

export function createProductPrice(
  payload: PriceProposalPayload,
): Promise<ProductPrice> {
  return catalogueRequest<ProductPrice>("/v1/product-prices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getPriceChangeRequests(
  status?: PriceRequestStatus,
): Promise<PriceChangeRequest[]> {
  const query = status ? `?status=${status}` : "";
  return catalogueRequest<PriceChangeRequest[]>(
    `/v1/price-change-requests${query}`,
  );
}

export function proposePriceChange(
  payload: PriceProposalPayload,
): Promise<PriceChangeRequest> {
  return catalogueRequest<PriceChangeRequest>("/v1/price-change-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function reviewPriceChange(
  requestId: string,
  payload: { approve: boolean; reason: string },
): Promise<PriceChangeRequest> {
  return catalogueRequest<PriceChangeRequest>(
    `/v1/price-change-requests/${requestId}/review`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export function getCatalogues(filters?: {
  q?: string;
  status?: CatalogueStatus;
}): Promise<ManagedCatalogue[]> {
  const query = new URLSearchParams();
  if (filters?.q) query.set("q", filters.q);
  if (filters?.status) query.set("status", filters.status);
  const suffix = query.size ? `?${query}` : "";
  return catalogueRequest<ManagedCatalogue[]>(`/v1/catalogues${suffix}`);
}

export function getCatalogueBrandOptions(): Promise<CatalogueBrandOption[]> {
  return catalogueRequest<CatalogueBrandOption[]>("/v1/catalogues/brand-options");
}

export function createCatalogue(
  payload: CataloguePayload,
): Promise<ManagedCatalogue> {
  return catalogueRequest<ManagedCatalogue>("/v1/catalogues", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function generateErpBrandCatalogues(): Promise<CatalogueGenerationResult> {
  return catalogueRequest<CatalogueGenerationResult>(
    "/v1/catalogues/generate-erp-brands",
    { method: "POST" },
  );
}

export function getCatalogue(catalogueId: string): Promise<ManagedCatalogue> {
  return catalogueRequest<ManagedCatalogue>(`/v1/catalogues/${catalogueId}`);
}

export function updateCatalogue(
  catalogueId: string,
  payload: CataloguePayload & {
    status: CatalogueStatus;
    expected_revision: number;
  },
): Promise<ManagedCatalogue> {
  return catalogueRequest<ManagedCatalogue>(`/v1/catalogues/${catalogueId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function setCatalogueProducts(
  catalogueId: string,
  products: CatalogueProductInput[],
): Promise<ManagedCatalogue> {
  return catalogueRequest<ManagedCatalogue>(
    `/v1/catalogues/${catalogueId}/products`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ products }),
    },
  );
}

export function getCatalogueCover(catalogueId: string): Promise<CatalogueCover | null> {
  return catalogueRequest<CatalogueCover | null>(`/v1/catalogues/${catalogueId}/cover`);
}

export function uploadCatalogueCoverAsset(catalogueId: string, assetType: CatalogueCoverAssetType, file: File, altText = ""): Promise<CatalogueCoverAsset> {
  const form = new FormData();
  form.append("file", file);
  form.append("asset_type", assetType);
  form.append("alt_text", altText);
  return catalogueRequest<CatalogueCoverAsset>(`/v1/catalogues/${catalogueId}/cover/assets`, { method: "POST", body: form });
}

export function updateCatalogueCover(catalogueId: string, settings: Partial<Omit<CatalogueCover, "id" | "catalogue_id" | "created_by" | "updated_by" | "created_at" | "updated_at" | "assets" | "asset_history">>): Promise<CatalogueCover> {
  return catalogueRequest<CatalogueCover>(`/v1/catalogues/${catalogueId}/cover`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
}

export function updateCatalogueCoverAsset(catalogueId: string, assetId: string, settings: Partial<Pick<CatalogueCoverAsset, "alt_text" | "position_x_percent" | "position_y_percent" | "width_percent" | "height_percent" | "opacity" | "rotation" | "z_index">> & { restore?: boolean }): Promise<CatalogueCoverAsset> {
  return catalogueRequest<CatalogueCoverAsset>(`/v1/catalogues/${catalogueId}/cover/assets/${assetId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
}

export function deleteCatalogueCoverAsset(catalogueId: string, assetId: string, permanent = false): Promise<void> {
  const query = permanent ? "?permanent=true" : "";
  return catalogueRequest<void>(`/v1/catalogues/${catalogueId}/cover/assets/${assetId}${query}`, { method: "DELETE" });
}

export function resetCatalogueCover(catalogueId: string): Promise<CatalogueCover> {
  return catalogueRequest<CatalogueCover>(`/v1/catalogues/${catalogueId}/cover/reset`, { method: "POST" });
}

export function publishCatalogueCover(catalogueId: string): Promise<CatalogueCover> {
  return catalogueRequest<CatalogueCover>(`/v1/catalogues/${catalogueId}/cover/publish`, { method: "POST" });
}

export function getCatalogueCategorySettings(catalogueId: string, brand?: string): Promise<CatalogueCategorySetting[]> {
  const query = new URLSearchParams();
  if (brand) query.set("brand", brand);
  const suffix = query.size ? `?${query}` : "";
  return catalogueRequest<CatalogueCategorySetting[]>(`/v1/catalogues/${catalogueId}/categories${suffix}`);
}

export function updateCatalogueCategorySettings(catalogueId: string, categories: Array<Pick<CatalogueCategorySetting, "category_id" | "display_name" | "description" | "display_order" | "is_visible" | "show_product_count" | "default_expanded">>, brand?: string): Promise<CatalogueCategorySetting[]> {
  const query = new URLSearchParams();
  if (brand) query.set("brand", brand);
  const suffix = query.size ? `?${query}` : "";
  return catalogueRequest<CatalogueCategorySetting[]>(`/v1/catalogues/${catalogueId}/categories${suffix}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categories }) });
}

export function uploadCatalogueCategoryBanner(catalogueId: string, categoryId: number, file: File): Promise<CatalogueCategorySetting[]> {
  const form = new FormData(); form.append("file", file);
  return catalogueRequest<CatalogueCategorySetting[]>(`/v1/catalogues/${catalogueId}/categories/${categoryId}/banner`, { method: "POST", body: form });
}

export function deleteCatalogueCategoryBanner(catalogueId: string, categoryId: number): Promise<CatalogueCategorySetting[]> {
  return catalogueRequest<CatalogueCategorySetting[]>(`/v1/catalogues/${catalogueId}/categories/${categoryId}/banner`, { method: "DELETE" });
}

export function previewCatalogue(
  catalogueId: string,
  version?: number,
  audienceTypeId?: number,
  includeInactive = false,
): Promise<CataloguePreview> {
  const parameters = new URLSearchParams();
  if (version) parameters.set("version", String(version));
  if (audienceTypeId) {
    parameters.set("audience_type_id", String(audienceTypeId));
  }
  if (includeInactive) parameters.set("include_inactive", "true");
  const query = parameters.size ? `?${parameters.toString()}` : "";
  return catalogueRequest<CataloguePreview>(
    `/v1/catalogues/${catalogueId}/preview${query}`,
  );
}

export function publishCatalogue(
  catalogueId: string,
): Promise<CatalogueVersion> {
  return catalogueRequest<CatalogueVersion>(
    `/v1/catalogues/${catalogueId}/publish`,
    { method: "POST" },
  );
}

export function getCatalogueVersions(
  catalogueId: string,
): Promise<CatalogueVersion[]> {
  return catalogueRequest<CatalogueVersion[]>(
    `/v1/catalogues/${catalogueId}/versions`,
  );
}

export function getCatalogueAudienceTypes(): Promise<CatalogueAudienceType[]> {
  return catalogueRequest<CatalogueAudienceType[]>("/v1/catalogue-audience-types");
}

export function getCatalogueCardLinks(
  catalogueIds: string[] = [],
): Promise<Record<string, CatalogueShareLink[]>> {
  const query = catalogueIds.length
    ? `?catalogue_ids=${encodeURIComponent(catalogueIds.join(","))}`
    : "";
  return catalogueRequest<Record<string, CatalogueShareLink[]>>(
    `/v1/catalogue-share-links/cards${query}`,
  );
}

export function getCatalogueOnlineLinks(): Promise<Record<string, string>> {
  return catalogueRequest<Record<string, string>>("/v1/catalogue-online-links");
}

export function getCatalogueShareLinks(catalogueId: string): Promise<CatalogueShareLink[]> {
  return catalogueRequest<CatalogueShareLink[]>(`/v1/catalogues/${catalogueId}/share-links`);
}

export type CatalogueShareLinkPayload = {
  audience_type_id: number;
  customer_code?: string | null;
  customer_name?: string | null;
  version_mode?: "latest_published" | "fixed_published";
  fixed_version_number?: number | null;
  expires_at?: string | null;
  password?: string | null;
  allow_pdf_download?: boolean;
  allow_print?: boolean;
};

export function createCatalogueShareLink(catalogueId: string, payload: CatalogueShareLinkPayload): Promise<CatalogueShareLink> {
  return catalogueRequest<CatalogueShareLink>(`/v1/catalogues/${catalogueId}/share-links`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}

export function updateCatalogueShareLink(catalogueId: string, linkId: string, payload: Omit<Partial<CatalogueShareLinkPayload>, "audience_type_id">): Promise<CatalogueShareLink> {
  return catalogueRequest<CatalogueShareLink>(`/v1/catalogues/${catalogueId}/share-links/${linkId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}

export function regenerateCatalogueShareLink(catalogueId: string, linkId: string): Promise<CatalogueShareLink> {
  return catalogueRequest<CatalogueShareLink>(`/v1/catalogues/${catalogueId}/share-links/${linkId}/regenerate`, { method: "POST" });
}

export function revokeCatalogueShareLink(catalogueId: string, linkId: string): Promise<CatalogueShareLink> {
  return catalogueRequest<CatalogueShareLink>(`/v1/catalogues/${catalogueId}/share-links/${linkId}/revoke`, { method: "POST" });
}

export function activateCatalogueShareLink(catalogueId: string, linkId: string): Promise<CatalogueShareLink> {
  return catalogueRequest<CatalogueShareLink>(`/v1/catalogues/${catalogueId}/share-links/${linkId}/activate`, { method: "POST" });
}

export function deleteCatalogueShareLink(catalogueId: string, linkId: string): Promise<void> {
  return catalogueRequest<void>(`/v1/catalogues/${catalogueId}/share-links/${linkId}`, { method: "DELETE" });
}

export function getCatalogueVersion(
  catalogueId: string,
  versionNumber: number,
): Promise<CatalogueVersion> {
  return catalogueRequest<CatalogueVersion>(
    `/v1/catalogues/${catalogueId}/versions/${versionNumber}`,
  );
}

export function duplicateCatalogue(
  catalogueId: string,
): Promise<ManagedCatalogue> {
  return catalogueRequest<ManagedCatalogue>(
    `/v1/catalogues/${catalogueId}/duplicate`,
    { method: "POST" },
  );
}

export function archiveCatalogue(
  catalogueId: string,
): Promise<ManagedCatalogue> {
  return catalogueRequest<ManagedCatalogue>(
    `/v1/catalogues/${catalogueId}/archive`,
    { method: "POST" },
  );
}

export function deleteCatalogue(catalogueId: string): Promise<void> {
  return catalogueRequest<void>(`/v1/catalogues/${catalogueId}`, {
    method: "DELETE",
  });
}

export async function downloadCatalogueExport(
  catalogueId: string,
  format: "pdf" | "excel",
  versionNumber?: number,
  options?: {
    language?: "en" | "th" | "en-th";
    includeCover?: boolean;
    paperSize?: "A4";
    orientation?: "landscape";
    includeTableOfContents?: boolean;
    audienceTypeId?: number;
  },
): Promise<{ blob: Blob; fileName: string }> {
  const parameters = new URLSearchParams();
  if (format === "pdf") {
    parameters.set("paper_size", options?.paperSize ?? CATALOGUE_PDF_CONFIG.paperSize);
    parameters.set("orientation", options?.orientation ?? CATALOGUE_PDF_CONFIG.orientation);
  }
  if (versionNumber) parameters.set("version", String(versionNumber));
  if (options?.audienceTypeId) {
    parameters.set("audience_type_id", String(options.audienceTypeId));
  }
  if (format === "pdf" && options?.language) {
    parameters.set("language", options.language);
  }
  if (format === "pdf" && options?.includeCover !== undefined) {
    parameters.set("include_cover", String(options.includeCover));
  }
  if (format === "pdf" && options?.includeTableOfContents !== undefined) {
    parameters.set("include_table_of_contents", String(options.includeTableOfContents));
  }
  const query = parameters.size ? `?${parameters.toString()}` : "";
  const response = await fetch(
    `${API_URL}/v1/catalogues/${catalogueId}/export/${format}${query}`,
    {
      credentials: "include",
      headers: { Accept: format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    },
  );
  if (!response.ok) {
    throw await parseError(response);
  }
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plainName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  const fallbackExtension = format === "pdf" ? "pdf" : "xlsx";
  return {
    blob: await response.blob(),
    fileName:
      (encodedName ? decodeURIComponent(encodedName) : plainName) ||
      `catalogue.${fallbackExtension}`,
  };
}

export function recordCataloguePrint(
  catalogueId: string,
  version?: number,
): Promise<void> {
  const query = version ? `?version=${version}` : "";
  return catalogueRequest<void>(`/v1/catalogues/${catalogueId}/print${query}`, {
    method: "POST",
  });
}

export function getBackups(type: "database" | "application"): Promise<BackupJob[]> {
  return catalogueRequest<BackupJob[]>(`/v1/admin/backups/${type}`);
}

export function createBackup(type: "database" | "application", description: string, components: string[] = []): Promise<BackupJob> {
  return catalogueRequest<BackupJob>(`/v1/admin/backups/${type}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description, components }) });
}

export async function downloadBackup(type: "database" | "application", id: string, fileName: string): Promise<void> {
  const response = await fetch(`${API_URL}/v1/admin/backups/${type}/${id}/download`, { credentials: "include" });
  if (!response.ok) throw await parseError(response);
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName; anchor.click(); URL.revokeObjectURL(url);
}

export function deleteBackup(type: "database" | "application", id: string): Promise<void> {
  return catalogueRequest<void>(`/v1/admin/backups/${type}/${id}`, { method: "DELETE" });
}

export function getSystemMetrics(): Promise<SystemMetrics> {
  return catalogueRequest<SystemMetrics>("/v1/admin/system/metrics");
}

export function getSystemInformation(): Promise<Record<string, string | boolean>> {
  return catalogueRequest<Record<string, string | boolean>>("/v1/admin/system/information");
}

export function submitFeedback(
  payload: FeedbackSubmitPayload,
): Promise<FeedbackItem> {
  if (!payload.screenshot) {
    return catalogueRequest<FeedbackItem>("/v1/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        module_page: payload.module_page,
        feedback_type: payload.feedback_type,
        title: payload.title,
        description: payload.description,
        suggested_change: payload.suggested_change || null,
        priority: payload.priority,
      }),
    });
  }

  const formData = new FormData();
  formData.append("module_page", payload.module_page);
  formData.append("feedback_type", payload.feedback_type);
  formData.append("title", payload.title);
  formData.append("description", payload.description);
  formData.append("suggested_change", payload.suggested_change);
  formData.append("priority", payload.priority);
  formData.append("screenshot", payload.screenshot);

  return catalogueRequest<FeedbackItem>("/v1/feedback/with-screenshot", {
    method: "POST",
    body: formData,
  });
}

export function getFeedback(filters?: {
  q?: string;
  feedbackType?: FeedbackType | "";
  priority?: FeedbackPriority | "";
  status?: FeedbackStatus | "";
  page?: number;
  pageSize?: number;
}): Promise<FeedbackPage> {
  const query = new URLSearchParams();
  if (filters?.q) query.set("search", filters.q);
  if (filters?.feedbackType) query.set("type", filters.feedbackType);
  if (filters?.priority) query.set("priority", filters.priority);
  if (filters?.status) query.set("status", filters.status);
  query.set("page", String(filters?.page ?? 1));
  query.set("page_size", String(filters?.pageSize ?? 20));
  return catalogueRequest<FeedbackPage>(`/v1/feedback?${query}`);
}

export function getFeedbackItem(feedbackId: string): Promise<FeedbackItem> {
  return catalogueRequest<FeedbackItem>(`/v1/feedback/${feedbackId}`);
}

export function updateFeedback(
  feedbackId: string,
  payload: FeedbackUpdatePayload,
): Promise<FeedbackItem> {
  return catalogueRequest<FeedbackItem>(`/v1/feedback/${feedbackId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function downloadFeedbackExport(filters?: {
  q?: string;
  feedbackType?: FeedbackType | "";
  priority?: FeedbackPriority | "";
  status?: FeedbackStatus | "";
}): Promise<{ blob: Blob; fileName: string }> {
  const query = new URLSearchParams();
  if (filters?.q) query.set("search", filters.q);
  if (filters?.feedbackType) query.set("type", filters.feedbackType);
  if (filters?.priority) query.set("priority", filters.priority);
  if (filters?.status) query.set("status", filters.status);
  const suffix = query.size ? `?${query}` : "";
  const response = await fetch(`${API_URL}/v1/feedback/export.csv${suffix}`, {
    credentials: "include",
    headers: { Accept: "text/csv" },
  });
  if (!response.ok) throw await parseError(response);
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plainName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  return {
    blob: await response.blob(),
    fileName:
      (encodedName ? decodeURIComponent(encodedName) : plainName) ||
      "demo-feedback.csv",
  };
}

export function getErpConnection(): Promise<ErpConnection> {
  return catalogueRequest<ErpConnection>("/v1/admin/erp");
}

export function saveErpConnection(payload: {
  name: string;
  server: string;
  port: number;
  database_name: string;
  username: string;
  password?: string | null;
  is_enabled: boolean;
  connection_timeout_seconds: number;
}): Promise<ErpConnection> {
  return catalogueRequest<ErpConnection>("/v1/admin/erp", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function testErpConnection(): Promise<ErpConnectionTest> {
  return catalogueRequest<ErpConnectionTest>("/v1/admin/erp/test", { method: "POST" });
}

export function getErpTables(): Promise<Array<{ schema_name: string; table_name: string }>> {
  return catalogueRequest<Array<{ schema_name: string; table_name: string }>>("/v1/admin/erp/tables");
}

export function previewErpProducts(limit = 20, includeDiscontinued = true): Promise<ErpPreview> {
  return catalogueRequest<ErpPreview>(`/v1/admin/erp/preview?limit=${limit}&include_discontinued=${includeDiscontinued}`);
}

export function syncErpProducts(limit: number, includeDiscontinued: boolean): Promise<ErpSyncRun> {
  return catalogueRequest<ErpSyncRun>("/v1/admin/erp/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ limit, include_discontinued: includeDiscontinued }),
  });
}

export function getErpSyncRuns(): Promise<ErpSyncRun[]> {
  return catalogueRequest<ErpSyncRun[]>("/v1/admin/erp/sync-runs");
}

export function getProductSyncStatus(): Promise<ProductSyncStatus> {
  return catalogueRequest<ProductSyncStatus>("/v1/admin/data-sync/status", { cache: "no-store" });
}

export function getProductSyncHistory(): Promise<ProductSyncRun[]> {
  return catalogueRequest<ProductSyncRun[]>("/v1/admin/data-sync/history", { cache: "no-store" });
}

export function runProductSync(): Promise<ProductSyncRun> {
  return catalogueRequest<ProductSyncRun>("/v1/admin/data-sync/run", { method: "POST" });
}

export function getAdminPositions(filters: { q?: string; departmentId?: number; teamId?: number; active?: string; page?: number } = {}): Promise<AdminPositionPage> {
  const query = new URLSearchParams({ page: String(filters.page ?? 1), page_size: "50" });
  if (filters.q) query.set("q", filters.q);
  if (filters.departmentId) query.set("department_id", String(filters.departmentId));
  if (filters.teamId) query.set("team_id", String(filters.teamId));
  if (filters.active) query.set("active", filters.active);
  return catalogueRequest<AdminPositionPage>(`/v1/positions?${query}`);
}

export function getAdminPosition(id: number): Promise<AdminPosition> { return catalogueRequest(`/v1/positions/${id}`); }
export function saveAdminPosition(payload: AdminPositionPayload, id?: number): Promise<AdminPosition> {
  return catalogueRequest(`/v1/positions${id ? `/${id}` : ""}`, { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}
export function duplicateAdminPosition(id: number): Promise<AdminPosition> { return catalogueRequest(`/v1/positions/${id}/duplicate`, { method: "POST" }); }
export function setAdminPositionActive(id: number, active: boolean): Promise<AdminPosition | { message: string }> { return catalogueRequest(`/v1/positions/${id}/${active ? "activate" : "deactivate"}`, { method: "POST" }); }
export function deleteAdminPosition(id: number): Promise<void> { return catalogueRequest<void>(`/v1/positions/${id}`, { method: "DELETE" }); }

export function getAdminTeams(filters: { q?: string; departmentId?: number; leaderId?: string; active?: string; page?: number } = {}): Promise<AdminTeamPage> {
  const query = new URLSearchParams({ page: String(filters.page ?? 1), page_size: "50" });
  if (filters.q) query.set("q", filters.q);
  if (filters.departmentId) query.set("department_id", String(filters.departmentId));
  if (filters.leaderId) query.set("leader_id", filters.leaderId);
  if (filters.active) query.set("active", filters.active);
  return catalogueRequest<AdminTeamPage>(`/v1/teams?${query}`);
}

export function getAdminTeam(id: number): Promise<AdminTeam> { return catalogueRequest(`/v1/teams/${id}`); }
export function saveAdminTeam(payload: AdminTeamPayload, id?: number): Promise<AdminTeam> { return catalogueRequest(`/v1/teams${id ? `/${id}` : ""}`, { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); }
export function duplicateAdminTeam(id: number): Promise<AdminTeam> { return catalogueRequest(`/v1/teams/${id}/duplicate`, { method: "POST" }); }
export function setAdminTeamActive(id: number, active: boolean): Promise<AdminTeam | { message: string }> { return catalogueRequest(`/v1/teams/${id}/${active ? "activate" : "deactivate"}`, { method: "POST" }); }
export function deleteAdminTeam(id: number): Promise<void> { return catalogueRequest<void>(`/v1/teams/${id}`, { method: "DELETE" }); }
export function getAdminTeamMembers(id: number): Promise<AdminUserSummary[]> { return catalogueRequest(`/v1/teams/${id}/members`); }
export function saveAdminTeamMembers(id: number, memberIds: string[], primaryMemberIds: string[]): Promise<AdminUserSummary[]> { return catalogueRequest(`/v1/teams/${id}/members`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ member_ids: memberIds, primary_member_ids: primaryMemberIds }) }); }
