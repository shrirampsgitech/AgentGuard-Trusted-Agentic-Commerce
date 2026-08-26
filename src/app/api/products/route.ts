import { NextRequest, NextResponse } from "next/server";
import { MerchantService } from "../../../services/merchantService";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const category = searchParams.get("category") || undefined;
    const color = searchParams.get("color") || undefined;
    const merchantId = searchParams.get("merchantId") || undefined;
    
    const sizeStr = searchParams.get("size");
    const size = sizeStr ? parseFloat(sizeStr) : undefined;
    
    const maxPriceStr = searchParams.get("maxPrice");
    const maxPrice = maxPriceStr ? parseFloat(maxPriceStr) : undefined;

    const products = await MerchantService.searchProducts({
      category,
      color,
      maxPrice,
      size,
      merchantId,
    });

    return NextResponse.json(products, { status: 200 });
  } catch (error) {
    console.error("[API Products Search] Search query failed:", error);
    return NextResponse.json({ error: "Product search failed" }, { status: 500 });
  }
}
