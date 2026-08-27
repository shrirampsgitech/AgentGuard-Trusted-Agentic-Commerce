import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { SessionStateService } from "../../../../services/sessionStateService";
import { AuditService } from "../../../../services/auditService";

export const dynamic = "force-dynamic";

const SEED_MERCHANTS = [
  {
    id: "merch-quickstep",
    name: "QuickStep Sports",
    description: "Your go-to store for high-performance running shoes and trainers.",
    rating: 4.8,
    logoUrl: "/images/merchants/quickstep.png",
    active: true,
  },
  {
    id: "merch-urbanstride",
    name: "UrbanStride",
    description: "Trendy, comfortable activewear and lifestyle sneakers.",
    rating: 4.5,
    logoUrl: "/images/merchants/urbanstyle.png",
    active: true,
  },
  {
    id: "merch-sportkart",
    name: "SportKart",
    description: "Discounted sports gear and multi-brand athletic catalog.",
    rating: 4.2,
    logoUrl: "/images/merchants/sportkart.png",
    active: true,
  },
];

const SEED_PRODUCTS = [
  {
    id: "prod-exact-match",
    merchantId: "merch-quickstep",
    name: "SwiftRun Blue Trainer",
    category: "shoes",
    purpose: ["running", "training"],
    color: "blue",
    sizes: [8, 9, 10, 11],
    price: 1899,
    currency: "INR",
    rating: 4.5,
    stock: 8,
    returnDays: 30,
    shippingDays: 2,
    description: "Highly responsive running shoe with breathable mesh upper. Fits true to size.",
    active: true,
  },
  {
    id: "prod-color-conflict",
    merchantId: "merch-quickstep",
    name: "AeroMax Black Sneaker",
    category: "shoes",
    purpose: ["running", "walking"],
    color: "black",
    sizes: [8, 9, 10],
    price: 1799,
    currency: "INR",
    rating: 4.2,
    stock: 15,
    returnDays: 14,
    shippingDays: 3,
    description: "All-black lightweight walking and jogging shoe with cushion support.",
    active: true,
  },
  {
    id: "prod-budget-conflict",
    merchantId: "merch-urbanstride",
    name: "TrailBlazer Premium Runner",
    category: "shoes",
    purpose: ["running", "hiking"],
    color: "blue",
    sizes: [9, 10, 11, 12],
    price: 2499,
    currency: "INR",
    rating: 4.7,
    stock: 4,
    returnDays: 30,
    shippingDays: 4,
    description: "Premium trail running and outdoor hiking shoe. Water-resistant.",
    active: true,
  },
  {
    id: "prod-size-conflict",
    merchantId: "merch-sportkart",
    name: "CloudPace Fit Runner",
    category: "shoes",
    purpose: ["running", "marathon"],
    color: "blue",
    sizes: [7, 8, 9],
    price: 1999,
    currency: "INR",
    rating: 4.6,
    stock: 10,
    returnDays: 30,
    shippingDays: 2,
    description: "Ultra-comfortable running shoe. Extra cushioning for marathon runner needs.",
    active: true,
  },
  {
    id: "prod-out-of-stock",
    merchantId: "merch-quickstep",
    name: "Nimbus Blue Shadow",
    category: "shoes",
    purpose: ["running"],
    color: "blue",
    sizes: [8, 9, 10, 11],
    price: 1699,
    currency: "INR",
    rating: 4.4,
    stock: 0,
    returnDays: 30,
    shippingDays: 3,
    description: "Limited-edition blue running shoe. Responsive foam padding.",
    active: true,
  },
  {
    id: "prod-alt-color",
    merchantId: "merch-quickstep",
    name: "SpeedStrike Red",
    category: "shoes",
    purpose: ["running"],
    color: "red",
    sizes: [8, 9, 10, 11],
    price: 1599,
    currency: "INR",
    rating: 4.3,
    stock: 5,
    returnDays: 30,
    shippingDays: 3,
    description: "Speed trainer shoe in vibrant athletic red color option.",
    active: true,
  },
  {
    id: "prod-alt-budget",
    merchantId: "merch-sportkart",
    name: "Apex Pro Blue",
    category: "shoes",
    purpose: ["running"],
    color: "blue",
    sizes: [9, 10, 11],
    price: 2200,
    currency: "INR",
    rating: 4.8,
    stock: 5,
    returnDays: 30,
    shippingDays: 1,
    description: "Professional grade racing shoe with carbon-fiber speed plate.",
    active: true,
  },
  {
    id: "prod-alt-size",
    merchantId: "merch-urbanstride",
    name: "FlexRun Light Blue",
    category: "shoes",
    purpose: ["running"],
    color: "blue",
    sizes: [8, 9, 9.5, 11],
    price: 1899,
    currency: "INR",
    rating: 4.1,
    stock: 6,
    returnDays: 15,
    shippingDays: 4,
    description: "Flexible mesh street runner shoe in light blue color style.",
    active: true,
  },
];

export async function POST(request: NextRequest) {
  try {
    const { scenarioId } = await request.json();
    console.log(`[Demo Scenario] Configuring database state for Scenario ${scenarioId}...`);

    try {
      // 1. Reset database to baseline
      await prisma.cartItem.deleteMany({});
      await prisma.cart.deleteMany({});
      await prisma.orderItem.deleteMany({});
      await prisma.order.deleteMany({});
      await prisma.product.deleteMany({});
      await prisma.merchant.deleteMany({});
      await prisma.auditLog.deleteMany({});
      await SessionStateService.clearAllSessions();
      AuditService.clearMemoryLogs();

      // Seed Merchants
      for (const m of SEED_MERCHANTS) {
        await prisma.merchant.create({ data: m });
      }

      // Seed Products
      for (const p of SEED_PRODUCTS) {
        await prisma.product.create({ data: p });
      }

      // 2. Apply scenario configurations
      if (scenarioId === 1) {
        // Scenario 1: Perfect Match
        // Set policy autonomy to 3 (Autonomous) & budget to 2000
        await prisma.userPolicy.upsert({
          where: { id: "default-policy" },
          update: {
            maxBudget: 2000.0,
            allowedCategories: ["shoes", "clothing"],
            allowedMerchants: ["QuickStep Sports", "UrbanStride", "SportKart"],
            allowedPaymentMethods: ["UPI"],
            autonomyLevel: 3,
          },
          create: {
            id: "default-policy",
            maxBudget: 2000.0,
            allowedCategories: ["shoes", "clothing"],
            allowedMerchants: ["QuickStep Sports", "UrbanStride", "SportKart"],
            allowedPaymentMethods: ["UPI"],
            autonomyLevel: 3,
          },
        });
      } else if (scenarioId === 2) {
        // Scenario 2: Negotiation
        // Mark prod-exact-match as out-of-stock (stock = 0)
        await prisma.product.update({
          where: { id: "prod-exact-match" },
          data: { stock: 0 }
        });

        // Set policy autonomy to 2 (Prepare)
        await prisma.userPolicy.upsert({
          where: { id: "default-policy" },
          update: {
            maxBudget: 2000.0,
            allowedCategories: ["shoes", "clothing"],
            allowedMerchants: ["QuickStep Sports", "UrbanStride", "SportKart"],
            allowedPaymentMethods: ["UPI"],
            autonomyLevel: 2,
          },
          create: {
            id: "default-policy",
            maxBudget: 2000.0,
            allowedCategories: ["shoes", "clothing"],
            allowedMerchants: ["QuickStep Sports", "UrbanStride", "SportKart"],
            allowedPaymentMethods: ["UPI"],
            autonomyLevel: 2,
          },
        });
      } else if (scenarioId === 3) {
        // Scenario 3: Safety Block
        // Set policy budget to 2000, and ensure prod-budget-conflict is in stock
        await prisma.userPolicy.upsert({
          where: { id: "default-policy" },
          update: {
            maxBudget: 2000.0,
            allowedCategories: ["shoes", "clothing"],
            allowedMerchants: ["QuickStep Sports", "UrbanStride", "SportKart"],
            allowedPaymentMethods: ["UPI"],
            autonomyLevel: 3,
          },
          create: {
            id: "default-policy",
            maxBudget: 2000.0,
            allowedCategories: ["shoes", "clothing"],
            allowedMerchants: ["QuickStep Sports", "UrbanStride", "SportKart"],
            allowedPaymentMethods: ["UPI"],
            autonomyLevel: 3,
          },
        });
      }
    } catch (dbError) {
      console.warn("[Demo Scenario] DB offline. Fallback configuration applied.", dbError);
    }

    return NextResponse.json({ success: true, message: `Scenario ${scenarioId} configured.` });
  } catch (error) {
    console.error("[Demo Scenario] Failed to prepare scenario database:", error);
    return NextResponse.json({ error: "Failed to set up scenario" }, { status: 500 });
  }
}
