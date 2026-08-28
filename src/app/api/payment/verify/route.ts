import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { PaymentService } from "../../../../services/paymentService";
import { AuditService } from "../../../../services/auditService";
import { SessionStateService } from "../../../../services/sessionStateService";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature, sessionId } = body;

    const activeSessionId = sessionId || `session_${Math.random().toString(36).substring(2, 12)}`;
    await AuditService.logStep(activeSessionId, "payment_verification_started", `Verifying signature for Order ID: ${orderId}`);

    // 1. Fetch internal order
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      await AuditService.logStep(activeSessionId, "payment_failed", `Verification failed: Order ${orderId} not found.`);
      return NextResponse.json({ error: "Order not found." }, { status: 400 });
    }

    // Idempotency: If already paid, return success immediately
    if (order.status === "PAYMENT_CAPTURED") {
      await AuditService.logStep(activeSessionId, "order_confirmed", `Order ${orderId} was already confirmed. Skipping double updates.`);
      return NextResponse.json({ success: true, message: "Order already verified and paid." });
    }

    // 2. Perform Server-side HMAC signature check
    const isValid = PaymentService.verifyPaymentSignature(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature
    );

    if (!isValid) {
      await AuditService.logStep(activeSessionId, "payment_failed", `Signature check failed for order ${orderId}`);
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: "PAYMENT_FAILED",
          razorpayPaymentId,
          razorpaySignature,
        },
      });
      await AuditService.logStep(activeSessionId, "payment_failed", `Order ${orderId} marked as PAYMENT_FAILED`);

      // Sync session state to failure
      const storedSession = await SessionStateService.getSession(activeSessionId);
      if (storedSession && storedSession.buyerIntent) {
        storedSession.buyerIntent.authorizationStatus.value = "NONE";
        await SessionStateService.saveSession(
          activeSessionId,
          storedSession.buyerIntent,
          storedSession.selectedProductId,
          storedSession.relaxationDecisions,
          "NONE"
        );
      }

      return NextResponse.json({ error: "Invalid payment signature." }, { status: 400 });
    }

    // 3. Signature is valid: Run database transaction to update status & decrement stock atomically
    await AuditService.logStep(activeSessionId, "payment_signature_valid", `Signature validated successfully`);

    try {
      await prisma.$transaction(async (tx) => {
        // Optimistic locking update: only update if order status is PENDING_PAYMENT
        const updated = await tx.order.updateMany({
          where: {
            id: orderId,
            status: "PENDING_PAYMENT"
          },
          data: {
            status: "PAYMENT_CAPTURED",
            razorpayPaymentId,
            razorpaySignature,
          }
        });

        if (updated.count === 0) {
          throw new Error("ALREADY_PROCESSED");
        }

        // Successfully updated status. Now deduct stock atomically.
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stock: {
                decrement: item.quantity,
              },
            },
          });
        }
      });

      await AuditService.logStep(activeSessionId, "payment_captured", `Order ${orderId} successfully captured`);
      await AuditService.logStep(activeSessionId, "inventory_updated", `Deducted stock for items in order ${orderId}`);
      await AuditService.logStep(activeSessionId, "order_confirmed", `Transaction complete. Order ${orderId} confirmed.`);

      // Sync session state to POLICY_AUTHORIZED
      const storedSession = await SessionStateService.getSession(activeSessionId);
      if (storedSession && storedSession.buyerIntent) {
        storedSession.buyerIntent.authorizationStatus.value = "POLICY_AUTHORIZED";
        await SessionStateService.saveSession(
          activeSessionId,
          storedSession.buyerIntent,
          storedSession.selectedProductId,
          storedSession.relaxationDecisions,
          "POLICY_AUTHORIZED"
        );
      }

      return NextResponse.json({ success: true, message: "Payment verified successfully." });
    } catch (txError: any) {
      if (txError.message === "ALREADY_PROCESSED") {
        await AuditService.logStep(activeSessionId, "order_confirmed", `Order ${orderId} was already captured concurrently. Skipping double updates.`);
        return NextResponse.json({ success: true, message: "Order already verified and paid." });
      }
      throw txError;
    }
  } catch (error) {
    console.error("[Payment Verify API] Execution crashed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
