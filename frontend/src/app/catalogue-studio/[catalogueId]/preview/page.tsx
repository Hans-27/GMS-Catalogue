import { StudioPreview } from "../../studio-preview";

export default async function StudioPreviewRoute({ params }: { params: Promise<{ catalogueId: string }> }) {
  const { catalogueId } = await params;
  return <StudioPreview designId={catalogueId} />;
}
