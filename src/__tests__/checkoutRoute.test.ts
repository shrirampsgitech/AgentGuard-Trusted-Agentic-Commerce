import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../app/api/checkout/route";
import { NextRequest } from "next/server";
import { prisma } from "../lib/prisma";
import { MerchantService } from "../services/merchantService";

vi.mock("../lib/prisma", () => ({
  prisma: {
    product: {
      findUnique: vi.fn(),
    },
    userPolicy: {
      findUnique: vi.fn(),
    },
    order: {
      create: vi.fn(),
      update: vi.fn(),
    },
    sessionState: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

describe("Checkout API Route Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FORCE_DB_AVAILABLE = "true";

    // Setup a default mock session
    (prisma.sessionState.findUnique as any).mockResolvedValue({
      id: "test-session-route",
      buyerIntent: {
        category: { value: "shoes" },
        size: { value: 9 },
        maxBudget: { value: 2000 },
        color: { value: "blue" },
        authorizationStatus: { value: "USER_CONFIRMED" },
        originalPrice: { value: 1899 },
      },
      selectedProductId: "prod-exact-match",
      relaxationDecisions: [],
      authorizationState: "USER_CONFIRMED",
    });
  });

  it("should block checkout if database is offline", async () => {
    process.env.FORCE_DB_AVAILABLE = "false";
    const req = new NextRequest("http://localhost:3000/api/checkout", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "test-session-route",
        productId: "prod-exact-match",
        size: 9,
        originalPrice: 1899,
        authorizationStatus: "USER_CONFIRMED",
      }),
    });

    const response = await POST(req);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Unable to verify the current product state");
  });

  it("should block if product does not exist in database", async () => {
    (prisma.product.findUnique as any).mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/checkout", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "test-session-route",
        productId: "prod-exact-match",
        size: 9,
        originalPrice: 1899,
        authorizationStatus: "USER_CONFIRMED",
      }),
    });

    const response = await POST(req);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Product not found");
  });

  it("should block if product is inactive", async () => {
    (prisma.product.findUnique as any).mockResolvedValue({
      id: "prod-exact-match",
      name: "SwiftRun Blue Trainer",
      category: "shoes",
      price: 1899,
      stock: 8,
      sizes: [8, 9, 10],
      color: "blue",
      merchantId: "merch-quickstep",
      merchant: { name: "QuickStep Sports" },
      active: false,
    });

    const req = new NextRequest("http://localhost:3000/api/checkout", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "test-session-route",
        productId: "prod-exact-match",
        size: 9,
        originalPrice: 1899,
        authorizationStatus: "USER_CONFIRMED",
      }),
    });

    const response = await POST(req);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Product is inactive");
  });

  it("should block if requested size is not available", async () => {
    (prisma.product.findUnique as any).mockResolvedValue({
      id: "prod-exact-match",
      name: "SwiftRun Blue Trainer",
      category: "shoes",
      price: 1899,
      stock: 8,
      sizes: [8, 10], // size 9 is not here
      color: "blue",
      merchantId: "merch-quickstep",
      merchant: { name: "QuickStep Sports" },
      active: true,
    });

    const req = new NextRequest("http://localhost:3000/api/checkout", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "test-session-route",
        productId: "prod-exact-match",
        size: 9,
        originalPrice: 1899,
        authorizationStatus: "USER_CONFIRMED",
      }),
    });

    const response = await POST(req);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("size 9 is unavailable");
  });

  it("should block if price tampering is detected", async () => {
    (prisma.product.findUnique as any).mockResolvedValue({
      id: "prod-exact-match",
      name: "SwiftRun Blue Trainer",
      category: "shoes",
      price: 1899, // Actual database price is ₹1,899
      stock: 8,
      sizes: [8, 9, 10],
      color: "blue",
      merchantId: "merch-quickstep",
      merchant: { name: "QuickStep Sports" },
      active: true,
    });

    const req = new NextRequest("http://localhost:3000/api/checkout", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "test-session-route",
        productId: "prod-exact-match",
        size: 9,
        originalPrice: 1000, // Client tries to override price to ₹1,000
        authorizationStatus: "USER_CONFIRMED",
      }),
    });

    const response = await POST(req);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("exceeds authorized budget");
  });

  it("should successfully checkout a valid SwiftRun Blue Trainer under ₹2000 budget and size 9", async () => {
    // 1. Mock DB product lookup
    (prisma.product.findUnique as any).mockResolvedValue({
      id: "prod-exact-match",
      name: "SwiftRun Blue Trainer",
      category: "shoes",
      price: 1899,
      stock: 8,
      sizes: [8, 9, 10],
      color: "blue",
      merchantId: "merch-quickstep",
      merchant: { name: "QuickStep Sports" },
      active: true,
    });

    // 2. Mock policy check lookup
    (prisma.userPolicy.findUnique as any).mockResolvedValue({
      id: "default-policy",
      maxBudget: 2000,
      allowedCategories: ["shoes"],
      allowedMerchants: ["QuickStep Sports"],
      allowedPaymentMethods: ["UPI"],
      autonomyLevel: 2,
    });

    // 3. Mock order record creation and update
    (prisma.order.create as any).mockResolvedValue({
      id: "ord_123",
      status: "CREATED",
      totalAmount: 1899,
    });
    (prisma.order.update as any).mockResolvedValue({
      id: "ord_123",
      status: "PENDING_PAYMENT",
      razorpayOrderId: "order_mock_rzp",
    });

    const req = new NextRequest("http://localhost:3000/api/checkout", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "test-session-route",
        productId: "prod-exact-match",
        size: 9,
        originalPrice: 1899,
        authorizationStatus: "USER_CONFIRMED",
      }),
    });

    const response = await POST(req);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.orderId).toBe("ord_123");
    expect(body.razorpayOrderId).toBeDefined();
    expect(body.amount).toBe(189900); // 1899 INR in paise
  });

  it("should reject checkout if requested product ID does not match session selectedProductId", async () => {
    // Mock session state with selectedProductId: "prod-exact-match"
    (prisma.sessionState.findUnique as any).mockResolvedValue({
      id: "test-session-route",
      buyerIntent: {
        category: { value: "shoes" },
        size: { value: 9 },
        maxBudget: { value: 2000 },
        color: { value: "blue" },
        authorizationStatus: { value: "USER_CONFIRMED" },
        originalPrice: { value: 1899 },
      },
      selectedProductId: "prod-exact-match",
      relaxationDecisions: [],
      authorizationState: "USER_CONFIRMED",
    });

    const req = new NextRequest("http://localhost:3000/api/checkout", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "test-session-route",
        productId: "prod-budget-conflict", // client requests a different product ID than staged!
        size: 9,
        originalPrice: 1899,
        authorizationStatus: "USER_CONFIRMED",
      }),
    });

    const response = await POST(req);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Stale staged-product state or mismatched product ID");
  });

  it("should gracefully fall back to in-memory store if database query fails but offline is not forced", async () => {
    process.env.FORCE_DB_AVAILABLE = ""; // not forced false
    
    // Simulate database queries throwing errors
    (prisma.product.findUnique as any).mockRejectedValue(new Error("Connection refused"));
    (prisma.userPolicy.findUnique as any).mockRejectedValue(new Error("Connection refused"));

    const req = new NextRequest("http://localhost:3000/api/checkout", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "test-session-route",
        productId: "prod-exact-match",
        size: 9,
        originalPrice: 1899,
        authorizationStatus: "USER_CONFIRMED",
      }),
    });

    const response = await POST(req);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.orderId).toContain("mem_order_");
    expect(body.razorpayOrderId).toBeDefined();
  });
});
