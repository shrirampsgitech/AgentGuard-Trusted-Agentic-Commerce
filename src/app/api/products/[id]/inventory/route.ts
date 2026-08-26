import { NextRequest, NextResponse } from "next/server";
import { MerchantService } from "../../../../../services/merchantService";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const { searchParams } = new URL(request.url);
    const sizeStr = searchParams.get("size");
    const size = sizeStr ? parseFloat(sizeStr) : undefined;

    const inventory = await MerchantService.checkInventory(id, size);
    
    return NextResponse.json(
      {
        productId: id,
        sizeCheck: size !== undefined ? size : "any",
        inStock: inventory.inStock,
        availableStock: inventory.availableStock,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[API Product Inventory] Check crashed:", error);
    return NextResponse.json({ error: "Failed to verify inventory levels" }, { status: 500 });
  }
}
