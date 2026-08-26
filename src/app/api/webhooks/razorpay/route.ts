import { NextRequest, NextResponse } from "next/server";
import { PaymentService } from "../../../../services/paymentService";
import { AuditService } from "../../../../services/auditService";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature") || "";
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "placeholder_webhook_secret";

    // 1. Verify webhook signature
    const isValid = PaymentService.verifyWebhookSignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      console.warn("[Razorpay Webhook] Received invalid webhook signature header.");
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;
    console.log(`[Razorpay Webhook] Verified event: ${event}`);

    // 2. Handle captured event
    if (event === "payment.captured") {
      const paymentEntity = payload.payload?.payment?.entity;
      const razorpayOrderId = paymentEntity?.order_id;
      const razorpayPaymentId = paymentEntity?.id;
      const amount = paymentEntity?.amount;

      await AuditService.logStep(
        razorpayOrderId || "unknown-session",
        "PAYMENT_WEBHOOK",
        `Webhook verified: Payment ${razorpayPaymentId} captured successfully. Amount: ₹${(amount / 100).toFixed(2)}`,
        { razorpayPaymentId, razorpayOrderId, amount }
      );
    }

    return NextResponse.json({ success: true, event }, { status: 200 });
  } catch (error) {
    console.error("[Razorpay Webhook] Error processing webhook event:", error);
    return NextResponse.json({ error: "Webhook handling failed" }, { status: 500 });
  }
}
