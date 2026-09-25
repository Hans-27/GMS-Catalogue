"use client";

import { useLanguage } from "./i18n";

const en = {
  products: "Products", cover: "Cover", elements: "Elements", cards: "Card layouts",
  media: "Uploads", pages: "Pages", prices: "Prices", fields: "Product data fields", layers: "Layers",
  more: "More tools", navigation: "Studio tools", collapse: "Collapse tool panel", expand: "Expand tool panel",
  dismiss: "Dismiss tool panel", clear: "Clear search", searchLayouts: "Search card layouts",
  searchUploads: "Search uploads", noLayouts: "No card layouts match your search.",
  noUploads: "No uploads match your search.", emptyUploads: "No uploads yet. Upload an image or video to get started.",
  manageMedia: "Upload or manage media", imageUnavailable: "Image preview unavailable", video: "Video", file: "File",
  productsHelp: "Choose ERP products for this page.", coverHelp: "Upload your finished online cover.",
  elementsHelp: "Add text, images, shapes and tables.", cardsHelp: "Choose a reusable product card layout.",
  mediaHelp: "Add your uploaded images and videos.", pagesHelp: "Manage pages and optional promotions.",
  pricesHelp: "Add an authorized ERP price.", fieldsHelp: "Insert synchronized product information.",
  layersHelp: "Arrange and lock page elements.", moreHelp: "Choose an advanced editing tool.",
};

type SidebarCopy = { [Key in keyof typeof en]: string };
const th: SidebarCopy = {
  products: "สินค้า", cover: "หน้าปก", elements: "องค์ประกอบ", cards: "รูปแบบการ์ด",
  media: "ไฟล์อัปโหลด", pages: "หน้า", prices: "ราคา", fields: "ข้อมูลสินค้า", layers: "เลเยอร์",
  more: "เครื่องมือเพิ่มเติม", navigation: "เครื่องมือสตูดิโอ", collapse: "ยุบแผงเครื่องมือ", expand: "ขยายแผงเครื่องมือ",
  dismiss: "ปิดแผงเครื่องมือ", clear: "ล้างการค้นหา", searchLayouts: "ค้นหารูปแบบการ์ด",
  searchUploads: "ค้นหาไฟล์อัปโหลด", noLayouts: "ไม่พบรูปแบบการ์ดที่ตรงกับการค้นหา",
  noUploads: "ไม่พบไฟล์อัปโหลดที่ตรงกับการค้นหา", emptyUploads: "ยังไม่มีไฟล์อัปโหลด เริ่มต้นด้วยการอัปโหลดรูปภาพหรือวิดีโอ",
  manageMedia: "อัปโหลดหรือจัดการไฟล์", imageUnavailable: "ไม่สามารถแสดงตัวอย่างรูปภาพได้", video: "วิดีโอ", file: "ไฟล์",
  productsHelp: "เลือกสินค้า ERP สำหรับหน้านี้", coverHelp: "อัปโหลดภาพหน้าปกออนไลน์ที่ออกแบบเสร็จแล้ว",
  elementsHelp: "เพิ่มข้อความ รูปภาพ รูปร่าง และตาราง", cardsHelp: "เลือกรูปแบบการ์ดสินค้าที่ใช้ซ้ำได้",
  mediaHelp: "เพิ่มรูปภาพและวิดีโอที่อัปโหลดไว้", pagesHelp: "จัดการหน้าและโปรโมชั่นที่เลือก",
  pricesHelp: "เพิ่มราคา ERP ที่ได้รับอนุญาต", fieldsHelp: "แทรกข้อมูลสินค้าที่ซิงค์แล้ว",
  layersHelp: "จัดเรียงและล็อกองค์ประกอบในหน้า", moreHelp: "เลือกเครื่องมือแก้ไขขั้นสูง",
};

export function useStudioSidebarCopy(): SidebarCopy {
  return useLanguage().language === "th" ? th : en;
}
