import type { Metadata } from "next";
import { applicationBranding } from "@/lib/branding";
import { CataloguePreviewPage } from "./catalogue-preview";

export const metadata: Metadata = {
  title: `Catalogue Preview | ${applicationBranding.applicationName}`,
};

export default async function PreviewRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string; share?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const parsedVersion = Number.parseInt(query.version ?? "", 10);
  return (
    <CataloguePreviewPage
      catalogueId={id}
      version={Number.isFinite(parsedVersion) && parsedVersion > 0 ? parsedVersion : undefined}
      shareUrl={query.share}
    />
  );
}
