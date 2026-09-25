import { NextRequest, NextResponse } from "next/server";
import { API_ORIGIN } from "@/lib/api";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const assetId = request.nextUrl.searchParams.get("assetId") || "";
  if (!UUID.test(assetId)) {
    return NextResponse.json({ message: "Invalid Studio asset ID." }, { status: 400 });
  }

  const assetUrl = new URL(`/api/v1/catalogue-studio/assets/${assetId}/content`, API_ORIGIN);
  try {
    const response = await fetch(assetUrl, {
      cache: "no-store",
      headers: {
        Accept: "image/*",
        Cookie: request.headers.get("cookie") || "",
      },
    });
    if (!response.ok) {
      return NextResponse.json(
        { message: `Studio image request failed (${response.status}).` },
        { status: response.status },
      );
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ message: "The Studio asset is not an image." }, { status: 415 });
    }
    return new NextResponse(await response.arrayBuffer(), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ message: "Could not reach the Studio media service." }, { status: 502 });
  }
}
