import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { MerchantService } from "../../../services/merchantService";
import { PolicyEngine, OrderContext, UserPolicyData } from "../../../services/policyEngine";
import { PaymentService } from "../../../services/paymentService";
import { AuditService } from "../../../services/auditService";
import { SessionStateService } from "../../../services/sessionStateService";
import { InMemoryOrderStore } from "../../../services/inMemoryOrderStore";


export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, productId, size, quantity = 1, originalPrice, authorizationStatus } = body;

    const activeSessionId = sessionId || `session_${Math.random().toString(36).substring(2, 12)}`;
    await AuditService.logStep(activeSessionId, "checkout_requested", `Initiating checkout for product ID: ${productId}, size: ${size}`);

    // 1. Fresh Database Availability Check
    const isDbOnline = await MerchantService.isDatabaseAvailable();
    if (!isDbOnline && process.env.FORCE_DB_AVAILABLE === "false") {
      await AuditService.logStep(activeSessionId, "checkout_blocked", "Database offline during checkout. Blocking order creation.");
      return NextResponse.json(
        { error: "Unable to verify the current product state. Purchase blocked for safety." },
        { status: 400 }
      );
    }

    // 1.5. Session state product ID consistency check
    // SessionStateService always falls back to in-memory, so this works regardless of DB state.
    const storedSession = await SessionStateService.getSession(activeSessionId);
    if (!storedSession || !storedSession.selectedProductId || storedSession.selectedProductId !== productId) {
      await AuditService.logStep(activeSessionId, "checkout_blocked", `Checkout failed: Product ID mismatch or stale staged product state. Requested: ${productId}, Staged: ${storedSession?.selectedProductId}`);
      return NextResponse.json(
        { error: "Stale staged-product state or mismatched product ID. Checkout blocked." },
        { status: 400 }
      );
    }

    // 2. Product Lookup — DB preferred, in-memory static catalog as fallback.
    let product: {
      id: string; name: string; category: string; color: string;
      sizes: number[]; price: number; stock: number; active: boolean;
      merchantId: string;
      merchant: { name: string };
    } | null = null;

    if (isDbOnline) {
      product = await prisma.product.findUnique({
        where: { id: productId },
        include: { merchant: true },
      });
    } else {
      // DB offline: use static mock catalog as read-only source of truth.
      const mockProd = MerchantService.getMockProductById(productId);
      if (mockProd) {
        product = {
          id: mockProd.id,
          name: mockProd.name,
          category: mockProd.category,
          color: mockProd.color,
          sizes: mockProd.sizes,
          price: mockProd.price,
          stock: mockProd.stock,
          active: mockProd.active,
          merchantId: mockProd.merchantId,
          merchant: { name: mockProd.merchantName },
        };
      }
    }

    if (!product) {
      await AuditService.logStep(activeSessionId, "checkout_blocked", `Checkout failed: Product ${productId} not found.`);
      return NextResponse.json({ error: "Product not found." }, { status: 400 });
    }

    // 3. Product Active Check
    if (!product.active) {
      await AuditService.logStep(activeSessionId, "checkout_blocked", `Checkout failed: Product '${product.name}' is inactive.`);
      return NextResponse.json({ error: "Product is inactive." }, { status: 400 });
    }

    // 4. Fresh Inventory Check
    if (product.stock < quantity) {
      await AuditService.logStep(activeSessionId, "checkout_blocked", `Checkout failed: Product '${product.name}' is out of stock.`);
      return NextResponse.json({ error: "Product is out of stock." }, { status: 400 });
    }

    // 5. Size Availability Check
    if (!product.sizes.includes(size)) {
      await AuditService.logStep(activeSessionId, "checkout_blocked", `Checkout failed: Requested size ${size} is unavailable.`);
      return NextResponse.json({ error: `Requested size ${size} is unavailable.` }, { status: 400 });
    }

    // 6. Load User Policy (Category, Merchant, Payment, Autonomy, Budget Rules)
    let policy: UserPolicyData = PolicyEngine.getPolicyMemory();

    if (isDbOnline) {
      try {
        const dbPolicy = await prisma.userPolicy.findUnique({
          where: { id: "default-policy" },
        });
        if (dbPolicy) {
          policy = {
            id: dbPolicy.id,
            maxBudget: dbPolicy.maxBudget,
            allowedCategories: dbPolicy.allowedCategories,
            allowedMerchants: dbPolicy.allowedMerchants,
            allowedPaymentMethods: dbPolicy.allowedPaymentMethods,
            autonomyLevel: dbPolicy.autonomyLevel,
          };
        }
      } catch {
        // Fallback defaults already set above
      }
    }

    // 7. Price Tampering Check (authoritative price comes from product database, compared with originalPrice)
    const contextPrice = product.price;
    const initialPrice = originalPrice !== undefined ? originalPrice : product.price;

    const orderContext: OrderContext = {
      productId: product.id,
      productName: product.name,
      category: product.category,
      price: contextPrice,
      originalPrice: initialPrice,
      quantity,
      size,
      color: product.color,
      merchantId: product.merchantId,
      merchantName: product.merchant.name,
      stock: product.stock,
      paymentMethod: "UPI",
      authorizationStatus: authorizationStatus || "NONE",
    };

    // 8. Run PolicyEngine Validation Check Again (ALWAYS — security gate independent of DB)
    await AuditService.logStep(activeSessionId, "checkout_policy_validation", "Running final safety policy checks");
    const policyResult = PolicyEngine.validate(orderContext, policy);

    if (policyResult.decision === "BLOCK") {
      await AuditService.logStep(activeSessionId, "checkout_blocked", `Checkout blocked by policy: ${policyResult.reason}`);
      return NextResponse.json({ error: policyResult.reason, decision: "BLOCK" }, { status: 400 });
    }

    if (policyResult.decision === "ASK_USER") {
      await AuditService.logStep(activeSessionId, "checkout_blocked", `Checkout blocked: requires user confirmation. ${policyResult.reason}`);
      return NextResponse.json({ error: policyResult.reason, decision: "ASK_USER" }, { status: 400 });
    }

    // 9. Create internal Order record — DB preferred, in-memory fallback when offline.
    const totalAmount = contextPrice * quantity;
    let orderId: string;

    if (isDbOnline) {
      const internalOrder = await prisma.order.create({
        data: {
          status: "CREATED",
          totalAmount,
          currency: "INR",
          buyerName: "Shopper",
          shippingAddress: "Sandbox Test Address",
          items: {
            create: {
              productId: product.id,
              quantity,
              size,
              color: product.color,
              price: contextPrice,
            },
          },
        },
      });
      orderId = internalOrder.id;
    } else {
      // DB offline: create order in in-memory store.
      const memOrder = InMemoryOrderStore.create({
        productId: product.id,
        quantity,
        size,
        color: product.color,
        price: contextPrice,
        totalAmount,
      });
      orderId = memOrder.id;
    }

    // 10. Call PaymentService to create Razorpay Order (converting rupees to paise)
    const rzpOrder = await PaymentService.createRazorpayOrder({
      amount: totalAmount,
      currency: "INR",
      receipt: `receipt_${orderId.substring(0, 10)}`,
    });

    // 11. Transition status to 'PENDING_PAYMENT' and store Razorpay Order ID
    if (isDbOnline) {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          razorpayOrderId: rzpOrder.id,
          status: "PENDING_PAYMENT",
        },
      });
    } else {
      InMemoryOrderStore.update(orderId, {
        razorpayOrderId: rzpOrder.id,
        status: "PENDING_PAYMENT",
      });
    }

    await AuditService.logStep(
      activeSessionId,
      "razorpay_order_created",
      `Razorpay Order ${rzpOrder.id} created successfully for amount ₹${totalAmount}`
    );

    // Sync session state with checkout approval
    if (storedSession && storedSession.buyerIntent) {
      storedSession.buyerIntent.authorizationStatus.value = "APPROVED_FOR_CHECKOUT";
      await SessionStateService.saveSession(
        activeSessionId,
        storedSession.buyerIntent,
        productId,
        storedSession.relaxationDecisions,
        "APPROVED_FOR_CHECKOUT"
      );
    }

    return NextResponse.json({
      orderId,
      razorpayOrderId: rzpOrder.id,
      amount: rzpOrder.amount, // in paise
      currency: "INR",
      keyId: process.env.RAZORPAY_KEY_ID || "rzp_test_placeholder",
    });
  } catch (error) {
    console.error("[Checkout API] Failed to initiate order:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
