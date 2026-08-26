/**
 * Payment Service
 * Integrates with Razorpay SDK in TEST MODE.
 * Provides order creation, transaction verification, and webhook validation.
 */

import crypto from "crypto";

export interface RazorpayOrderInput {
  amount: number; // in INR rupees
  currency: string;
  receipt: string;
}

export interface RazorpayOrderResult {
  id: string;
  amount: number; // in paise
  currency: string;
  receipt: string;
  status: string;
  createdAt: number;
}

export class PaymentService {
  private static isMockMode(): boolean {
    const keyId = process.env.RAZORPAY_KEY_ID;
    return !keyId || keyId === "rzp_test_placeholder";
  }

  /**
   * Create an order in Razorpay (Test Mode).
   * Converts INR amount to paise (e.g. ₹1,899 -> 189900 paise).
   */
  static async createOrder(input: RazorpayOrderInput): Promise<RazorpayOrderResult> {
    const amountInPaise = Math.round(input.amount * 100);

    if (this.isMockMode()) {
      console.log("[PaymentService] Mock Mode: Simulating Razorpay Order creation.");
      return {
        id: `order_mock_${Math.random().toString(36).substring(2, 12)}`,
        amount: amountInPaise,
        currency: input.currency,
        receipt: input.receipt,
        status: "created",
        createdAt: Math.floor(Date.now() / 1000),
      };
    }

    // Official Razorpay SDK implementation (Phase 5)
    try {
      // Lazy-import to prevent bundle dependency issues if key not provided
      const Razorpay = require("razorpay");
      const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });

      const order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: input.currency,
        receipt: input.receipt,
        payment_capture: 1, // Auto-capture payments
      });

      return {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
        status: order.status,
        createdAt: order.created_at,
      };
    } catch (error) {
      console.error("[PaymentService] Error creating Razorpay order:", error);
      throw new Error("Razorpay order creation failed.");
    }
  }

  /**
   * Verify signature returned by Razorpay checkout client.
   * Format: HMAC-SHA256(order_id + "|" + payment_id, secret)
   */
  static verifyPaymentSignature(
    razorpayOrderId: string,
    razorpayPaymentId: string,
    signature: string
  ): boolean {
    if (this.isMockMode()) {
      // Mock validation succeeds if signature starts with 'mock_sig_' or matches format
      console.log("[PaymentService] Mock Mode: Simulating signature verification.");
      return signature.startsWith("mock_sig_") || signature === "valid_mock_signature";
    }

    try {
      const secret = process.env.RAZORPAY_KEY_SECRET || "";
      const text = `${razorpayOrderId}|${razorpayPaymentId}`;
      const generatedSignature = crypto
        .createHmac("sha256", secret)
        .update(text)
        .digest("hex");

      return generatedSignature === signature;
    } catch (error) {
      console.error("[PaymentService] Signature verification crashed:", error);
      return false;
    }
  }

  /**
   * Verify incoming Webhook signatures.
   */
  static verifyWebhookSignature(
    rawBody: string,
    signature: string,
    webhookSecret: string
  ): boolean {
    if (this.isMockMode()) {
      console.log("[PaymentService] Mock Mode: Bypassing webhook verification.");
      return signature === "mock_webhook_signature" || true;
    }

    try {
      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");

      return expectedSignature === signature;
    } catch (error) {
      console.error("[PaymentService] Webhook signature check failed:", error);
      return false;
    }
  }
}
