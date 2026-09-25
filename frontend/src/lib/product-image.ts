export const NO_PRODUCT_IMAGE_URL = "/no-image.png";

export function productImageUrls(
  imageUrls?: Array<string | null | undefined>,
  primaryImageUrl?: string | null,
) {
  const urls = (imageUrls || []).filter((value): value is string => Boolean(value));
  if (urls.length) return urls;
  if (primaryImageUrl) return [primaryImageUrl];
  return [NO_PRODUCT_IMAGE_URL];
}
