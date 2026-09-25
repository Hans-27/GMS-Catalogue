import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deletePromotion, getPromotions } from "@/lib/api";
import { PromotionWorkspace } from "./promotion-workspace";

const mockRouter = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => window.location.pathname, useRouter: () => mockRouter }));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  const promotion = { id:"promo-1",code:"PROMO-2027-00001",name_en:"New Year Savings",name_th:"",short_title:"Save now",description_en:"",description_th:"",occasion_id:1,occasion_name:"New Year",promotion_type:"percentage",status:"draft",priority:50,allow_stacking:false,base_price_change_behavior:"require_reapproval",owner_user_id:"user-1",department_id:null,team_id:null,start_at:"2027-01-01T00:00:00Z",end_at:"2027-01-31T00:00:00Z",timezone:"Asia/Bangkok",publish_at:null,automatic_activation:true,automatic_expiration:true,repeat_annually:false,expiration_warning_days:7,show_stock:true,hide_out_of_stock:false,minimum_stock:0,stop_product_at_zero_stock:false,terms_en:"",terms_th:"",internal_note:"",is_active:true,published_at:null,approved_at:null,rejection_reason:null,created_by_id:"user-1",updated_by_id:"user-1",created_at:"2026-08-05T00:00:00Z",updated_at:"2026-08-05T00:00:00Z",brands:[{brand_id:1,brand_name:"Hana",brand_code:"HANA",include_all_active_products:false,active_product_count:1,selected_product_count:1}],products:[{id:"row-1",product_id:"product-1",product_code:"HANA-001",product_name:"Hana Speaker",image_url:"/uploads/promotion-product.webp",brand:"Hana",category:"Audio",stock:12,product_status:"active",audience_type_id:1,price_list_id:1,price_list_name:"Normal",promotion_type:"percentage",base_price:"1000",approved_base_price:null,discount_percent:"10",discount_amount:"100",promotion_price:"900",currency:"THB",include_in_promotion:true,warning:null}],audiences:[{audience_type_id:1,audience_code:"normal",audience_name:"Normal",price_list_id:1,price_list_name:"Normal",show_prices:true}],catalogue_ids:[],media:[],cover_url:"/uploads/promotion-cover.webp",conflicts:[] };
  return { ...actual,
    getCurrentUser: vi.fn().mockResolvedValue({id:"user-1",username:"SuperAdmin",email:"admin@example.com",full_name:"Super Administrator",roles:["superadmin"],permissions:[],is_superadmin:true}),
    getPromotions: vi.fn().mockResolvedValue({items:[promotion],total:1,page:1,page_size:20,pages:1,summary:{draft:1,scheduled:0,active:0,expiring_soon:0,expired:0}}),
    getPromotion: vi.fn().mockResolvedValue(promotion),
    deletePromotion: vi.fn().mockResolvedValue(undefined),
    getPromotionLinks: vi.fn().mockResolvedValue([]),
    getPromotionMetadata: vi.fn().mockResolvedValue({brands:[{id:1,code:"HANA",name:"Hana"}],products:[],product_total:0,product_page:1,product_pages:1,audiences:[{id:1,code:"normal",name:"Normal",price_list_id:1,show_prices:true}],price_lists:[{id:1,code:"NORMAL",name:"Normal",currency:"THB",is_no_price:false}],catalogues:[{id:"catalogue-1",title:"AIGO Catalogue",status:"draft"}],occasions:[{id:1,code:"NEW_YEAR",name_en:"New Year",name_th:"ปีใหม่",description:"",icon_key:"calendar",default_banner_style:"default",recurring_annually:true,default_start_month:1,default_start_day:1,default_end_month:1,default_end_day:31,display_order:1,is_active:true,created_at:"",updated_at:""}],departments:[],teams:[],users:[]}),
  };
});

describe("Promotion Management", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
    mockRouter.replace.mockClear();
  });
  it("opens an accessible mobile navigation drawer and restores the page on Escape", async () => {
    // Removing the mobile drawer state would make Promotions navigation unavailable on phones.
    render(<PromotionWorkspace mode="list" />);
    await screen.findByText("New Year Savings");
    const opener = screen.getByLabelText("Open promotion navigation");
    fireEvent.click(opener);
    expect(screen.getByRole("navigation", { name: "Promotion navigation" }).closest("aside")).toHaveAttribute("data-open", "true");
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.body.style.overflow).toBe("");
    await waitFor(() => expect(opener).toHaveFocus());
  });
  it("confirms and deletes an unpublished promotion from the actions menu", async () => {
    // A missing menu action, skipped confirmation, or missing list refresh must fail this test.
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const deleteRequest = vi.mocked(deletePromotion);
    deleteRequest.mockClear();
    const currentPage = await getPromotions({});
    render(<PromotionWorkspace mode="list" />);
    expect(await screen.findByText("New Year Savings")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Promotion actions"));
    const deleteButton = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(deleteButton);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("New Year Savings"));
    expect(deleteRequest).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    vi.mocked(getPromotions).mockResolvedValueOnce({ ...currentPage, items: [], total: 0 });
    fireEvent.click(deleteButton);
    await waitFor(() => expect(deleteRequest).toHaveBeenCalledWith("promo-1"));
    expect(await screen.findByText("No promotions match these filters.")).toBeInTheDocument();
    confirm.mockRestore();
  });

  it("does not offer deletion for an active promotion", async () => {
    // Showing Delete here would invite an API action the server explicitly forbids.
    const currentPage = await getPromotions({});
    vi.mocked(getPromotions).mockResolvedValueOnce({
      ...currentPage,
      items: [{ ...currentPage.items[0], status: "active" }],
    });
    render(<PromotionWorkspace mode="list" />);
    expect(await screen.findByText("New Year Savings")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Promotion actions"));
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("offers Delete for a cancelled promotion", async () => {
    // A cancelled promotion is no longer live, so hiding Delete blocks cleanup.
    const currentPage = await getPromotions({});
    vi.mocked(getPromotions).mockResolvedValueOnce({
      ...currentPage,
      items: [{ ...currentPage.items[0], status: "cancelled" }],
    });
    render(<PromotionWorkspace mode="list" />);
    expect(await screen.findByText("New Year Savings")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Promotion actions"));
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("returns to promotions after deleting from the detail page", async () => {
    // Deleting the open record must not leave the user on a now-missing detail URL.
    window.history.replaceState({}, "", "/promotions/promo-1");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<PromotionWorkspace mode="detail" id="promo-1" />);
    expect((await screen.findAllByRole("heading", { name: "New Year Savings" })).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByLabelText("Promotion actions"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/promotions"));
    confirm.mockRestore();
  });
  it("shows permission-aware navigation, summary and Add Promotion", async () => {
    render(<PromotionWorkspace mode="list"/>);
    expect(await screen.findByRole("heading", {name:"Promotions"})).toBeInTheDocument();
    expect(screen.queryByRole("link", {name:"Dashboard"})).not.toBeInTheDocument();
    expect(screen.getByRole("link", {name:/Add Promotion/i})).toHaveAttribute("href", "/promotions/new");
    expect(await screen.findByText("New Year Savings")).toBeInTheDocument();
    expect(screen.getByRole("img", {name:"New Year Savings promotion cover"})).toHaveAttribute("src", expect.stringContaining("/uploads/promotion-cover.webp"));
    expect(screen.queryByRole("button", {name:/Pending approval/i})).not.toBeInTheDocument();
    const draft = screen.getByRole("button", {name:/Draft/i});
    const all = screen.getByRole("button", {name:/All promotions/i});
    expect(all).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(draft);
    expect(draft).toHaveAttribute("aria-pressed", "true");
    expect(all).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByLabelText("Promotion actions"));
    expect(screen.getByRole("button", {name:"Publish"})).toBeInTheDocument();
    expect(screen.queryByRole("button", {name:/Submit for approval/i})).not.toBeInTheDocument();
  });

  it("opens a validated four-step promotion builder with simple defaults", async () => {
    window.history.replaceState({}, "", "/promotions/new?catalogueId=catalogue-1");
    render(<PromotionWorkspace mode="builder"/>);
    expect(await screen.findByRole("heading", {name:"Create promotion"})).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", {name:/Products & offer/i})).toBeInTheDocument());
    expect(screen.getAllByRole("button", {name:/step|started|complete/i})).toHaveLength(4);
    expect(screen.queryByRole("button", {name:"Save draft"})).not.toBeInTheDocument();
    expect(screen.getByText("Promotion schedule")).toBeInTheDocument();
    const timezone = screen.getByRole("combobox", {name:"Timezone"});
    expect(timezone).toHaveValue("Asia/Bangkok");
    expect(screen.getByRole("option", {name:"Asia/Bangkok"})).toHaveValue("Asia/Bangkok");
    expect(screen.getByRole("option", {name:"UTC"})).toHaveValue("UTC");

    fireEvent.click(screen.getByRole("button", {name:/Continue/i}));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a promotion name.");
    fireEvent.change(screen.getByRole("textbox", {name:/Name in English/i}), {target:{value:"September Sale"}});
    fireEvent.click(screen.getByRole("button", {name:/Continue/i}));
    expect(await screen.findByText("Select brands")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", {name:/Hana/i}));
    expect(screen.getByRole("checkbox", {name:/Include all active products/i})).toBeChecked();
    fireEvent.click(screen.getByRole("button", {name:/Continue/i}));
    expect(await screen.findByText("Catalogue placement")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", {name:/AIGO Catalogue/i})).toBeChecked();
  });

  it("switches the promotion preview between desktop, tablet and mobile", async () => {
    render(<PromotionWorkspace mode="detail" id="promo-1"/>);
    const desktop = await screen.findByRole("button", {name:"Desktop"});
    const tablet = screen.getByRole("button", {name:"Tablet"});
    const mobile = screen.getByRole("button", {name:"Mobile"});

    expect(desktop).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(tablet);
    expect(tablet).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(mobile);
    expect(mobile).toHaveAttribute("aria-pressed", "true");
    const cover = screen.getByRole("region", {name:"New Year Savings promotion cover"});
    expect(cover.style.backgroundImage).toContain("/uploads/promotion-cover.webp");
    expect(screen.getByRole("img", {name:"Hana Speaker product"})).toHaveAttribute(
      "src",
      expect.stringContaining("/uploads/promotion-product.webp"),
    );
  });

  it("shows a proper month calendar and lets users change the month and year", async () => {
    // A static 42-cell grid without a visible period or navigation cannot be used to plan future promotions.
    render(<PromotionWorkspace mode="calendar" />);

    const today = new Date();
    const initialLabel = new Intl.DateTimeFormat("en", {
      month: "long",
      year: "numeric",
    }).format(today);
    expect(await screen.findByRole("heading", { name: initialLabel })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    expect(screen.getByRole("heading", {
      name: new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(nextMonth),
    })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Month" }), { target: { value: "8" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Year" }), { target: { value: String(today.getFullYear() + 1) } });
    expect(screen.getByRole("heading", { name: `September ${today.getFullYear() + 1}` })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByRole("heading", { name: initialLabel })).toBeInTheDocument();
  });
});
