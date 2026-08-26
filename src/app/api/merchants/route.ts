import { NextResponse } from "next/server";
import { MerchantService } from "../../../services/merchantService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const merchants = await MerchantService.getMerchants();
    return NextResponse.json(merchants, { status: 200 });
  } catch (error) {
    console.error("[API Merchants] Failed to retrieve merchants list:", error);
    return NextResponse.json({ error: "Failed to load merchants list" }, { status: 500 });
  }
}
