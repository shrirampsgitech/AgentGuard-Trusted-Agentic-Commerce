import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { PolicyEngine } from "../../../services/policyEngine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const policy = await prisma.userPolicy.findUnique({
      where: { id: "default-policy" },
    });
    if (!policy) {
      return NextResponse.json({
        success: true,
        policy: PolicyEngine.getPolicyMemory(),
      });
    }
    return NextResponse.json({ success: true, policy });
  } catch (error) {
    console.error("[Policy API] Fetch failed, falling back to memory:", error);
    return NextResponse.json({
      success: true,
      policy: PolicyEngine.getPolicyMemory(),
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { maxBudget, allowedCategories, allowedMerchants, allowedPaymentMethods, autonomyLevel } = body;

    const updates = {
      maxBudget: maxBudget !== undefined ? parseFloat(maxBudget) : undefined,
      allowedCategories: allowedCategories || undefined,
      allowedMerchants: allowedMerchants || undefined,
      allowedPaymentMethods: allowedPaymentMethods || undefined,
      autonomyLevel: autonomyLevel !== undefined ? parseInt(autonomyLevel) : undefined,
    };

    PolicyEngine.setPolicyMemory(updates);

    try {
      const policy = await prisma.userPolicy.upsert({
        where: { id: "default-policy" },
        update: {
          maxBudget: updates.maxBudget,
          allowedCategories: updates.allowedCategories,
          allowedMerchants: updates.allowedMerchants,
          allowedPaymentMethods: updates.allowedPaymentMethods,
          autonomyLevel: updates.autonomyLevel,
        },
        create: {
          id: "default-policy",
          maxBudget: updates.maxBudget !== undefined ? updates.maxBudget : 2000.0,
          allowedCategories: updates.allowedCategories || ["shoes", "clothing"],
          allowedMerchants: updates.allowedMerchants || ["QuickStep Sports", "UrbanStride"],
          allowedPaymentMethods: updates.allowedPaymentMethods || ["UPI"],
          autonomyLevel: updates.autonomyLevel !== undefined ? updates.autonomyLevel : 2,
        },
      });
      return NextResponse.json({ success: true, policy });
    } catch (dbError) {
      console.warn("[Policy API] DB offline, updated memory cache only:", dbError);
      return NextResponse.json({
        success: true,
        policy: PolicyEngine.getPolicyMemory(),
      });
    }
  } catch (error) {
    console.error("[Policy API] Update failed:", error);
    return NextResponse.json({ error: "Failed to update policy settings" }, { status: 500 });
  }
}
