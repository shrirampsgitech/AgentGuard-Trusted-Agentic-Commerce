import { NextRequest, NextResponse } from "next/server";
import { MerchantService } from "../../../../services/merchantService";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const product = await MerchantService.getProductById(id);
    
    if (!product) {
      return NextResponse.json({ error: `Product with ID '${id}' not found` }, { status: 404 });
    }
    
    return NextResponse.json(product, { status: 200 });
  } catch (error) {
    console.error("[API Product ID] Query crashed:", error);
    return NextResponse.json({ error: "Failed to load product details" }, { status: 500 });
  }
}
