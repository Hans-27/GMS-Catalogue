import { catalogueRequest } from "./api";

export type StudioElementType = "text" | "image" | "image_carousel" | "logo" | "video" | "shape" | "icon" | "button" | "qr_code" | "line" | "rectangle" | "circle" | "barcode" | "page_number" | "catalogue_field" | "promotion_field" | "product_card" | "product_grid" | "product_field" | "category_field" | "background" | "table";
export type StudioPageType = "cover" | "introduction" | "category" | "product_grid" | "product_detail" | "product" | "promotion" | "terms" | "blank" | "brand_intro" | "table_of_contents" | "free_layout" | "final";

export type StudioCarouselImage = {
  id: string;
  assetId?: string | null;
  productImageId?: string | null;
  productId?: string | null;
  url?: string | null;
  fileName: string;
  altText: string;
  sourceType: "product_image" | "catalogue_media" | "brand_media" | "user_upload";
  displayOrder: number;
  isActive: boolean;
  fit: "contain" | "cover" | "fill" | "custom";
  positionX: number;
  positionY: number;
  zoom: number;
};

export type StudioCarouselConfig = {
  sourceType: "product_images" | "selected_product_images" | "uploaded_images" | "mixed";
  productId?: string | null;
  productIds?: string[];
  includeMainImage: boolean;
  includeAdditionalImages: boolean;
  selectedImageIds: string[];
  autoIncludeNewImages: boolean;
  currentIndex: number;
  images: StudioCarouselImage[];
  transition: {
    type: "slide" | "fade" | "none";
    durationMs: number;
    direction: "horizontal" | "vertical";
    easing: "ease" | "ease-in" | "ease-out" | "ease-in-out" | "linear";
    autoplay: boolean;
    autoplayDelayMs: number;
    loop: boolean;
    pauseOnHover: boolean;
    swipe: boolean;
  };
  navigation: {
    showArrows: boolean;
    showSingleImageArrows: boolean;
    arrowVisibility: "always" | "hover" | "hidden";
    arrowPosition: "inside" | "outside";
    arrowSize: number;
    arrowBackground: string;
    arrowColor: string;
    arrowOpacity: number;
    arrowCornerRadius: number;
    paginationType: "dots" | "numbers" | "thumbnails" | "hidden";
    paginationPosition: "inside_bottom" | "outside_bottom" | "inside_top";
    indicatorSize: number;
    indicatorSpacing: number;
    showImageCount: boolean;
  };
  display: {
    fit: "contain" | "cover" | "fill" | "custom";
    backgroundColor: string;
    padding: number;
    borderRadius: number;
    loadingPlaceholder: string;
  };
  pdf: {
    fallbackMode: "first_image" | "selected_cover" | "image_grid" | "contact_sheet";
    selectedImageId?: string | null;
    gridColumns: 2 | 3 | 4;
  };
};

export type StudioElement = {
  id: string; type: StudioElementType; name: string;
  xPercent: number; yPercent: number; widthPercent: number; heightPercent: number;
  rotation: number; opacity: number; zIndex: number; locked: boolean; visible: boolean;
  groupId?: string | null; text?: string | null; assetId?: string | null;
  productId?: string | null; categoryId?: number | null; templateId?: string | null;
  binding?: string | null; target?: string | null;
  style: Record<string, string | number | boolean | null>;
  responsive: Record<string, unknown>;
  carousel?: StudioCarouselConfig | null;
};

export type StudioPageDocument = {
  pageId: string; pageType: StudioPageType; name: string;
  navigationCategory?: string;
  promotionId?: string | null;
  promotionStatus?: string | null;
  promotionStartAt?: string | null;
  promotionEndAt?: string | null;
  canvas: { width: number; height: number; backgroundColor: string; gridSize: number; showGrid: boolean; showGuides: boolean; showSafeArea: boolean; bleed: number };
  elements: StudioElement[]; dataMode: "live" | "snapshot";
};

export type StudioPage = {
  id: string; design_id: string; page_type: StudioPageType; page_name: string;
  display_order: number; width: number; height: number; orientation: string;
  background_color: string; page_data_json: StudioPageDocument; is_visible: boolean;
  is_locked: boolean;
  created_at: string; updated_at: string;
};

export type StudioOnlineCoverData = { asset_id: string; file_name: string; width: number; height: number; url: string };

export type StudioDesign = {
  id: string; catalogue_id: string | null; name: string; status: string;
  page_width: number; page_height: number; orientation: string; size_preset: string;
  data_mode: "live" | "snapshot"; current_version: number; revision: number;
  online_cover_json?: StudioOnlineCoverData | null;
  published_online_cover_json?: StudioOnlineCoverData | null;
  catalogue_type: "standard" | "booklet" | "promotion"; brand_mode: "single" | "multiple";
  start_at: string | null; end_at: string | null; timezone: string; promotion_name: string;
  promotion_status: string | null; promotion_occasion_id: number | null; promotion_priority: number; promotion_terms: string;
  selected_brands: Array<{ id: string; brand_id: number; display_order: number; is_visible: boolean }>;
  price_slots: Array<{ id: string; slot_number: number; price_list_id: number | null; display_label: string; currency_display: string; decimal_places: number; is_visible: boolean }>;
  product_items: Array<{ id: string; product_id: string; display_order: number; is_visible: boolean; hidden_reason: string; selected_video_id: string | null }>;
  created_at: string; updated_at: string; pages: StudioPage[];
};

export type StudioDesignSummary = {
  id: string; catalogue_id: string | null; name: string; status: string;
  page_width: number; page_height: number; orientation: string; size_preset: string;
  data_mode: "live" | "snapshot"; catalogue_type: "standard" | "booklet" | "promotion";
  brand_mode: "single" | "multiple"; current_version: number; revision: number;
  created_at: string; updated_at: string; page_count: number; product_count: number;
  brand_count: number;
};

export type StudioTemplate = { id: string; template_type: string; name: string; description: string; template_data_json: Record<string, unknown>; owner_user_id:string|null; department_id:number|null; team_id:number|null; brand_scope_json:number[]; category_scope_json:number[]; visibility_scope: string; is_company_template:boolean; approval_status:string; approved_by_id:string|null; approved_at:string|null; version: number; is_active: boolean; usage_count: number; tags: string[]; created_at: string; updated_at: string };
export type StudioProductCardTemplate = {
  id: string; name: string; description: string; template_type: string;
  template_data_json: { style?: Record<string, string | number | boolean | null>; elements?: unknown[]; includedFields?: string[]; [key: string]: unknown };
  card_width: number; card_height: number; border_radius: number; dimension_unit: "px" | "mm" | "%";
  layout_mode: "responsive" | "fixed" | "freeform"; min_width: number; min_height: number;
  aspect_ratio: number | null; price_mode: "one_price" | "two_prices" | "no_price";
  visibility_scope: string; is_company_template: boolean; approval_status: string; current_version: number;
  brand_scope_json: number[]; category_scope_json: number[]; thumbnail_storage_key: string | null;
  owner_user_id: string | null; is_active: boolean; created_at: string; updated_at: string;
};
export type StudioProductCardTemplatePayload = {
  name: string; description?: string; template_type?: string; template_data: Record<string, unknown>;
  card_width: number; card_height: number; border_radius?: number; dimension_unit?: "px" | "mm" | "%";
  layout_mode?: "responsive" | "fixed" | "freeform"; min_width?: number; min_height?: number;
  aspect_ratio?: number | null; price_mode?: "one_price" | "two_prices" | "no_price";
  visibility_scope?: "only_me" | "team" | "department" | "selected_users" | "company";
  is_company_template?: boolean; brand_scope?: number[]; category_scope?: number[]; change_note?: string;
};
export type StudioProductCardTemplateVersion = { id:string;template_id:string;version_number:number;width:number;height:number;layout_mode:string;card_properties_json:Record<string,unknown>;elements_json:unknown[];change_note:string;created_by_id:string|null;created_at:string };
export type StudioAsset = { id: string; asset_type: string; original_filename: string; mime_type: string; file_size: number; width: number | null; height: number | null; alt_text: string; tags: string[]; url: string; created_at: string };
export type StudioExportJob = { id: string; design_id: string; version_id: string | null; export_type: string; status: string; options_json: Record<string, unknown>; storage_key: string | null; file_size: number | null; error_message: string | null; started_at: string | null; completed_at: string | null; created_at: string };
export type StudioVersion = { id:string;design_id:string;version_number:number;snapshot_json:StudioRenderSnapshot;change_summary:string;created_at:string };
export type StudioRenderSnapshot = {
  design: { id:string;name:string;pageWidth:number;pageHeight:number;orientation:string;sizePreset:string;dataMode:"live"|"snapshot";catalogueType:"standard"|"booklet"|"promotion";brandMode:"single"|"multiple";startAt:string|null;endAt:string|null;timezone:string;promotionName:string;promotionStatus:string|null };
  brands:Array<{brandId:number;displayOrder:number;isVisible:boolean}>;
  priceSlots:Array<{slotNumber:number;priceListId:number|null;displayLabel:string;currencyDisplay:string;decimalPlaces:number;isVisible:boolean}>;
  products:Array<{productId:string;displayOrder:number;isVisible:boolean;selectedVideoId:string|null}>;
  pages:Array<{id:string;pageType:StudioPageType;pageName:string;displayOrder:number;width:number;height:number;orientation:string;backgroundColor:string;isVisible:boolean;isLocked:boolean;pageData:StudioPageDocument}>;
  productData?:Record<string,unknown>;
};
export type StudioProductImage = { id:string; url:string; file_name:string; alt_text:string; is_primary:boolean; sort_order:number };
export type StudioErpPrice = { amount:string|null; currency:string; price_list_id:number; display_label:string };
export type StudioAvailableProduct = { id:string; sku:string; erp_name:string; display_name:string; name_en:string; name_th:string|null; description_en:string|null; description_th:string|null; how_to_use:string|null; remark:string|null; brand:string|null; category:string|null; category_names:string[]; barcode:string|null; barcodes:string[]; unit:string; pack_size:number|null; warranty:string|null; stock_quantity:number|null; price:string|null; price_currency:string; prices:Record<string,StudioErpPrice>; primary_image_url:string|null; image_urls:string[]; images:StudioProductImage[]; has_video:boolean; product_status:"active"; already_used:boolean; catalogue_visible:boolean; last_synchronized_at:string|null };
export type StudioProductPriceOption = { customer_level_id:number; customer_level_code:string; customer_level_name:string; price_list_id:number; price_list_code:string; price_list_name:string; amount:string|null; currency:string; is_custom_mapping:boolean; mapping_source?:"brand"|"default"|"system"; is_brand_override?:boolean; show_prices?:boolean };
export type StudioProductPriceOptions = { product:{ id:string; sku:string; name:string; brand:string|null }; options:StudioProductPriceOption[] };
export type StudioPricingResolution = { customer_level_id:number; customer_level_code:string; customer_level_name:string; price_list_id:number|null; price_list_code:string|null; price_list_name:string|null; erp_source_code:string|null; amount:string|null; currency:string; mapping_source:"brand"|"default"|"system"; is_brand_override:boolean; show_prices:boolean; status:"ready"|"hidden"|"missing_price"|"mapping_required"|"unavailable" };
export type StudioPricingOverview = { audiences:Array<{id:number;code:string;name:string;show_prices:boolean}>; products:Array<{id:string;sku:string;name:string;brand:string|null;options:StudioPricingResolution[]}> };

export function getStudioDesigns(query = ""): Promise<StudioDesignSummary[]> { const params = new URLSearchParams(); if (query.trim()) params.set("query", query.trim()); return catalogueRequest(`/v1/catalogue-studio/designs/summary${params.size ? `?${params}` : ""}`); }
export type StudioCreatePayload = { name: string; size_preset: string; page_width: number; page_height: number; orientation: string; data_mode: "live" | "snapshot"; catalogue_id?: string | null; start_mode?: "blank" | "system_template" | "my_template" | "upload_template"; template_id?: string | null; catalogue_type?: "standard" | "booklet" | "promotion"; brand_mode?: "single" | "multiple"; brand_ids?: number[]; price_slots?: Array<{slot_number:1|2;price_list_id:number|null;display_label:string;currency_display:"code"|"symbol"|"hidden";decimal_places:number;is_visible:boolean}>; promotion?: {promotion_name:string;occasion_id:number|null;start_at:string;end_at:string;timezone:string;priority:number;terms:string} | null };
export function createStudioDesign(payload: StudioCreatePayload): Promise<StudioDesign> { return catalogueRequest("/v1/catalogue-studio/designs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); }
export function getStudioDesign(id: string): Promise<StudioDesign> { return catalogueRequest(`/v1/catalogue-studio/designs/${id}`, { cache: "no-store" }); }
export function getStudioAvailableProducts(id:string,query=""):Promise<StudioAvailableProduct[]>{const params=new URLSearchParams();if(query.trim())params.set("q",query.trim());return catalogueRequest(`/v1/catalogue-studio/designs/${id}/products/available${params.size?`?${params}`:""}`,{cache:"no-store"});}
export function getStudioProduct(designId:string,productId:string):Promise<StudioAvailableProduct>{return catalogueRequest(`/v1/catalogue-studio/designs/${designId}/products/${productId}`,{cache:"no-store"});}
export function getStudioProductPriceOptions(designId:string,productId:string):Promise<StudioProductPriceOptions>{return catalogueRequest(`/v1/catalogue-studio/designs/${designId}/products/${productId}/price-options`);}
export function getStudioPricingOverview(designId:string):Promise<StudioPricingOverview>{return catalogueRequest(`/v1/catalogue-studio/designs/${designId}/pricing-overview`,{cache:"no-store"});}
export function uploadStudioProductImage(designId:string,productId:string,file:File,altText=""):Promise<StudioAvailableProduct>{const body=new FormData();body.append("file",file);body.append("alt_text",altText);return catalogueRequest(`/v1/catalogue-studio/designs/${designId}/products/${productId}/images`,{method:"POST",body});}
export function updateStudioDesign(id: string, payload: { name?: string; data_mode?: "live" | "snapshot"; status?: string; expected_revision: number }): Promise<StudioDesign> { return catalogueRequest(`/v1/catalogue-studio/designs/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); }
export function createStudioPage(designId: string, payload: { page_type: StudioPageType; page_name: string; width: number; height: number; orientation: string; background_color: string; page_data: StudioPageDocument; is_visible: boolean; is_locked?: boolean }): Promise<StudioPage> { return catalogueRequest(`/v1/catalogue-studio/designs/${designId}/pages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); }
export function updateStudioPage(designId: string, pageId: string, payload: { page_name?: string; page_type?: StudioPageType; background_color?: string; page_data?: StudioPageDocument; is_visible?: boolean; is_locked?: boolean; width?:number; height?:number; orientation?:string; expected_revision: number }): Promise<StudioDesign> { return catalogueRequest(`/v1/catalogue-studio/designs/${designId}/pages/${pageId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); }
export function deleteStudioPage(designId: string, pageId: string, revision: number): Promise<StudioDesign> { return catalogueRequest(`/v1/catalogue-studio/designs/${designId}/pages/${pageId}?expected_revision=${revision}`, { method: "DELETE" }); }
export function reorderStudioPages(designId: string, pageIds: string[], revision: number): Promise<StudioDesign> { return catalogueRequest(`/v1/catalogue-studio/designs/${designId}/pages/order`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page_ids: pageIds, expected_revision: revision }) }); }
export function createStudioVersion(designId: string, revision: number, changeSummary: string): Promise<StudioVersion> { return catalogueRequest(`/v1/catalogue-studio/designs/${designId}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expected_revision: revision, change_summary: changeSummary }) }); }
export function getStudioRenderSnapshot(designId:string,versionId?:string):Promise<StudioRenderSnapshot>{const params=new URLSearchParams();if(versionId)params.set("version_id",versionId);return catalogueRequest(`/v1/catalogue-studio/designs/${designId}/render-snapshot${params.size?`?${params}`:""}`,{cache:"no-store"});}
export function saveStudioOnlineCover(designId: string, file: File, revision: number): Promise<StudioDesign> {
  const data = new FormData();
  data.set("file", file);
  data.set("expected_revision", String(revision));
  return catalogueRequest(`/v1/catalogue-studio/designs/${designId}/online-cover`, { method: "POST", body: data });
}
export function removeStudioOnlineCover(designId: string, revision: number): Promise<StudioDesign> {
  return catalogueRequest(`/v1/catalogue-studio/designs/${designId}/online-cover?expected_revision=${revision}`, { method: "DELETE" });
}
export function publishStudioDesign(designId: string, revision: number): Promise<StudioDesign> { return catalogueRequest(`/v1/catalogue-studio/designs/${designId}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expected_revision: revision, change_summary: "Published from Catalogue Studio" }) }); }
export function unpublishStudioDesign(designId: string, revision: number): Promise<StudioDesign> { return catalogueRequest(`/v1/catalogue-studio/designs/${designId}/unpublish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expected_revision: revision, change_summary: "Unpublished from Catalogue Studio" }) }); }
export function getStudioTemplates(type?: string): Promise<StudioTemplate[]> { return catalogueRequest(`/v1/catalogue-studio/templates${type ? `?template_type=${encodeURIComponent(type)}` : ""}`); }
export function createStudioTemplate(payload:{template_type:"catalogue"|"cover"|"category"|"product_page"|"promotion"|"final"|"blank_layout";name:string;description:string;template_data:Record<string,unknown>;visibility_scope:"private"|"company"|"department"|"team";tags:string[]}):Promise<StudioTemplate>{return catalogueRequest("/v1/catalogue-studio/templates",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});}
export function importStudioTemplate(file:File,templateType:"catalogue"|"cover"="catalogue"):Promise<StudioTemplate>{const body=new FormData();body.append("file",file);body.append("template_type",templateType);return catalogueRequest("/v1/catalogue-studio/templates/import",{method:"POST",body});}
export function getStudioProductCardTemplates(): Promise<StudioProductCardTemplate[]> { return catalogueRequest("/v1/product-card-templates"); }
export function getStudioProductCardTemplate(id:string): Promise<StudioProductCardTemplate> { return catalogueRequest(`/v1/product-card-templates/${id}`); }
export function createStudioProductCardTemplate(payload: StudioProductCardTemplatePayload): Promise<StudioProductCardTemplate> { return catalogueRequest("/v1/product-card-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); }
export function updateStudioProductCardTemplate(id:string,payload:Partial<StudioProductCardTemplatePayload>):Promise<StudioProductCardTemplate>{return catalogueRequest(`/v1/product-card-templates/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});}
export function deleteStudioProductCardTemplate(id:string):Promise<void>{return catalogueRequest(`/v1/product-card-templates/${id}`,{method:"DELETE"});}
export function duplicateStudioProductCardTemplate(id:string):Promise<StudioProductCardTemplate>{return catalogueRequest(`/v1/product-card-templates/${id}/duplicate`,{method:"POST"});}
export function getStudioProductCardTemplateVersions(id:string):Promise<StudioProductCardTemplateVersion[]>{return catalogueRequest(`/v1/product-card-templates/${id}/versions`);}
export function restoreStudioProductCardTemplateVersion(id:string,versionId:string):Promise<StudioProductCardTemplate>{return catalogueRequest(`/v1/product-card-templates/${id}/restore/${versionId}`,{method:"POST"});}
export function getStudioAssets(type?: string): Promise<StudioAsset[]> { return catalogueRequest(`/v1/catalogue-studio/assets${type ? `?asset_type=${encodeURIComponent(type)}` : ""}`); }
export function uploadStudioAsset(file: File, assetType = "user_upload", altText = "", signal?: AbortSignal): Promise<StudioAsset> { const body = new FormData(); body.append("file", file); return catalogueRequest(`/v1/catalogue-studio/assets?asset_type=${encodeURIComponent(assetType)}&alt_text=${encodeURIComponent(altText)}`, { method: "POST", body, signal }); }
export function createStudioExport(designId: string, exportType: string, options: Record<string, unknown> = {}, versionId?:string|null): Promise<StudioExportJob> { return catalogueRequest(`/v1/catalogue-studio/designs/${designId}/exports`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ export_type: exportType, version_id:versionId||null, options }) }); }
export function getStudioExports(): Promise<StudioExportJob[]> { return catalogueRequest("/v1/catalogue-studio/exports", { cache: "no-store" }); }
export function deleteStudioExport(id: string): Promise<void> { return catalogueRequest(`/v1/catalogue-studio/exports/${id}`, { method: "DELETE" }); }
export function retryStudioExport(id: string): Promise<StudioExportJob> { return catalogueRequest(`/v1/catalogue-studio/exports/${id}/retry`, { method: "POST" }); }
export function getCatalogueStudio(catalogueId:string):Promise<StudioDesign>{return catalogueRequest(`/v1/catalogues/${catalogueId}/studio`);}
export function validateStudioDesign(designId:string):Promise<{valid:boolean;errors:string[];warnings:string[]}>{return catalogueRequest(`/v1/catalogue-studio/designs/${designId}/validate`,{method:"POST"});}
export function updateStudioConfiguration(designId:string,payload:{expected_revision:number;brand_mode:"single"|"multiple";brand_ids:number[];price_slots:Array<{slot_number:1|2;price_list_id:number|null;display_label:string;currency_display:"code"|"symbol"|"hidden";decimal_places:number;is_visible:boolean}>;promotion?:StudioCreatePayload["promotion"]}):Promise<StudioDesign>{return catalogueRequest(`/v1/catalogue-studio/designs/${designId}/configuration`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});}
export function updateStudioProducts(designId:string,payload:{expected_revision:number;products:Array<{product_id:string;is_visible:boolean;selected_video_id?:string|null}>}):Promise<StudioDesign>{return catalogueRequest(`/v1/catalogue-studio/designs/${designId}/products`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});}
export function updateStudioProductVisibility(designId:string,productId:string,payload:{expected_revision:number;is_visible:boolean}):Promise<StudioDesign>{return catalogueRequest(`/v1/catalogue-studio/designs/${designId}/products/${productId}/visibility`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});}
export function transitionStudioPromotion(designId:string,action:"submit"|"approve"|"schedule"|"pause"|"cancel",revision:number):Promise<StudioDesign>{return catalogueRequest(`/v1/catalogue-studio/designs/${designId}/promotion/${action}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({expected_revision:revision})});}
