/**
 * Merchant Service
 * Interacts with the PostgreSQL database (via Prisma) to search products,
 * retrieve merchants, check inventory, and handle active filters.
 * Falls back dynamically to an in-memory replica if database is unreachable (P1001).
 */

import { prisma } from "../lib/prisma";

export interface ProductData {
  id: string;
  merchantId: string;
  merchantName: string;
  name: string;
  category: string;
  purpose: string[];
  color: string;
  sizes: number[];
  price: number;
  currency: string;
  rating: number;
  stock: number;
  returnDays: number;
  shippingDays: number;
  description: string | null;
  active: boolean;
}

export interface MerchantData {
  id: string;
  name: string;
  logoUrl: string | null;
  description: string | null;
  rating: number;
  active: boolean;
}

export class MerchantService {
  // In-Memory replica catalog (same data as seeded database, for resilient fallback)
  private static mockMerchants: MerchantData[] = [
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

  private static mockProducts: ProductData[] = [
    {
      id: "prod-exact-match",
      merchantId: "merch-quickstep",
      merchantName: "QuickStep Sports",
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
      merchantName: "QuickStep Sports",
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
      merchantName: "UrbanStride",
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
      merchantName: "SportKart",
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
      merchantName: "QuickStep Sports",
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
      merchantName: "QuickStep Sports",
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
      merchantName: "SportKart",
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
      merchantName: "UrbanStride",
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

  /**
   * Helper to check database connectivity.
   */
  public static async isDatabaseAvailable(): Promise<boolean> {
    if (process.env.FORCE_DB_AVAILABLE === "true") {
      return true;
    }
    if (process.env.FORCE_DB_AVAILABLE === "false") {
      return false;
    }
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all merchants.
   */
  static async getMerchants(): Promise<MerchantData[]> {
    if (await this.isDatabaseAvailable()) {
      try {
        const merchants = await prisma.merchant.findMany({
          where: { active: true },
        });
        return merchants.map((m) => ({
          id: m.id,
          name: m.name,
          logoUrl: m.logoUrl,
          description: m.description,
          rating: m.rating,
          active: m.active,
        }));
      } catch (error) {
        console.warn("[MerchantService] Query failed. Falling back to local array.", error);
      }
    }
    return this.mockMerchants.filter((m) => m.active);
  }

  /**
   * Get single merchant details.
   */
  static async getMerchantById(id: string): Promise<MerchantData | null> {
    if (await this.isDatabaseAvailable()) {
      try {
        const merchant = await prisma.merchant.findUnique({
          where: { id },
        });
        if (merchant) {
          return {
            id: merchant.id,
            name: merchant.name,
            logoUrl: merchant.logoUrl,
            description: merchant.description,
            rating: merchant.rating,
            active: merchant.active,
          };
        }
        return null;
      } catch (error) {
        console.warn("[MerchantService] Single merchant query failed. Falling back.", error);
      }
    }
    return this.mockMerchants.find((m) => m.id === id && m.active) || null;
  }

  /**
   * Search products across merchants with structured filters.
   */
  static async searchProducts(filters?: {
    category?: string;
    color?: string;
    maxPrice?: number;
    size?: number;
    merchantId?: string;
    activeOnly?: boolean;
  }): Promise<ProductData[]> {
    const activeOnly = filters?.activeOnly ?? true;

    if (await this.isDatabaseAvailable()) {
      try {
        const whereClause: any = {};
        
        if (activeOnly) {
          whereClause.active = true;
        }
        if (filters?.merchantId) {
          whereClause.merchantId = filters.merchantId;
        }
        if (filters?.category) {
          whereClause.category = { equals: filters.category, mode: "insensitive" };
        }
        if (filters?.color) {
          whereClause.color = { equals: filters.color, mode: "insensitive" };
        }
        if (filters?.maxPrice !== undefined) {
          whereClause.price = { lte: filters.maxPrice };
        }

        const products = await prisma.product.findMany({
          where: whereClause,
          include: { merchant: true },
        });

        // Filter size in JS array since sizes is Float[] array in Prisma and can't use simple scalar operators on some databases
        let filtered = products;
        if (filters?.size !== undefined) {
          filtered = products.filter((p) => p.sizes.includes(filters.size!));
        }

        return filtered.map((p) => ({
          id: p.id,
          merchantId: p.merchantId,
          merchantName: p.merchant.name,
          name: p.name,
          category: p.category,
          purpose: p.purpose,
          color: p.color,
          sizes: p.sizes,
          price: p.price,
          currency: p.currency,
          rating: p.rating,
          stock: p.stock,
          returnDays: p.returnDays,
          shippingDays: p.shippingDays,
          description: p.description,
          active: p.active,
        }));
      } catch (error) {
        console.warn("[MerchantService] Search query failed. Falling back to local array.", error);
      }
    }

    // Local in-memory search fallback
    return this.mockProducts.filter((p) => {
      if (activeOnly && !p.active) return false;
      if (filters?.merchantId && p.merchantId !== filters.merchantId) return false;
      if (filters?.category && p.category.toLowerCase() !== filters.category.toLowerCase()) return false;
      if (filters?.color && p.color.toLowerCase() !== filters.color.toLowerCase()) return false;
      if (filters?.maxPrice !== undefined && p.price > filters.maxPrice) return false;
      if (filters?.size !== undefined && !p.sizes.includes(filters.size)) return false;
      return true;
    });
  }

  /**
   * Get single product details.
   */
  static async getProductById(id: string): Promise<ProductData | null> {
    if (await this.isDatabaseAvailable()) {
      try {
        const p = await prisma.product.findUnique({
          where: { id },
          include: { merchant: true },
        });
        if (p) {
          return {
            id: p.id,
            merchantId: p.merchantId,
            merchantName: p.merchant.name,
            name: p.name,
            category: p.category,
            purpose: p.purpose,
            color: p.color,
            sizes: p.sizes,
            price: p.price,
            currency: p.currency,
            rating: p.rating,
            stock: p.stock,
            returnDays: p.returnDays,
            shippingDays: p.shippingDays,
            description: p.description,
            active: p.active,
          };
        }
        return null;
      } catch (error) {
        console.warn("[MerchantService] Single product query failed. Falling back.", error);
      }
    }
    return this.mockProducts.find((p) => p.id === id && p.active) || null;
  }

  /**
   * Verify stock level and size eligibility.
   */
  static async checkInventory(
    productId: string,
    size?: number
  ): Promise<{ inStock: boolean; availableStock: number }> {
    const product = await this.getProductById(productId);
    if (!product || !product.active) {
      return { inStock: false, availableStock: 0 };
    }

    if (size !== undefined && !product.sizes.includes(size)) {
      return { inStock: false, availableStock: 0 };
    }

    return {
      inStock: product.stock > 0,
      availableStock: product.stock,
    };
  }
}
