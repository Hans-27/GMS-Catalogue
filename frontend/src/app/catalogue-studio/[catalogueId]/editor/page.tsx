import { CatalogueStudioEditor } from "../../studio-editor";

export default async function StudioEditorRoute({ params }: { params: Promise<{ catalogueId: string }> }) {
  const { catalogueId } = await params;
  return <CatalogueStudioEditor designId={catalogueId} />;
}
