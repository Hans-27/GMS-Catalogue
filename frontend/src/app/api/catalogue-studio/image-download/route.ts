import { NextRequest, NextResponse } from "next/server";
import { API_ORIGIN } from "@/lib/api";

export const dynamic = "force-dynamic";

function contentDisposition(fileName: string) {
  const clean = (fileName || "product-image")
    .replace(/[\r\n"]/g, "_")
    .slice(0, 180);
  const ascii = clean.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("source") || "";
  const fileName = request.nextUrl.searchParams.get("filename") || "product-image";
  const apiOrigin = new URL(API_ORIGIN).origin;
  let imageUrl: URL;

  try {
    imageUrl = new URL(source, apiOrigin);
  } catch {
    return NextResponse.json({ message: "Invalid product image URL." }, { status: 400 });
  }

  if (imageUrl.origin !== apiOrigin || !imageUrl.pathname.startsWith("/api/v1/catalogue-studio/")) {
    return NextResponse.json({ message: "This image source cannot be downloaded." }, { status: 400 });
  }

  imageUrl.searchParams.set("download", "1");
  try {
    const response = await fetch(imageUrl, {
      cache: "no-store",
      headers: {
        Accept: "image/*",
        Cookie: request.headers.get("cookie") || "",
      },
    });
    if (!response.ok) {
      return NextResponse.json(
        { message: `Product image download failed (${response.status}).` },
        { status: response.status },
      );
    }
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ message: "The downloaded file is not an image." }, { status: 502 });
    }
    return new NextResponse(await response.arrayBuffer(), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": contentDisposition(fileName),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ message: "Could not reach the product image service." }, { status: 502 });
  }
}
