import { NextRequest, NextResponse } from "next/server";
import { BuyerAgentService } from "../../../services/buyerAgent";
import { prisma } from "../../../lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, sessionId, sessionIntent, policyAutonomy: clientAutonomy, policyLimit: clientLimit } = body;
    
    const activeSessionId = sessionId || `session_${Math.random().toString(36).substring(2, 12)}`;

    // Safe query to load User Policy
    let policyAutonomy = clientAutonomy !== undefined ? clientAutonomy : 2; // Default: 'Prepare' (Lvl 2)
    let policyLimit = clientLimit !== undefined ? clientLimit : 2000;  // Default: ₹2,000 budget cap

    try {
      const policy = await prisma.userPolicy.findUnique({
        where: { id: "default-policy" },
      });
      if (policy) {
        // If DB has explicit configs, we can use them
        policyAutonomy = policy.autonomyLevel;
        policyLimit = policy.maxBudget;
      }
    } catch {
      // Safe fallback if database connection is offline
    }

    const agentResult = await BuyerAgentService.processMessage(
      message,
      activeSessionId,
      sessionIntent,
      policyAutonomy,
      policyLimit
    );

    // Retrieve full audit timeline from database
    const { AuditService } = require("../../../services/auditService");
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
