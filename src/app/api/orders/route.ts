import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { MerchantService } from "../../../services/merchantService";
import { InMemoryOrderStore } from "../../../services/inMemoryOrderStore";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const isDbOnline = await MerchantService.isDatabaseAvailable();
    let orders: any[] = [];

    if (isDbOnline) {
      orders = await prisma.order.findMany({
        include: {
          items: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });
    } else {
      orders = InMemoryOrderStore.list().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    return NextResponse.json({ success: true, orders });
  } catch (error) {
    console.error("[Orders API] Fetch failed:", error);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}
