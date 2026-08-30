import { NextRequest, NextResponse } from "next/server";
import { BuyerAgentService } from "../../../services/buyerAgent";
import { SessionStateService } from "../../../services/sessionStateService";
import { prisma } from "../../../lib/prisma";
import { AuditService } from "../../../services/auditService";
import { PolicyEngine } from "../../../services/policyEngine";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, sessionId, sessionIntent, policyAutonomy: clientAutonomy, policyLimit: clientLimit } = body;
    
    const activeSessionId = sessionId || `session_${Math.random().toString(36).substring(2, 12)}`;

    // Safe query to load User Policy
    const defaultPolicy = PolicyEngine.getPolicyMemory();
    let policyAutonomy = clientAutonomy !== undefined ? clientAutonomy : defaultPolicy.autonomyLevel;
    let policyLimit = clientLimit !== undefined ? clientLimit : defaultPolicy.maxBudget;

    try {
      const policy = await prisma.userPolicy.findUnique({
        where: { id: "default-policy" },
      });
      if (policy) {
        policyAutonomy = policy.autonomyLevel;
        policyLimit = policy.maxBudget;
      }
    } catch {
      // Safe fallback if database connection is offline: use memory cache values
      const fallbackPolicy = PolicyEngine.getPolicyMemory();
      policyAutonomy = fallbackPolicy.autonomyLevel;
      policyLimit = fallbackPolicy.maxBudget;
    }

    // Load persistent session state if it exists
    const storedSession = await SessionStateService.getSession(activeSessionId);
    const previousIntent = storedSession?.buyerIntent || sessionIntent;

    const agentResult = await BuyerAgentService.processMessage(
      message,
      activeSessionId,
      previousIntent,
      policyAutonomy,
      policyLimit
    );

    // Persist updated intent & selected product back to database
    await SessionStateService.saveSession(
      activeSessionId,
      agentResult.intent,
      agentResult.selectedProduct ? agentResult.selectedProduct.id : null,
      storedSession?.relaxationDecisions || [],
      agentResult.intent.authorizationStatus.value
    );

    // Retrieve full audit timeline
    const logs = await AuditService.getLogs(activeSessionId);

    return NextResponse.json(
      {
        sessionId: activeSessionId,
        auditLogs: logs,
        ...agentResult,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[API Chat] Orchestration execution failed:", error);
    return NextResponse.json({ error: "Failed to parse chat instruction" }, { status: 500 });
  }
}
