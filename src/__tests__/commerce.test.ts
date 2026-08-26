import { describe, it, expect, beforeAll } from "vitest";
import { MerchantService } from "../services/merchantService";

describe("AgentGuard Core Commerce Tests (MerchantService)", () => {
  // Before running tests, we ensure the in-memory fallback list is ready
  beforeAll(async () => {
    // Probes database, falls back to memory arrays if offline
    await MerchantService.getMerchants();
  });

  // 1. Merchant listing
  it("should list all active merchants", async () => {
    const merchants = await MerchantService.getMerchants();
    expect(merchants).toBeDefined();
    expect(merchants.length).toBeGreaterThanOrEqual(3);
    
    const names = merchants.map((m) => m.name);
    expect(names).toContain("QuickStep Sports");
    expect(names).toContain("UrbanStride");
    expect(names).toContain("SportKart");
  });

  // 2. Product listing
  it("should retrieve all active products without filters", async () => {
    const products = await MerchantService.searchProducts();
    expect(products).toBeDefined();
    expect(products.length).toBeGreaterThanOrEqual(8);
  });

  // 3. Product search
  it("should search and filter products by basic query attributes", async () => {
    const products = await MerchantService.searchProducts({ category: "shoes" });
    expect(products).toBeDefined();
    expect(products.every((p) => p.category === "shoes")).toBe(true);
  });

  // 4. Search across multiple merchants
  it("should return products from multiple merchants when searching generally", async () => {
    const products = await MerchantService.searchProducts({ category: "shoes" });
    const merchantIds = new Set(products.map((p) => p.merchantId));
    
    expect(merchantIds.size).toBeGreaterThanOrEqual(3);
    expect(merchantIds.has("merch-quickstep")).toBe(true);
    expect(merchantIds.has("merch-urbanstride")).toBe(true);
    expect(merchantIds.has("merch-sportkart")).toBe(true);
  });

  // 5. Exact product match
  it("should find the exact match product (Blue, Size 10, Running, under ₹2,000, In Stock)", async () => {
    const products = await MerchantService.searchProducts({
      category: "shoes",
      color: "blue",
      size: 10,
      maxPrice: 2000,
    });
    
    // Filter out-of-stock items for exact match (In Stock)
    const inStock = products.filter((p) => p.stock > 0);
    expect(inStock).toHaveLength(1);
    const exactProduct = inStock[0];
    expect(exactProduct.id).toBe("prod-exact-match");
    expect(exactProduct.name).toBe("SwiftRun Blue Trainer");
    expect(exactProduct.color).toBe("blue");
    expect(exactProduct.sizes).toContain(10);
    expect(exactProduct.price).toBeLessThanOrEqual(2000);
    expect(exactProduct.stock).toBeGreaterThan(0);
  });

  // 6. Out-of-stock detection
  it("should correctly identify if a product is out of stock", async () => {
    // Product ID: prod-out-of-stock represents the Nimbus Blue Shadow (stock 0)
    const inventory = await MerchantService.checkInventory("prod-out-of-stock", 10);
    expect(inventory.inStock).toBe(false);
    expect(inventory.availableStock).toBe(0);

    // Dynamic search should return the out of stock item as well
    const product = await MerchantService.getProductById("prod-out-of-stock");
    expect(product).toBeDefined();
    expect(product?.stock).toBe(0);
  });

  // 7. Size filtering
  it("should exclude products that do not support the target size", async () => {
    // CloudPace Fit Runner (prod-size-conflict) has size [7, 8, 9] (excludes size 10)
    const products = await MerchantService.searchProducts({
      category: "shoes",
      size: 10,
      merchantId: "merch-sportkart",
    });

    const ids = products.map((p) => p.id);
    expect(ids).not.toContain("prod-size-conflict");
    
    const size9Products = await MerchantService.searchProducts({
      category: "shoes",
      size: 9,
      merchantId: "merch-sportkart",
    });
    const size9Ids = size9Products.map((p) => p.id);
    expect(size9Ids).toContain("prod-size-conflict");
  });

  // 8. Price filtering
  it("should exclude products that exceed the max price limit", async () => {
    // TrailBlazer Premium Runner (prod-budget-conflict) costs ₹2,499
    const under2000Products = await MerchantService.searchProducts({
      category: "shoes",
      maxPrice: 2000,
    });
    
    const ids = under2000Products.map((p) => p.id);
    expect(ids).not.toContain("prod-budget-conflict");

    const under2500Products = await MerchantService.searchProducts({
      category: "shoes",
      maxPrice: 2500,
    });
    const under2500Ids = under2500Products.map((p) => p.id);
    expect(under2500Ids).toContain("prod-budget-conflict");
  });

  // 9. Multiple merchants returning products
  it("should list products specific to a chosen merchant", async () => {
    const quickstepProducts = await MerchantService.searchProducts({
      merchantId: "merch-quickstep",
    });
    
    expect(quickstepProducts.length).toBeGreaterThanOrEqual(4);
    expect(quickstepProducts.every((p) => p.merchantId === "merch-quickstep")).toBe(true);

    const urbanstrideProducts = await MerchantService.searchProducts({
      merchantId: "merch-urbanstride",
    });
    expect(urbanstrideProducts.length).toBeGreaterThanOrEqual(2);
    expect(urbanstrideProducts.every((p) => p.merchantId === "merch-urbanstride")).toBe(true);
  });
});
