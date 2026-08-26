import { NextRequest, NextResponse } from "next/server";
import { MerchantService } from "../../../../services/merchantService";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const merchant = await MerchantService.getMerchantById(id);
    
    if (!merchant) {
      return NextResponse.json({ error: `Merchant with ID '${id}' not found` }, { status: 404 });
    }
    
    return NextResponse.json(merchant, { status: 200 });
  } catch (error) {
    console.error("[API Merchant ID] Query crashed:", error);
    return NextResponse.json({ error: "Failed to load merchant details" }, { status: 500 });
  }
}
