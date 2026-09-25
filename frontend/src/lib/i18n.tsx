"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { MANAGEMENT_THAI_TRANSLATIONS } from "./management-translations";

export type AppLanguage = "en" | "th";

const STORAGE_KEY = "gms-catalogue-language";

const THAI_TRANSLATIONS: Record<string, string> = {
  "No matching categories.": "ไม่พบหมวดหมู่ที่ตรงกัน",
  "{{count}} page": "{{count}} หน้า",
  "{{count}} pages": "{{count}} หน้า",
  "Catalogue sections": "ส่วนต่าง ๆ ของแคตตาล็อก",
  "Clear filters": "ล้างตัวกรอง",
  "Quick actions": "เมนูลัด",
  ...MANAGEMENT_THAI_TRANSLATIONS,
  "Catalogue Management": "ระบบจัดการแคตตาล็อก",
  "Catalogue Department Portal": "พอร์ทัลฝ่ายแคตตาล็อก",
  "Keep every product ready to be discovered.": "เตรียมข้อมูลทุกสินค้าให้พร้อมสำหรับการค้นพบ",
  "Manage product images and catalogue content in one secure, dependable workspace.": "จัดการรูปภาพสินค้าและเนื้อหาแคตตาล็อกในพื้นที่ทำงานเดียวที่ปลอดภัยและเชื่อถือได้",
  "Upload product images": "อัปโหลดรูปภาพสินค้า",
  "Review catalogue details": "ตรวจสอบรายละเอียดแคตตาล็อก",
  "Approve and publish": "อนุมัติและเผยแพร่",
  "Welcome back": "ยินดีต้อนรับกลับ",
  "Sign in to your account": "เข้าสู่ระบบบัญชีของคุณ",
  "Enter your staff credentials to continue.": "กรอกข้อมูลบัญชีพนักงานเพื่อดำเนินการต่อ",
  "Having trouble signing in?": "พบปัญหาในการเข้าสู่ระบบ?",
  "Contact IT Support": "ติดต่อฝ่ายสนับสนุนไอที",
  "Secure internal access": "การเข้าถึงภายในที่ปลอดภัย",
  "Username or email": "ชื่อผู้ใช้หรืออีเมล",
  "Enter your username or email": "กรอกชื่อผู้ใช้หรืออีเมล",
  Password: "รหัสผ่าน",
  "Enter your password": "กรอกรหัสผ่าน",
  "Show password": "แสดงรหัสผ่าน",
  "Hide password": "ซ่อนรหัสผ่าน",
  "Remember me": "จดจำฉัน",
  "Forgot password?": "ลืมรหัสผ่าน?",
  "Signing in...": "กำลังเข้าสู่ระบบ...",
  "Sign in": "เข้าสู่ระบบ",
  "Don't have an account?": "ยังไม่มีบัญชี?",
  "Create account": "สร้างบัญชี",
  "Join the catalogue workspace": "เข้าร่วมพื้นที่ทำงานแคตตาล็อก",
  "Create your secure staff account.": "สร้างบัญชีพนักงานที่ปลอดภัยของคุณ",
  "New accounts start as System Users. A Superadmin can grant additional catalogue permissions when required.": "บัญชีใหม่จะเริ่มต้นเป็นผู้ใช้ระบบ และ SuperAdmin สามารถกำหนดสิทธิ์แคตตาล็อกเพิ่มเติมได้ตามความเหมาะสม",
  "Create your profile": "สร้างโปรไฟล์ของคุณ",
  "Sign in securely": "เข้าสู่ระบบอย่างปลอดภัย",
  "Receive assigned access": "รับสิทธิ์ที่ได้รับมอบหมาย",
  "New staff account": "บัญชีพนักงานใหม่",
  "Create your account": "สร้างบัญชีของคุณ",
  "Enter your details to create a System User account.": "กรอกรายละเอียดเพื่อสร้างบัญชีผู้ใช้ระบบ",
  "Full name": "ชื่อ-นามสกุล",
  "Enter your full name": "กรอกชื่อ-นามสกุล",
  Username: "ชื่อผู้ใช้",
  "Choose a username": "เลือกชื่อผู้ใช้",
  "Email address": "ที่อยู่อีเมล",
  "Create a strong password": "สร้างรหัสผ่านที่รัดกุม",
  "At least 12 characters with uppercase, lowercase, number and symbol.": "อย่างน้อย 12 ตัวอักษร โดยมีตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก ตัวเลข และสัญลักษณ์",
  "Confirm password": "ยืนยันรหัสผ่าน",
  "Enter the password again": "กรอกรหัสผ่านอีกครั้ง",
  "Show password confirmation": "แสดงรหัสผ่านยืนยัน",
  "Hide password confirmation": "ซ่อนรหัสผ่านยืนยัน",
  "Creating account...": "กำลังสร้างบัญชี...",
  "Back to sign in": "กลับไปหน้าเข้าสู่ระบบ",
  "The passwords do not match.": "รหัสผ่านทั้งสองช่องไม่ตรงกัน",
  "The catalogue service is unavailable. Check your connection and try again.": "ไม่สามารถเชื่อมต่อบริการแคตตาล็อกได้ โปรดตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง",
  English: "English",
  Thai: "ไทย",
  "Choose language": "เลือกภาษา",
  Overview: "ภาพรวม",
  Products: "สินค้า",
  Categories: "หมวดหมู่",
  Catalogues: "แคตตาล็อก",
  Prices: "ราคา",
  Activity: "กิจกรรม",
  Organization: "องค์กร",
  Permissions: "สิทธิ์",
  Users: "ผู้ใช้",
  Feedback: "ข้อเสนอแนะ",
  "Signed in as": "เข้าสู่ระบบในชื่อ",
  "Catalogue Department": "ฝ่ายแคตตาล็อก",
  "Workspace overview": "ภาพรวมพื้นที่ทำงาน",
  "Product catalogue": "แคตตาล็อกสินค้า",
  "Category management": "จัดการหมวดหมู่",
  "Activity history": "ประวัติกิจกรรม",
  "Organization & access": "องค์กรและการเข้าถึง",
  "Permission grants": "การกำหนดสิทธิ์",
  "User control": "ควบคุมผู้ใช้",
  "Price management": "จัดการราคา",
  "Catalogue management": "จัดการแคตตาล็อก",
  "Demo feedback": "ข้อเสนอแนะเดโม",
  "Demo Environment": "สภาพแวดล้อมเดโม",
  "This system is currently under review. Features and workflows may change based on user feedback.": "ระบบนี้อยู่ระหว่างการทบทวน คุณสมบัติและขั้นตอนการทำงานอาจเปลี่ยนแปลงตามข้อเสนอแนะของผู้ใช้",
  "Database connected": "เชื่อมต่อฐานข้อมูลแล้ว",
  "Database unavailable": "ฐานข้อมูลไม่พร้อมใช้งาน",
  "The platform can read and write catalogue data.": "แพลตฟอร์มสามารถอ่านและบันทึกข้อมูลแคตตาล็อกได้",
  "The database connection could not be confirmed.": "ไม่สามารถยืนยันการเชื่อมต่อฐานข้อมูลได้",
  "Refresh data": "รีเฟรชข้อมูล",
  "Refreshing...": "กำลังรีเฟรช...",
  "Sign out": "ออกจากระบบ",
  Dismiss: "ปิด",
  "Preparing your catalogue workspace...": "กำลังเตรียมพื้นที่ทำงานแคตตาล็อก...",
  "Good catalogue work starts with clear product stories.": "แคตตาล็อกที่ดีเริ่มจากข้อมูลสินค้าที่ชัดเจน",
  "Welcome back, {{name}}.": "ยินดีต้อนรับกลับ {{name}}",
  "Your review queue is clear.": "ไม่มีรายการรอตรวจสอบ",
  "{{count}} product waiting for review.": "มีสินค้า {{count}} รายการรอตรวจสอบ",
  "{{count}} products waiting for review.": "มีสินค้า {{count}} รายการรอตรวจสอบ",
  "Content ready": "เนื้อหาพร้อมใช้งาน",
  "Total products": "สินค้าทั้งหมด",
  "ERP product records": "รายการสินค้าจาก ERP",
  "Active ERP products": "สินค้าที่เปิดใช้งานใน ERP",
  Published: "เผยแพร่แล้ว",
  "Visible to customers": "ลูกค้าสามารถมองเห็น",
  "In review": "อยู่ระหว่างตรวจสอบ",
  "Waiting for approval": "รอการอนุมัติ",
  "Needs media": "ต้องเพิ่มรูปภาพ",
  "Products without images": "สินค้าที่ยังไม่มีรูปภาพ",
  "Send Feedback": "ส่งข้อเสนอแนะ",
  "Help shape this demo": "ช่วยพัฒนาเดโมนี้",
  "Send feedback": "ส่งข้อเสนอแนะ",
  "Tell us what worked, what did not, or what should change.": "แจ้งสิ่งที่ใช้งานได้ สิ่งที่มีปัญหา หรือสิ่งที่ควรปรับปรุง",
  "Close feedback form": "ปิดแบบฟอร์มข้อเสนอแนะ",
  "Feedback received": "ได้รับข้อเสนอแนะแล้ว",
  "Thank you. Your feedback has been sent for review.": "ขอบคุณ ข้อเสนอแนะของคุณถูกส่งเพื่อตรวจสอบแล้ว",
  Done: "เสร็จสิ้น",
  "Module or page": "โมดูลหรือหน้า",
  "Feedback type": "ประเภทข้อเสนอแนะ",
  Priority: "ความสำคัญ",
  Title: "หัวข้อ",
  "Summarise your feedback": "สรุปข้อเสนอแนะของคุณ",
  Description: "รายละเอียด",
  "Describe what happened or what you need.": "อธิบายสิ่งที่เกิดขึ้นหรือสิ่งที่คุณต้องการ",
  "Suggested change": "การเปลี่ยนแปลงที่แนะนำ",
  Optional: "ไม่บังคับ",
  "How would you like this to work?": "คุณต้องการให้ส่วนนี้ทำงานอย่างไร?",
  Screenshot: "ภาพหน้าจอ",
  Attached: "แนบไฟล์",
  Cancel: "ยกเลิก",
  "Sending feedback...": "กำลังส่งข้อเสนอแนะ...",
  Bug: "ข้อผิดพลาด",
  Improvement: "การปรับปรุง",
  "New Feature": "คุณสมบัติใหม่",
  "UI Change": "การเปลี่ยนแปลงหน้าจอ",
  "Workflow Change": "การเปลี่ยนขั้นตอนงาน",
  "Permission Change": "การเปลี่ยนสิทธิ์",
  "Report Request": "คำขอรายงาน",
  Low: "ต่ำ",
  Medium: "ปานกลาง",
  High: "สูง",
  New: "ใหม่",
  "Under Review": "อยู่ระหว่างตรวจสอบ",
  Accepted: "ยอมรับ",
  Rejected: "ปฏิเสธ",
  Completed: "เสร็จสมบูรณ์",
  "Demo review centre": "ศูนย์ทบทวนเดโม",
  "User feedback": "ข้อเสนอแนะจากผู้ใช้",
  "Review suggestions from every department and keep decisions visible throughout the demo.": "ทบทวนข้อเสนอแนะจากทุกฝ่ายและติดตามการตัดสินใจตลอดช่วงเดโม",
  requests: "คำขอ",
  "Search title, description or submitter": "ค้นหาหัวข้อ รายละเอียด หรือผู้ส่ง",
  "All types": "ทุกประเภท",
  "All priorities": "ทุกระดับความสำคัญ",
  "All statuses": "ทุกสถานะ",
  Apply: "นำไปใช้",
  "Export CSV": "ส่งออก CSV",
  "Exporting...": "กำลังส่งออก...",
  Request: "คำขอ",
  Module: "โมดูล",
  Status: "สถานะ",
  Submitted: "วันที่ส่ง",
  "Loading feedback...": "กำลังโหลดข้อเสนอแนะ...",
  "No feedback found": "ไม่พบข้อเสนอแนะ",
  "Try clearing a filter or wait for users to send their ideas.": "ลองล้างตัวกรองหรือรอข้อเสนอแนะจากผู้ใช้",
  Previous: "ก่อนหน้า",
  Next: "ถัดไป",
  "Page {{page}} of {{pages}}": "หน้า {{page}} จาก {{pages}}",
  "Submitted by {{name}} on {{date}}": "ส่งโดย {{name}} เมื่อ {{date}}",
  "No suggested change was provided.": "ไม่มีการระบุการเปลี่ยนแปลงที่แนะนำ",
  "Open full size": "เปิดขนาดเต็ม",
  "Assigned to": "มอบหมายให้",
  Unassigned: "ยังไม่มอบหมาย",
  "Internal note": "บันทึกภายใน",
  "Add context for the review team": "เพิ่มข้อมูลสำหรับทีมตรวจสอบ",
  Close: "ปิด",
  "Save review": "บันทึกการตรวจสอบ",
  "Saving...": "กำลังบันทึก...",
  "Review progress": "ความคืบหน้าการตรวจสอบ",
  "Reviewing as {{name}}": "กำลังตรวจสอบในชื่อ {{name}}",
  "Thank you. Your feedback was submitted.": "ขอบคุณ ข้อเสนอแนะของคุณถูกส่งแล้ว",
  "Please choose a JPEG, PNG or WebP screenshot.": "โปรดเลือกภาพหน้าจอประเภท JPEG, PNG หรือ WebP",
  "The screenshot must be 8 MB or smaller.": "ภาพหน้าจอต้องมีขนาดไม่เกิน 8 MB",
  "We could not send your feedback. Try again.": "ไม่สามารถส่งข้อเสนอแนะได้ โปรดลองอีกครั้ง",
  "Close feedback details": "ปิดรายละเอียดข้อเสนอแนะ",
  "Catalogue builder": "ตัวสร้างแคตตาล็อก",
  "Complete products one step at a time": "จัดเตรียมสินค้าให้สมบูรณ์ทีละขั้นตอน",
  "Open a work queue, select a product, add its customer content and media, then submit it for publishing.": "เปิดคิวงาน เลือกสินค้า เพิ่มเนื้อหาและรูปภาพสำหรับลูกค้า แล้วส่งเพื่อเผยแพร่",
  "New product": "สินค้าใหม่",
  "Missing descriptions": "ขาดรายละเอียด",
  "Missing images": "ขาดรูปภาพ",
  "Missing categories": "ขาดหมวดหมู่",
  "Ready products": "สินค้าที่พร้อม",
  "Category product list": "รายการสินค้าตามหมวดหมู่",
  "Select a product to add images, descriptions, details, categories and publishing information.": "เลือกสินค้าเพื่อเพิ่มรูปภาพ คำอธิบาย รายละเอียด หมวดหมู่ และข้อมูลการเผยแพร่",
  "Show all products": "แสดงสินค้าทั้งหมด",
  "Search by product, SKU, brand or barcode": "ค้นหาด้วยชื่อสินค้า SKU แบรนด์ หรือบาร์โค้ด",
  "All workflow states": "ทุกสถานะขั้นตอนงาน",
  Draft: "ฉบับร่าง",
  Approved: "อนุมัติแล้ว",
  "All categories": "ทุกหมวดหมู่",
  "All completion states": "ทุกสถานะความสมบูรณ์",
  "Missing description": "ขาดคำอธิบาย",
  "Missing image": "ขาดรูปภาพ",
  "Missing category": "ขาดหมวดหมู่",
  "Ready for workflow": "พร้อมเข้าสู่ขั้นตอนงาน",
  "Apply filters": "ใช้ตัวกรอง",
  products: "สินค้า",
  "Product data and catalogue content are editable": "สามารถแก้ไขข้อมูลสินค้าและเนื้อหาแคตตาล็อกได้",
  "Select a product to complete its catalogue content": "เลือกสินค้าเพื่อจัดทำเนื้อหาแคตตาล็อกให้สมบูรณ์",
  Product: "สินค้า",
  Category: "หมวดหมู่",
  Stock: "สต็อก",
  Price: "ราคา",
  "Wholesale price": "ราคาขายส่ง",
  "Online price": "ราคาออนไลน์",
  "In Transit": "อยู่ระหว่างขนส่ง",
  Ordered: "สั่งซื้อแล้ว",
  "No products match these filters.": "ไม่มีสินค้าที่ตรงกับตัวกรองนี้",
  "Catalogue taxonomy": "โครงสร้างหมวดหมู่แคตตาล็อก",
  "Active categories": "หมวดหมู่ที่ใช้งาน",
  total: "ทั้งหมด",
  "New taxonomy term": "หมวดหมู่ใหม่",
  "Create category": "สร้างหมวดหมู่",
  "Category name": "ชื่อหมวดหมู่",
  "e.g. Frozen Foods": "เช่น อาหารแช่แข็ง",
  "Describe what belongs in this category.": "อธิบายประเภทสินค้าที่อยู่ในหมวดหมู่นี้",
  "Audit trail": "บันทึกการตรวจสอบ",
  "Recent catalogue activity": "กิจกรรมแคตตาล็อกล่าสุด",
  events: "เหตุการณ์",
  "Catalogue activity will appear here.": "กิจกรรมแคตตาล็อกจะแสดงที่นี่",
  "Catalogue administrator": "ผู้ดูแลแคตตาล็อก",
  "Add a new product": "เพิ่มสินค้าใหม่",
  "Create the product record, then add images and publishing details.": "สร้างรายการสินค้า แล้วเพิ่มรูปภาพและรายละเอียดการเผยแพร่",
  "Close new product form": "ปิดแบบฟอร์มสินค้าใหม่",
  "Product identity": "ข้อมูลระบุตัวสินค้า",
  "Source information": "ข้อมูลต้นทาง",
  "Required fields are marked *": "ช่องที่จำเป็นมีเครื่องหมาย *",
  "Product name": "ชื่อสินค้า",
  "Customer-facing product name": "ชื่อสินค้าที่แสดงต่อลูกค้า",
  Brand: "แบรนด์",
  Barcode: "บาร์โค้ด",
  Unit: "หน่วย",
  "ERP category": "หมวดหมู่ ERP",
  "Price (THB)": "ราคา (บาท)",
  Quantity: "จำนวน",
  "Product media": "สื่อสินค้า",
  "Main product image": "รูปภาพสินค้าหลัก",
  "No image selected": "ยังไม่ได้เลือกรูปภาพ",
  "The first image becomes the primary image.": "รูปภาพแรกจะถูกกำหนดเป็นรูปภาพหลัก",
  "Select product image": "เลือกรูปภาพสินค้า",
  "Image description": "คำอธิบายรูปภาพ",
  "Describe the product image": "อธิบายรูปภาพสินค้า",
  "Used as accessible alt text in the catalogue.": "ใช้เป็นข้อความอธิบายรูปภาพเพื่อการเข้าถึงในแคตตาล็อก",
  "Catalogue copy": "เนื้อหาแคตตาล็อก",
  Descriptions: "คำอธิบาย",
  "Short description": "คำอธิบายสั้น",
  "A concise summary for product lists.": "ข้อความสรุปสั้นสำหรับรายการสินค้า",
  "Long description": "คำอธิบายแบบละเอียด",
  "Detailed product information for the catalogue.": "ข้อมูลสินค้าแบบละเอียดสำหรับแคตตาล็อก",
  Organisation: "องค์กร",
  "Select all that apply": "เลือกได้มากกว่าหนึ่งรายการ",
  "Creating product...": "กำลังสร้างสินค้า...",
  "Create product": "สร้างสินค้า",
  "Back to catalogues": "กลับไปยังแคตตาล็อก",
  "LIVE PREVIEW": "ตัวอย่างแคตตาล็อก",
  "Draft Preview": "ตัวอย่างฉบับร่าง",
  "Current draft": "ฉบับร่างปัจจุบัน",
  Version: "เวอร์ชัน",
  "No Price": "ไม่แสดงราคา",
  "Close preview": "ปิดตัวอย่าง",
  "CURATED PRODUCT COLLECTION": "คอลเลกชันสินค้าที่คัดสรร",
  Audience: "กลุ่มเป้าหมาย",
  "Price policy": "นโยบายราคา",
  "Prices not included": "ไม่รวมราคา",
  Edition: "ฉบับ",
  "Catalogue products": "สินค้าในแคตตาล็อก",
  "This catalogue does not contain any products.": "แคตตาล็อกนี้ยังไม่มีสินค้า",
  "Return to the catalogue builder to add and order products.": "กลับไปยังตัวสร้างแคตตาล็อกเพื่อเพิ่มและจัดลำดับสินค้า",
  Generated: "สร้างเมื่อ",
  "Published version": "เวอร์ชันที่เผยแพร่",
  "Draft preview — not for external distribution": "ตัวอย่างฉบับร่าง — ไม่ใช่สำหรับเผยแพร่ภายนอก",
  "Products in this catalogue": "สินค้าในแคตตาล็อกนี้",
  "Permitted prices included": "รวมราคาที่ได้รับอนุญาต",
  "Prices are not included": "ไม่รวมราคา",
  "Generating PDF...": "กำลังสร้าง PDF...",
  "Download PDF": "ดาวน์โหลด PDF",
  Preparing: "กำลังเตรียม",
  "Preparing...": "กำลังเตรียม...",
  Print: "พิมพ์",
  "Full Screen": "เต็มหน้าจอ",
  "Exit Full Screen": "ออกจากเต็มหน้าจอ",
  "Close Preview": "ปิดตัวอย่าง",
  "PDF downloaded successfully.": "ดาวน์โหลด PDF สำเร็จ",
  "The PDF could not be generated. Please try again.": "ไม่สามารถสร้าง PDF ได้ โปรดลองอีกครั้ง",
  "The catalogue could not be prepared for printing.": "ไม่สามารถเตรียมแคตตาล็อกสำหรับการพิมพ์ได้",
  "Full-screen view is not available in this browser.": "เบราว์เซอร์นี้ไม่รองรับมุมมองเต็มหน้าจอ",
};

type TranslationVariables = Record<string, string | number>;

type LanguageContextValue = {
  language: AppLanguage;
  locale: string;
  setLanguage: (language: AppLanguage) => void;
  t: (key: string, variables?: TranslationVariables) => string;
};

const LanguageContext = createContext<LanguageContextValue>({
  language: "en",
  locale: "en-GB",
  setLanguage: () => undefined,
  t: (key, variables) => interpolate(key, variables),
});

function interpolate(value: string, variables?: TranslationVariables) {
  if (!variables) return value;
  return Object.entries(variables).reduce(
    (result, [key, replacement]) =>
      result.replaceAll(`{{${key}}}`, String(replacement)),
    value,
  );
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>("en");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "en" || saved === "th") setLanguageState(saved);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const setLanguage = useCallback((nextLanguage: AppLanguage) => {
    setLanguageState(nextLanguage);
    window.localStorage.setItem(STORAGE_KEY, nextLanguage);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      locale: language === "th" ? "th-TH" : "en-GB",
      setLanguage,
      t: (key, variables) =>
        interpolate(
          language === "th" ? THAI_TRANSLATIONS[key] ?? key : key,
          variables,
        ),
    }),
    [language, setLanguage],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function T({
  children,
  variables,
}: {
  children: string;
  variables?: TranslationVariables;
}) {
  const { t } = useLanguage();
  return <>{t(children, variables)}</>;
}

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { language, setLanguage, t } = useLanguage();
  return (
    <div
      className={`languageSwitcher ${className}`.trim()}
      role="group"
      aria-label={t("Choose language")}
    >
      <button
        type="button"
        data-active={language === "en"}
        aria-pressed={language === "en"}
        onClick={() => setLanguage("en")}
      >
        EN
      </button>
      <button
        type="button"
        data-active={language === "th"}
        aria-pressed={language === "th"}
        onClick={() => setLanguage("th")}
      >
        ไทย
      </button>
    </div>
  );
}
