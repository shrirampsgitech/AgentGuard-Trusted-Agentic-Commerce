import { NextRequest, NextResponse } from "next/server";
import { SessionStateService } from "../../../services/sessionStateService";
import { AuditService } from "../../../services/auditService";
import { MerchantService } from "../../../services/merchantService";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId parameter" }, { status: 400 });
    }

    const session = await SessionStateService.getSession(sessionId);
    const logs = await AuditService.getLogs(sessionId);

    let productDetails = null;
    if (session?.selectedProductId) {
      productDetails = await MerchantService.getProductById(session.selectedProductId);
    }

    return NextResponse.json({
      success: true,
      session: session ? {
        sessionId: session.id,
        intent: session.buyerIntent,
        selectedProduct: productDetails || undefined,
        relaxationDecisions: session.relaxationDecisions,
        authorizationState: session.authorizationState,
      } : null,
      auditLogs: logs,
    });
  } catch (error) {
    console.error("[API Session] Fetch failed:", error);
    return NextResponse.json({ error: "Failed to fetch session" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, intent, selectedProductId, relaxationDecisions, authorizationState } = body;

    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId parameter" }, { status: 400 });
    }

    const session = await SessionStateService.saveSession(
      sessionId,
      intent,
      selectedProductId,
      relaxationDecisions || [],
      authorizationState || "NONE"
    );

    return NextResponse.json({ success: true, session });
  } catch (error) {
    console.error("[API Session] Update failed:", error);
    return NextResponse.json({ error: "Failed to update session" }, { status: 500 });
  }
}
