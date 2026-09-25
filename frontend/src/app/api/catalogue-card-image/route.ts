import { NextRequest, NextResponse } from "next/server";
import { API_ORIGIN } from "@/lib/api";

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path") || "";
  const fileName = path.startsWith("/uploads/") ? path.slice("/uploads/".length) : "";
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(fileName)) {
    return NextResponse.json({ message: "Invalid product image path." }, { status: 400 });
  }

  try {
    const source = new URL(`/uploads/${fileName}`, API_ORIGIN);
    const response = await fetch(source, {
      cache: "no-store",
      redirect: "error",
      headers: { Accept: "image/*" },
    });
    if (!response.ok) {
      return NextResponse.json({ message: "Product image unavailable." }, { status: response.status === 404 ? 404 : 502 });
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ message: "Product image response was not an image." }, { status: 502 });
    }
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > MAX_IMAGE_BYTES) {
      return NextResponse.json({ message: "Product image is too large to capture." }, { status: 413 });
    }
    const body = await response.arrayBuffer();
    if (body.byteLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ message: "Product image is too large to capture." }, { status: 413 });
    }
    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ message: "Product image service unavailable." }, { status: 502 });
  }
}
