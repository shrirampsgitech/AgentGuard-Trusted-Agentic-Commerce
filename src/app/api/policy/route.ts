import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const policy = await prisma.userPolicy.findUnique({
      where: { id: "default-policy" },
    });
    if (!policy) {
      return NextResponse.json({
        success: true,
        policy: {
          id: "default-policy",
          maxBudget: 2000.0,
          allowedCategories: ["shoes", "clothing"],
          allowedMerchants: ["QuickStep Sports", "UrbanStride"],
          allowedPaymentMethods: ["UPI"],
          autonomyLevel: 2,
        },
      });
    }
    return NextResponse.json({ success: true, policy });
  } catch (error) {
    console.error("[Policy API] Fetch failed:", error);
    return NextResponse.json({ error: "Failed to fetch policy settings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { maxBudget, allowedCategories, allowedMerchants, allowedPaymentMethods, autonomyLevel } = body;

    const policy = await prisma.userPolicy.upsert({
      where: { id: "default-policy" },
      update: {
        maxBudget: maxBudget !== undefined ? parseFloat(maxBudget) : undefined,
        allowedCategories: allowedCategories || undefined,
        allowedMerchants: allowedMerchants || undefined,
        allowedPaymentMethods: allowedPaymentMethods || undefined,
        autonomyLevel: autonomyLevel !== undefined ? parseInt(autonomyLevel) : undefined,
      },
      create: {
        id: "default-policy",
        maxBudget: maxBudget !== undefined ? parseFloat(maxBudget) : 2000.0,
        allowedCategories: allowedCategories || ["shoes", "clothing"],
        allowedMerchants: allowedMerchants || ["QuickStep Sports", "UrbanStride"],
        allowedPaymentMethods: allowedPaymentMethods || ["UPI"],
        autonomyLevel: autonomyLevel !== undefined ? parseInt(autonomyLevel) : 2,
      },
    });

    return NextResponse.json({ success: true, policy });
  } catch (error) {
    console.error("[Policy API] Update failed:", error);
    return NextResponse.json({ error: "Failed to update policy settings" }, { status: 500 });
  }
}
