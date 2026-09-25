"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { StudioAsset } from "@/lib/studio-api";
import { useStudioSidebarCopy } from "@/lib/studio-sidebar-copy";
import { StudioLibrarySearch } from "./studio-tool-sidebar";
import styles from "./studio-tool-sidebar.module.css";

function MediaItem({ asset, onAdd }: { asset: StudioAsset; onAdd: (asset: StudioAsset) => void }) {
  const copy = useStudioSidebarCopy();
  const [failed, setFailed] = useState(false);
  const isImage = asset.mime_type.startsWith("image/");
  return <button type="button" className={styles.mediaItem} draggable onDragStart={(event) => event.dataTransfer.setData("studio-asset", JSON.stringify(asset))} onClick={() => onAdd(asset)}>
    <span className={styles.mediaPreview}>
      {isImage && !failed ? <Image src={`/api/catalogue-studio/asset-content?assetId=${encodeURIComponent(asset.id)}`} alt={asset.alt_text || asset.original_filename} width={asset.width || 200} height={asset.height || 200} unoptimized onError={() => setFailed(true)} /> : <span>{isImage ? copy.imageUnavailable : asset.mime_type.startsWith("video/") ? copy.video : copy.file}</span>}
    </span>
    <strong>{asset.original_filename}</strong><small>{Math.round(asset.file_size / 1024)} KB</small>
  </button>;
}

export function StudioMediaLibrary({ assets, onAdd }: { assets: StudioAsset[]; onAdd: (asset: StudioAsset) => void }) {
  const copy = useStudioSidebarCopy();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const matches = assets.filter((asset) => `${asset.original_filename} ${asset.alt_text}`.toLocaleLowerCase().includes(needle));
  return <div className={styles.mediaLibrary}>
    <StudioLibrarySearch label={copy.searchUploads} value={query} onChange={setQuery} />
    <Link className={styles.mediaLink} href="/catalogue-studio/media">{copy.manageMedia}</Link>
    {assets.length === 0 ? <p className={styles.empty}>{copy.emptyUploads}</p> : matches.length === 0 ? <p className={styles.empty} role="status">{copy.noUploads}</p> : <div className={styles.mediaGrid}>{matches.map((asset) => <MediaItem key={asset.id} asset={asset} onAdd={onAdd} />)}</div>}
  </div>;
}
