import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { LanguageProvider, LanguageSwitcher, T, useLanguage } from "./i18n";

function ManagementCopy() {
  const { t } = useLanguage();
  return (
    <>
      <LanguageSwitcher />
      <h1><T>Catalogue setup</T></h1>
      <button type="button"><T>Save connection</T></button>
      <span>{t("Add product video")}</span>
      <span>{t("Promotion calendar")}</span>
      <span>{t("No products found")}</span>
      <span>{t("Loading {{entity}}…", { entity: t("Departments") })}</span>
      <input aria-label="search" placeholder={t("Search catalogues")} />
    </>
  );
}

function BilingualManagementSample() {
  return <LanguageProvider><ManagementCopy /></LanguageProvider>;
}

describe("English and Thai platform localization", () => {
  beforeEach(() => {
    window.localStorage.removeItem("gms-catalogue-language");
    document.documentElement.lang = "en";
  });

  it("switches management copy to Thai, persists it, and returns to English", () => {
    render(<BilingualManagementSample />);
    expect(screen.getByRole("heading", { name: "Catalogue setup" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ไทย" }));
    expect(screen.getByRole("heading", { name: "ตั้งค่าแคตตาล็อก" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "บันทึกการเชื่อมต่อ" })).toBeInTheDocument();
    expect(screen.getByText("เพิ่มวิดีโอสินค้า")).toBeInTheDocument();
    expect(screen.getByText("ปฏิทินโปรโมชั่น")).toBeInTheDocument();
    expect(screen.getByText("ไม่พบสินค้า")).toBeInTheDocument();
    expect(screen.getByText("กำลังโหลดแผนก…")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("ค้นหาแคตตาล็อก")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("th");
    expect(window.localStorage.getItem("gms-catalogue-language")).toBe("th");

    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByRole("heading", { name: "Catalogue setup" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
  });
});
