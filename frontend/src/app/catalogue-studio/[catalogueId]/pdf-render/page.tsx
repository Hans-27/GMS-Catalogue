import { PdfRenderDocument } from "../../pdf-render-document";

export default async function StudioPdfRenderRoute({
  params,
  searchParams,
}: {
  params: Promise<{ catalogueId: string }>;
  searchParams: Promise<{ versionId?: string; pageId?: string; publicToken?: string }>;
}) {
  const { catalogueId } = await params;
  const { versionId, pageId, publicToken } = await searchParams;

  return <PdfRenderDocument designId={catalogueId} versionId={versionId || ""} pageId={pageId || ""} publicToken={publicToken || ""} />;
}
