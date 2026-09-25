"use client";

import type { StudioElement } from "@/lib/studio-api";
import { buildStudioQrValue, STUDIO_QR_CONTENT_TYPES, studioQrContentType } from "./studio-qr-code";
import styles from "./studio.module.css";

type Props = {
  element: StudioElement;
  onChange: (changes: Partial<StudioElement>, style: StudioElement["style"]) => void;
};

export function StudioQrProperties({ element, onChange }: Props) {
  const qrType = studioQrContentType(element.style.qrContentType);
  const patch = (changes: StudioElement["style"]) => {
    const nextStyle = { ...element.style, ...changes };
    onChange({ target: buildStudioQrValue(nextStyle, element.target || "") }, changes);
  };
  const value = String(element.style.qrValue ?? (qrType === "url" || qrType === "text" ? element.target || "" : ""));

  return <section className={styles.cardProperties}>
    <div><strong>QR code generator</strong><small>Add your own website, text, phone, email, or Wi-Fi information. The scannable code is saved with this catalogue.</small></div>
    <label>Information type<select value={qrType} onChange={(event) => patch({ qrContentType: event.target.value, qrValue: "", qrPhone: "", qrEmail: "", qrEmailSubject: "", qrEmailBody: "", qrWifiSsid: "", qrWifiPassword: "" })}>{STUDIO_QR_CONTENT_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    {(qrType === "url" || qrType === "text") && <label>{qrType === "url" ? "Website URL" : "Text to encode"}<textarea rows={4} placeholder={qrType === "url" ? "https://www.example.com/catalogue" : "Enter the information for this QR code"} value={value} onChange={(event) => patch({ qrValue: event.target.value })} /></label>}
    {qrType === "phone" && <label>Phone number<input type="tel" placeholder="+66 81 234 5678" value={String(element.style.qrPhone || "")} onChange={(event) => patch({ qrPhone: event.target.value })} /></label>}
    {qrType === "email" && <>
      <label>Email address<input type="email" placeholder="sales@example.com" value={String(element.style.qrEmail || "")} onChange={(event) => patch({ qrEmail: event.target.value })} /></label>
      <label>Subject (optional)<input value={String(element.style.qrEmailSubject || "")} onChange={(event) => patch({ qrEmailSubject: event.target.value })} /></label>
      <label>Message (optional)<textarea rows={3} value={String(element.style.qrEmailBody || "")} onChange={(event) => patch({ qrEmailBody: event.target.value })} /></label>
    </>}
    {qrType === "wifi" && <>
      <label>Network name (SSID)<input value={String(element.style.qrWifiSsid || "")} onChange={(event) => patch({ qrWifiSsid: event.target.value })} /></label>
      <label>Security<select value={String(element.style.qrWifiSecurity || "WPA")} onChange={(event) => patch({ qrWifiSecurity: event.target.value })}><option value="WPA">WPA / WPA2 / WPA3</option><option value="WEP">WEP</option><option value="nopass">No password</option></select></label>
      {element.style.qrWifiSecurity !== "nopass" && <label>Password<input type="text" value={String(element.style.qrWifiPassword || "")} onChange={(event) => patch({ qrWifiPassword: event.target.value })} /></label>}
      <label className={styles.erpBindingToggle}><input type="checkbox" checked={element.style.qrWifiHidden === true} onChange={(event) => patch({ qrWifiHidden: event.target.checked })} /> Hidden network</label>
    </>}
    <div className={styles.propertyGrid}>
      <label>QR colour<input type="color" value={String(element.style.qrForeground || "#111111")} onChange={(event) => patch({ qrForeground: event.target.value })} /></label>
      <label>Background<input type="color" value={String(element.style.qrBackground || "#FFFFFF")} onChange={(event) => patch({ qrBackground: event.target.value })} /></label>
    </div>
    <div className={styles.propertyGrid}>
      <label>Error correction<select value={String(element.style.qrErrorCorrection || "M")} onChange={(event) => patch({ qrErrorCorrection: event.target.value })}><option value="L">Low</option><option value="M">Medium</option><option value="Q">High</option><option value="H">Maximum</option></select></label>
      <label>Quiet margin<input type="number" min={0} max={8} value={Number(element.style.qrMargin ?? 4)} onChange={(event) => patch({ qrMargin: Math.max(0, Math.min(8, Number(event.target.value))) })} /></label>
    </div>
    <label className={styles.erpBindingToggle}><input type="checkbox" checked={element.style.qrShowLabel === true} onChange={(event) => patch({ qrShowLabel: event.target.checked })} /> Show a caption below the QR code</label>
    {element.style.qrShowLabel === true && <label>Caption<input placeholder="Scan for more information" value={String(element.style.qrLabel || "")} onChange={(event) => patch({ qrLabel: event.target.value })} /></label>}
    <label>Encoded information<textarea rows={3} readOnly value={element.target || ""} placeholder="Enter information above to generate the QR code" /></label>
  </section>;
}
