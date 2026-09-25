"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { API_ORIGIN } from "@/lib/api";
import type { StudioOnlineCoverData } from "@/lib/studio-api";
import styles from "./studio-online-cover.module.css";

type Props = {
  cover: StudioOnlineCoverData | null;
  canEdit: boolean;
  disabled?: boolean;
  onSave: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
};

export function StudioOnlineCover({ cover, canEdit, disabled = false, onSave, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const locked = !canEdit || busy || disabled;
  const savedUrl = cover ? /^https?:\/\//.test(cover.url) ? cover.url : `${API_ORIGIN}${cover.url}` : null;
  const source = preview || savedUrl;
  const imageFailed = Boolean(source && failedUrl === source);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function chooseFile(chosen: File | undefined) {
    if (!chosen || locked) return;
    setError(""); setStatus(""); setConfirmRemove(false);
    if (!(["image/png", "image/jpeg", "image/webp"].includes(chosen.type)) || !/\.(png|jpe?g|webp)$/i.test(chosen.name)) {
      setError("Choose a PNG, JPG or WebP cover image."); return;
    }
    if (chosen.size > 20 * 1024 * 1024) { setError("Cover image must be 20 MB or smaller."); return; }
    setFile(chosen); setFailedUrl(null); setPreview(URL.createObjectURL(chosen));
  }

  async function save() {
    if (!file || locked || imageFailed) return;
    setBusy(true); setError(""); setStatus("");
    try {
      await onSave(file);
      setFile(null); setPreview(null);
      setStatus("Cover saved. Publish to update the online catalogue.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save cover. Try again."); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (locked) return;
    setBusy(true); setError(""); setStatus("");
    try {
      await onRemove(); setFile(null); setPreview(null); setConfirmRemove(false);
      setStatus("Cover removed. Publish to use the generated cover in the online catalogue.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not remove cover. Try again."); }
    finally { setBusy(false); }
  }

  return <section className={styles.panel} aria-label="Online catalogue cover" aria-busy={busy}>
    <header><h1>Cover page</h1><p>Upload your finished cover image for the online catalogue.</p></header>
    <p className={styles.publishNote}>Save cover, then Publish to update customer links. PDF and print pages stay unchanged.</p>
    <div className={styles.preview} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); chooseFile(event.dataTransfer.files[0]); }}>
      {source && !imageFailed ? <img src={source} alt="Online cover preview" onError={() => { setFailedUrl(source); if (file) setError("This image could not be previewed. Choose another image."); }} /> : <div className={styles.empty}><strong>{imageFailed ? "Cover preview unavailable" : "No cover image yet"}</strong><p>{imageFailed ? "Choose another image, or remove this cover to use the generated cover." : "The online catalogue uses its generated cover until you upload and publish an image."}</p></div>}
    </div>
    {(file || cover) && <p className={styles.fileDetails}>{file?.name || cover?.file_name}{!file && cover && ` · ${cover.width} × ${cover.height} px`}{file && " · Not saved yet"}</p>}
    <label className={styles.fileLabel}>Choose cover image<input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" disabled={locked} onChange={(event) => { chooseFile(event.target.files?.[0]); event.target.value = ""; }} /></label>
    <p className={styles.helper}>PNG, JPG or WebP · Maximum 20 MB · Image proportions are preserved.</p>
    {!canEdit && <p>You need catalogue edit permission to change the cover.</p>}
    {canEdit && <div className={styles.actions}>
      <button type="button" className={styles.primary} disabled={locked || !file || imageFailed} onClick={() => void save()}>{busy && file ? "Saving cover…" : "Save cover"}</button>
      {(file || cover) && <button type="button" disabled={locked} onClick={() => inputRef.current?.click()}>Replace image</button>}
      {cover && <button type="button" disabled={locked} onClick={() => setConfirmRemove(true)}>Remove cover</button>}
    </div>}
    {confirmRemove && <div className={styles.confirm} role="group" aria-label="Confirm cover removal"><p>Remove this draft cover? Customer links change only after Publish.</p><button type="button" disabled={locked} onClick={() => void remove()}>{busy ? "Removing cover…" : "Confirm removal"}</button><button type="button" disabled={locked} onClick={() => setConfirmRemove(false)}>Keep cover</button></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {status && <p className={styles.success} role="status">{status}</p>}
  </section>;
}
