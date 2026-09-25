import type { Metadata } from "next";
import { PublicCatalogueViewer } from "./public-catalogue-viewer";

export const metadata: Metadata = { title: "Product Catalogue | GMS" };

export default async function PublicCatalogueRoute({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicCatalogueViewer token={token} />;
}
