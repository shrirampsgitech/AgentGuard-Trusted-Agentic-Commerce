import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

// Standalone Prisma Client instantiator for database seed script
const connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/agentguard?schema=public";
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export const SEED_MERCHANTS = [
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

export const SEED_PRODUCTS = [
  // 1. Exact Match Candidate (Blue + Size 10 + Running + <= ₹2,000 + In Stock)
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
  
  // 2. Color Conflict Candidate (Black + Size 10 + Running + <= ₹2,000 + In Stock)
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

  // 3. Budget Conflict Candidate (Blue + Size 10 + Running + > ₹2,000 + In Stock)
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

  // 4. Size Conflict Candidate (Blue + Size 9 + Running + <= ₹2,000 + In Stock - NO SIZE 10)
  {
    id: "prod-size-conflict",
    merchantId: "merch-sportkart",
    name: "CloudPace Fit Runner",
    category: "shoes",
    purpose: ["running", "marathon"],
    color: "blue",
    sizes: [7, 8, 9], // Size 10 excluded intentionally
    price: 1999,
    currency: "INR",
    rating: 4.6,
    stock: 10,
    returnDays: 30,
    shippingDays: 2,
    description: "Ultra-comfortable running shoe. Extra cushioning for marathon runner needs.",
    active: true,
  },

  // 5. Out-of-stock Exact Match (Blue + Size 10 + Running + <= ₹2,000 but stock = 0)
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
    stock: 0, // OUT OF STOCK
    returnDays: 30,
    shippingDays: 3,
    description: "Limited-edition blue running shoe. Responsive foam padding.",
    active: true,
  },

  // 6. Close Alternative 1 (Red color compromise, matches price & size & purpose)
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

  // 7. Close Alternative 2 (Higher budget compromise, matches color & size & purpose)
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

  // 8. Close Alternative 3 (Size 9.5 compromise, matches color & price & purpose)
  {
    id: "prod-alt-size",
    merchantId: "merch-urbanstride",
    name: "FlexRun Light Blue",
    category: "shoes",
    purpose: ["running"],
    color: "blue",
    sizes: [8, 9, 9.5, 11], // Relaxes size to 9.5
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

async function main() {
  console.log("Starting database seeding...");

  try {
    // 1. Clean existing records
    await prisma.product.deleteMany({});
    await prisma.merchant.deleteMany({});
    console.log("Cleared existing products and merchants.");

    // 2. Seed Merchants
    for (const m of SEED_MERCHANTS) {
      await prisma.merchant.create({
        data: m,
      });
    }
    console.log(`Successfully seeded ${SEED_MERCHANTS.length} merchants.`);

    // 3. Seed Products
    for (const p of SEED_PRODUCTS) {
      await prisma.product.create({
        data: p,
      });
    }
    console.log(`Successfully seeded ${SEED_PRODUCTS.length} products.`);
    console.log("Database seeding completed successfully!");
  } catch (error) {
    console.error("Database seeding encountered a connection error:", error);
    process.exit(0); // Exit gracefully in buildathon settings if database is offline
  } finally {
    await prisma.$disconnect();
    pool.end();
  }
}

main();
