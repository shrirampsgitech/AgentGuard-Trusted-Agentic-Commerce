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
  /**
   * Check if we should fall back to simulating payments.
   */
  public static isMockMode(): boolean {
    if (process.env.NODE_ENV === "test") {
      return true;
    }
    const keyId = process.env.RAZORPAY_KEY_ID;
    return !keyId || keyId === "rzp_test_placeholder" || keyId.startsWith("rzp_test_your");
  }

  /**
   * Create an order in Razorpay (Test Mode).
   * Converts INR amount to paise (e.g. ₹1,899 -> 189900 paise).
   */
  static async createRazorpayOrder(input: RazorpayOrderInput): Promise<RazorpayOrderResult> {
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
        payment_capture: true, // Auto-capture payments (boolean required by Razorpay SDK v2.9.x)
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
      console.log("[PaymentService] Mock Mode: Simulating signature verification.");
      return signature === "valid_mock_signature" || signature.startsWith("mock_sig_");
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
      return signature === "mock_webhook_signature";
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

  /**
   * Retrieve payment status for a Razorpay order.
   */
  static async getPaymentStatus(razorpayOrderId: string): Promise<string> {
    if (this.isMockMode()) {
      console.log(`[PaymentService] Mock Mode: Returning status 'created' for ${razorpayOrderId}`);
      return "created";
    }

    try {
      const Razorpay = require("razorpay");
      const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });

      const order = await razorpay.orders.fetch(razorpayOrderId);
      return order.status; // e.g. 'created', 'attempted', 'paid'
    } catch (error) {
      console.error("[PaymentService] Error fetching Razorpay order status:", error);
      throw new Error("Failed to fetch payment status.");
    }
  }
}
