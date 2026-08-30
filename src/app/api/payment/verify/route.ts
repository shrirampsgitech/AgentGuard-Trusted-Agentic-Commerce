import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { PaymentService } from "../../../../services/paymentService";
import { AuditService } from "../../../../services/auditService";
import { SessionStateService } from "../../../../services/sessionStateService";
import { MerchantService } from "../../../../services/merchantService";
import { InMemoryOrderStore } from "../../../../services/inMemoryOrderStore";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature, sessionId } = body;

    const activeSessionId = sessionId || `session_${Math.random().toString(36).substring(2, 12)}`;
    await AuditService.logStep(activeSessionId, "payment_verification_started", `Verifying signature for Order ID: ${orderId}`);

    // Determine which data store holds this order.
    const isDbOnline = await MerchantService.isDatabaseAvailable();

    // 1. Fetch internal order — DB preferred, in-memory fallback when offline.
    let order: {
      id: string;
      status: string;
      items: { productId: string; quantity: number }[];
    } | null = null;

    if (isDbOnline) {
      const dbOrder = await prisma.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (dbOrder) {
        order = { id: dbOrder.id, status: dbOrder.status, items: dbOrder.items };
      }
    } else {
      // DB offline: look up from in-memory order store.
      const memOrder = InMemoryOrderStore.findById(orderId);
      if (memOrder) {
        order = { id: memOrder.id, status: memOrder.status, items: memOrder.items };
      }
    }

    if (!order) {
      await AuditService.logStep(activeSessionId, "payment_failed", `Verification failed: Order ${orderId} not found.`);
      return NextResponse.json({ error: "Order not found." }, { status: 400 });
    }

    // Idempotency: If already paid, return success immediately
    if (order.status === "PAYMENT_CAPTURED") {
      await AuditService.logStep(activeSessionId, "order_confirmed", `Order ${orderId} was already confirmed. Skipping double updates.`);
      return NextResponse.json({ success: true, message: "Order already verified and paid." });
    }

    // 2. Perform Server-side HMAC signature check (always — security gate independent of DB)
    const isValid = PaymentService.verifyPaymentSignature(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature
    );

    if (!isValid) {
      await AuditService.logStep(activeSessionId, "payment_failed", `Signature check failed for order ${orderId}`);

      // Mark order as PAYMENT_FAILED in whichever store holds it.
      if (isDbOnline) {
        await prisma.order.update({
          where: { id: orderId },
          data: {
            status: "PAYMENT_FAILED",
            razorpayPaymentId,
            razorpaySignature,
          },
        });
      } else {
        InMemoryOrderStore.update(orderId, {
          status: "PAYMENT_FAILED",
          razorpayPaymentId,
          razorpaySignature,
        });
      }
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

    // 3. Signature is valid: Capture order and decrement stock atomically.
    await AuditService.logStep(activeSessionId, "payment_signature_valid", `Signature validated successfully`);

    if (isDbOnline) {
      // DB path: full atomic transaction with optimistic locking.
      try {
        await prisma.$transaction(async (tx) => {
          // Optimistic locking: only update if order is still in PENDING_PAYMENT state.
          const updated = await tx.order.updateMany({
            where: { id: orderId, status: "PENDING_PAYMENT" },
            data: {
              status: "PAYMENT_CAPTURED",
              razorpayPaymentId,
              razorpaySignature,
            },
          });

          if (updated.count === 0) {
            throw new Error("ALREADY_PROCESSED");
          }

          // Deduct stock atomically.
          for (const item of order!.items) {
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { decrement: item.quantity } },
            });
          }
        });
      } catch (txError: any) {
        if (txError.message === "ALREADY_PROCESSED") {
          await AuditService.logStep(activeSessionId, "order_confirmed", `Order ${orderId} was already captured concurrently. Skipping double updates.`);
          return NextResponse.json({ success: true, message: "Order already verified and paid." });
        }
        throw txError;
      }
    } else {
      // In-memory path: atomic status transition guard (idempotency).
      const captured = InMemoryOrderStore.updateStatus(
        orderId,
        "PENDING_PAYMENT",
        "PAYMENT_CAPTURED",
        { razorpayPaymentId, razorpaySignature }
      );
      if (!captured) {
        // Already processed (e.g., concurrent call or status was already advanced).
        await AuditService.logStep(activeSessionId, "order_confirmed", `Order ${orderId} was already captured. Skipping double updates.`);
        return NextResponse.json({ success: true, message: "Order already verified and paid." });
      }
      // Deduct stock in-memory when database is offline.
      for (const item of order!.items) {
        MerchantService.decrementMockStock(item.productId, item.quantity);
      }
    }

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
  } catch (error) {
    console.error("[Payment Verify API] Execution crashed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
