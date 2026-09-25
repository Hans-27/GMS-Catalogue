import { ProductCardEditor } from "./product-card-editor";

export default async function ProductCardEditPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  return <ProductCardEditor productId={productId} />;
}
