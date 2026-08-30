import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../app/api/payment/verify/route";
import { NextRequest } from "next/server";
import { prisma } from "../lib/prisma";
import { MerchantService } from "../services/merchantService";
import { InMemoryOrderStore } from "../services/inMemoryOrderStore";

vi.mock("../lib/prisma", () => ({
  prisma: {
    order: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    product: {
      update: vi.fn(),
    },
    sessionState: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

describe("Payment Verification API Route Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FORCE_DB_AVAILABLE = "false"; // simulate DB offline by default for fallback testing
    InMemoryOrderStore.clear();
    MerchantService.resetMockProducts();
  });

  it("should successfully capture payment, decrement stock, and update status under offline fallback", async () => {
    // 1. Create a mock order in-memory
    const order = InMemoryOrderStore.create({
      productId: "prod-exact-match",
      quantity: 1,
      size: 10,
      color: "blue",
      price: 1899,
      totalAmount: 1899,
    });

    InMemoryOrderStore.update(order.id, {
      razorpayOrderId: "order_mock_123",
      status: "PENDING_PAYMENT",
    });

    // 2. Query stock before verification (from in-memory catalog fallback)
    const productBefore = MerchantService.getMockProductById("prod-exact-match");
    const initialStock = productBefore?.stock || 8;

    // 3. Trigger /api/payment/verify request
    const req = new NextRequest("http://localhost:3000/api/payment/verify", {
      method: "POST",
      body: JSON.stringify({
        orderId: order.id,
        razorpayOrderId: "order_mock_123",
        razorpayPaymentId: "pay_mock_123",
        razorpaySignature: "valid_mock_signature",
        sessionId: "test-session-verify",
      }),
    });

    const response = await POST(req);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);

    // 4. Verify stock has decremented in-memory
    const productAfter = MerchantService.getMockProductById("prod-exact-match");
    expect(productAfter?.stock).toBe(initialStock - 1);

    // 5. Verify order status transitioned to PAYMENT_CAPTURED
    const savedOrder = InMemoryOrderStore.findById(order.id);
    expect(savedOrder?.status).toBe("PAYMENT_CAPTURED");
  });

  it("should mark order as PAYMENT_FAILED and NOT decrement stock if signature is invalid under offline fallback", async () => {
    const order = InMemoryOrderStore.create({
      productId: "prod-exact-match",
      quantity: 1,
      size: 10,
      color: "blue",
      price: 1899,
      totalAmount: 1899,
    });

    InMemoryOrderStore.update(order.id, {
      razorpayOrderId: "order_mock_123",
      status: "PENDING_PAYMENT",
    });

    const productBefore = MerchantService.getMockProductById("prod-exact-match");
    const initialStock = productBefore?.stock || 8;

    const req = new NextRequest("http://localhost:3000/api/payment/verify", {
      method: "POST",
      body: JSON.stringify({
        orderId: order.id,
        razorpayOrderId: "order_mock_123",
        razorpayPaymentId: "pay_mock_123",
        razorpaySignature: "invalid_mock_signature",
        sessionId: "test-session-verify",
      }),
    });

    const response = await POST(req);
    expect(response.status).toBe(400);

    // Stock must remain unchanged
    const productAfter = MerchantService.getMockProductById("prod-exact-match");
    expect(productAfter?.stock).toBe(initialStock);

    // Order status must be PAYMENT_FAILED
    const savedOrder = InMemoryOrderStore.findById(order.id);
    expect(savedOrder?.status).toBe("PAYMENT_FAILED");
  });

  it("should support idempotency: return success immediately without double stock decrement if already captured", async () => {
    const order = InMemoryOrderStore.create({
      productId: "prod-exact-match",
      quantity: 1,
      size: 10,
      color: "blue",
      price: 1899,
      totalAmount: 1899,
    });

    InMemoryOrderStore.update(order.id, {
      razorpayOrderId: "order_mock_123",
      status: "PAYMENT_CAPTURED", // Already paid
    });

    const productBefore = MerchantService.getMockProductById("prod-exact-match");
    const initialStock = productBefore?.stock || 8;

    const req = new NextRequest("http://localhost:3000/api/payment/verify", {
      method: "POST",
      body: JSON.stringify({
        orderId: order.id,
        razorpayOrderId: "order_mock_123",
        razorpayPaymentId: "pay_mock_123",
        razorpaySignature: "valid_mock_signature",
        sessionId: "test-session-verify",
      }),
    });

    const response = await POST(req);
    expect(response.status).toBe(200);

    // Stock must not decrement again
    const productAfter = MerchantService.getMockProductById("prod-exact-match");
    expect(productAfter?.stock).toBe(initialStock);
  });
});
