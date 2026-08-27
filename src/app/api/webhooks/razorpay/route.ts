import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { PaymentService } from "../../../../services/paymentService";
import { AuditService } from "../../../../services/auditService";
import { SessionStateService } from "../../../../services/sessionStateService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature") || "";
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "placeholder_webhook_secret";

    // 1. Verify raw webhook signature
    const isValid = PaymentService.verifyWebhookSignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      console.warn("[Razorpay Webhook] Received invalid webhook signature header.");
      // Log failure in audit trail if session/order can be extracted
      try {
        const payload = JSON.parse(rawBody);
        const rzpOrderId = payload.payload?.payment?.entity?.order_id;
        if (rzpOrderId) {
          await AuditService.logStep(rzpOrderId, "webhook_rejected", `Webhook signature validation failed.`);
        }
      } catch {}
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;
    const paymentEntity = payload.payload?.payment?.entity;
    const rzpOrderId = paymentEntity?.order_id;
    const rzpPaymentId = paymentEntity?.id;
    const amount = paymentEntity?.amount;

    await AuditService.logStep(
      rzpOrderId || "unknown-session",
      "webhook_verified",
      `Webhook signature verified for event: ${event}`
    );

    // 2. Handle payment.captured event idempotently
    if (event === "payment.captured") {
      await AuditService.logStep(
        rzpOrderId || "unknown-session",
        "webhook_received",
        `Processing captured payment: ${rzpPaymentId}`
      );

      if (rzpOrderId) {
        // Retrieve internal Order
        const order = await prisma.order.findFirst({
          where: { razorpayOrderId: rzpOrderId },
          include: { items: true },
        });

        if (order) {
          // Idempotency Guard: Verify if the order is already processed
          if (order.status === "PAYMENT_CAPTURED") {
            await AuditService.logStep(
              rzpOrderId,
              "order_confirmed",
              `Webhook duplicate event detected. Order ${order.id} is already PAYMENT_CAPTURED. No action taken.`
            );
            return NextResponse.json({ success: true, message: "Webhook processed idempotently." });
          }

          try {
            await prisma.$transaction(async (tx) => {
              // Optimistic locking update: only update if order status is PENDING_PAYMENT
              const updated = await tx.order.updateMany({
                where: {
                  id: order.id,
                  status: "PENDING_PAYMENT"
                },
                data: {
                  status: "PAYMENT_CAPTURED",
                  razorpayPaymentId: rzpPaymentId,
                  razorpaySignature: signature || "webhook_verified",
                }
              });

              if (updated.count === 0) {
                throw new Error("ALREADY_PROCESSED");
              }

              // Successfully updated status. Now deduct stock.
              for (const item of order.items) {
                const product = await tx.product.findUnique({ where: { id: item.productId } });
                if (product) {
                  const newStock = Math.max(0, product.stock - item.quantity);
                  await tx.product.update({
                    where: { id: item.productId },
                    data: { stock: newStock },
                  });
                }
              }
            });

            await AuditService.logStep(rzpOrderId, "payment_captured", `Order ${order.id} marked as PAYMENT_CAPTURED via webhook`);
            await AuditService.logStep(rzpOrderId, "inventory_updated", `Webhook: Deducted items for order ${order.id}`);
            await AuditService.logStep(rzpOrderId, "order_confirmed", `Order ${order.id} confirmed successfully via webhook`);
          } catch (txError: any) {
            if (txError.message === "ALREADY_PROCESSED") {
              await AuditService.logStep(
                rzpOrderId,
                "order_confirmed",
                `Webhook concurrent duplicate event detected. Order ${order.id} was already captured. Skipping updates.`
              );
              return NextResponse.json({ success: true, message: "Webhook processed idempotently." });
            }
            throw txError;
          }

          // Sync session state to POLICY_AUTHORIZED on webhook success
          try {
            const sessions = await prisma.sessionState.findMany();
            for (const session of sessions) {
              const intent = session.buyerIntent as any;
              if (intent && intent.authorizationStatus) {
                // If this session was awaiting this checkout
                if (session.selectedProductId === order.items[0]?.productId) {
                  intent.authorizationStatus.value = "POLICY_AUTHORIZED";
                  await SessionStateService.saveSession(
                    session.id,
                    intent,
                    session.selectedProductId,
                    session.relaxationDecisions,
                    "POLICY_AUTHORIZED"
                  );
                  break;
                }
              }
            }
          } catch {}

        } else {
          console.warn(`[Razorpay Webhook] Order matching Razorpay ID ${rzpOrderId} not found in database.`);
        }
      }
    }

    // Handle payment.failed event
    if (event === "payment.failed") {
      await AuditService.logStep(
        rzpOrderId || "unknown-session",
        "webhook_received",
        `Processing failed payment: ${rzpPaymentId}`
      );

      if (rzpOrderId) {
        const order = await prisma.order.findFirst({
          where: { razorpayOrderId: rzpOrderId },
          include: { items: true },
        });

        if (order && order.status === "PENDING_PAYMENT") {
          await prisma.order.update({
            where: { id: order.id },
            data: {
              status: "PAYMENT_FAILED",
              razorpayPaymentId: rzpPaymentId,
              razorpaySignature: signature || "webhook_failed",
            },
          });

          await AuditService.logStep(rzpOrderId, "payment_failed", `Order ${order.id} marked as PAYMENT_FAILED via webhook`);

          // Sync session state to NONE
          try {
            const sessions = await prisma.sessionState.findMany();
            for (const session of sessions) {
              const intent = session.buyerIntent as any;
              if (session.selectedProductId === order.items[0]?.productId) {
                if (intent && intent.authorizationStatus) {
                  intent.authorizationStatus.value = "NONE";
                  await SessionStateService.saveSession(
                    session.id,
                    intent,
                    session.selectedProductId,
                    session.relaxationDecisions,
                    "NONE"
                  );
                  break;
                }
              }
            }
          } catch {}
        }
      }
    }

    return NextResponse.json({ success: true, event }, { status: 200 });
  } catch (error) {
    console.error("[Razorpay Webhook] Error processing webhook event:", error);
    return NextResponse.json({ error: "Webhook handling failed" }, { status: 500 });
  }
}
