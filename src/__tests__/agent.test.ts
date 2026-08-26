import { describe, it, expect, beforeAll } from "vitest";
import { BuyerAgentService } from "../services/buyerAgent";
import { AuditService } from "../services/auditService";

describe("AgentGuard Buyer Agent Reasoning Tests", () => {
  const sessionId = "test-session-agent";

  beforeAll(() => {
    AuditService.clearMemoryLogs();
    process.env.FORCE_DB_AVAILABLE = "true";
  });

  // 1. Complete exact-match request
  it("should find an exact match for blue running shoes size 10 under ₹2,000", async () => {
    const result = await BuyerAgentService.processMessage(
      "Blue running shoes, size 10, under ₹2,000.",
      sessionId,
      undefined,
      2, // Autonomy Lvl 2
      2000
    );

    console.log("DIAGNOSTIC result:", JSON.stringify(result, null, 2));

    expect(result.status).toBe("PRODUCTS_FOUND");
    expect(result.needsClarification).toBe(false);
    expect(result.selectedProduct).toBeDefined();
    expect(result.selectedProduct?.id).toBe("prod-exact-match");
    expect(result.selectedProduct?.price).toBeLessThanOrEqual(2000);
    expect(result.selectedProduct?.color).toBe("blue");
  });

  // 2. Missing size
  it("should block purchase and request clarification when size is missing", async () => {
    const result = await BuyerAgentService.processMessage(
      "Buy running shoes under ₹3,000.",
      sessionId,
      undefined,
      2,
      3000
    );

    expect(result.status).toBe("NEEDS_CLARIFICATION");
    expect(result.needsClarification).toBe(true);
    expect(result.clarificationQuestion).toContain("size");
  });

  // 3. No exact color match (Color conflict)
  it("should propose compromises when there is no exact color match", async () => {
    // If user asks for grey running shoes size 10 under ₹2,000,
    // and Nimbus Grey is stock=0, it should suggest Red, Blue as color alternatives
    const result = await BuyerAgentService.processMessage(
      "Grey running shoes, size 10, under ₹2,000.",
      sessionId,
      undefined,
      2,
      2000
    );

    expect(result.status).toBe("NO_EXACT_MATCH");
    expect(result.alternatives.length).toBeGreaterThan(0);
    
    const colorViolations = result.alternatives.filter(a => a.violatedConstraint === "color");
    expect(colorViolations.length).toBeGreaterThan(0);
    expect(colorViolations[0].explanation).toContain("Color differs");
  });

  // 4. Budget conflict
  it("should detect and report budget constraint violations", async () => {
    // If user search triggers 'TrailBlazer Premium Runner' which costs ₹2,499,
    // and user asks for size 10 under 1500, it violates budget
    const result = await BuyerAgentService.processMessage(
      "Blue running shoes, size 12, under ₹2,000.",
      sessionId,
      undefined,
      2,
      2000
    );

    expect(result.status).toBe("NO_EXACT_MATCH");
    const budgetViolations = result.alternatives.filter(a => a.violatedConstraint === "budget");
    expect(budgetViolations.length).toBeGreaterThan(0);
    expect(budgetViolations[0].explanation).toContain("Exceeds budget limit");
    expect(budgetViolations[0].difference).toBe(499); // ₹2,499 - ₹2,000
  });

  // 5. Size conflict
  it("should detect and report size constraint conflicts", async () => {
    // If user asks for size 12 and the candidate only has other sizes
    const result = await BuyerAgentService.processMessage(
      "Black walking shoes, size 12, under ₹2,000.",
      sessionId,
      undefined,
      2,
      2000
    );

    expect(result.status).toBe("NO_EXACT_MATCH");
    const sizeViolations = result.alternatives.filter(a => a.violatedConstraint === "size");
    expect(sizeViolations.length).toBeGreaterThan(0);
    expect(sizeViolations[0].explanation).toContain("Size mismatch");
  });

  // 6. Out-of-stock exact product
  it("should reject out-of-stock exact match and search for alternatives", async () => {
    // Nimbus Blue Shadow (prod-out-of-stock) is exactly Blue, Size 10, Running, under 2000, but stock=0
    // If user searches for blue running shoe under ₹1,700 size 10
    const result = await BuyerAgentService.processMessage(
      "Blue running shoe, size 10, under ₹1,700.",
      sessionId,
      undefined,
      2,
      1700
    );

    expect(result.status).toBe("NO_EXACT_MATCH");
    // Should list alternatives that have stock
    expect(result.alternatives.every(a => a.product.id !== "prod-out-of-stock" || a.violatedConstraint === "stock")).toBe(true);
  });

  // 7. User approves color relaxation
  it("should rerun search with color flexed when user relaxes color constraint", async () => {
    // Step 1: Initial query (fails color check)
    const initialResult = await BuyerAgentService.processMessage(
      "Grey running shoes, size 10, under ₹2,000.",
      sessionId,
      undefined,
      2,
      2000
    );
    expect(initialResult.status).toBe("NO_EXACT_MATCH");

    // Step 2: User says color doesn't matter, passing previous intent
    const followUpResult = await BuyerAgentService.processMessage(
      "Color doesn't matter.",
      sessionId,
      initialResult.intent,
      2,
      2000
    );

    expect(followUpResult.intent.color.value).toBeNull();
    expect(followUpResult.intent.color.source).toBe("inferred");
    expect(followUpResult.status).toBe("PRODUCTS_FOUND");
    expect(followUpResult.selectedProduct?.id).toBe("prod-alt-color");
  });

  // 8. User rejects relaxation
  it("should not make a purchase decision if user rejects relaxation", async () => {
    const result = await BuyerAgentService.processMessage(
      "Keep the blue requirement.",
      sessionId,
      {
        category: { field: "category", value: "shoes", source: "explicit", confidence: 1.0 },
        purpose: { field: "purpose", value: ["running"], source: "explicit", confidence: 1.0 },
        color: { field: "color", value: null, source: "inferred", confidence: 1.0 }, // previously relaxed
        size: { field: "size", value: 10, source: "explicit", confidence: 1.0 },
        maxBudget: { field: "maxBudget", value: 2000, source: "explicit", confidence: 1.0 },
        currency: { field: "currency", value: "INR", source: "inferred", confidence: 1.0 },
        brand: { field: "brand", value: null, source: "unspecified", confidence: 0.0 },
        autonomousPurchase: { field: "autonomousPurchase", value: true, source: "inferred", confidence: 1.0 },
      } as any,
      2,
      2000
    );

    // Color gets restored to blue, and we find exact matches
    expect(result.intent.color.value).toBe("blue");
    expect(result.intent.color.source).toBe("explicit");
    expect(result.status).toBe("PRODUCTS_FOUND");
  });

  // 9. Brand unspecified
  it("should not invent a brand preference if unspecified", async () => {
    const result = await BuyerAgentService.processMessage(
      "Blue running shoes, size 10, under ₹2,000.",
      sessionId,
      undefined,
      2,
      2000
    );

    expect(result.intent.brand.value).toBeNull();
    expect(result.intent.brand.source).toBe("unspecified");
  });

  // 10. Autonomy Level 1
  it("should only recommend (PRODUCTS_FOUND) when autonomy level is Lvl 1 Recommend", async () => {
    const result = await BuyerAgentService.processMessage(
      "Buy blue running shoes, size 10, under ₹2,000.",
      sessionId,
      undefined,
      1, // Autonomy Level 1
      2000
    );

    expect(result.status).toBe("PRODUCTS_FOUND"); // and not APPROVED_FOR_CHECKOUT
    expect(result.selectedProduct).toBeDefined();
  });

  // 11. Autonomy Level 2
  it("should prepare the cart but require user check out click for Autonomy Level 2 Prepare", async () => {
    const result = await BuyerAgentService.processMessage(
      "Buy blue running shoes, size 10, under ₹2,000.",
      sessionId,
      undefined,
      2, // Autonomy Level 2
      2000
    );

    expect(result.status).toBe("PRODUCTS_FOUND"); // requires manual approval click
    expect(result.selectedProduct).toBeDefined();
  });

  // 12. Autonomy Level 3
  it("should reach APPROVED_FOR_CHECKOUT status for Autonomy Level 3 Autonomous Purchase", async () => {
    const result = await BuyerAgentService.processMessage(
      "Buy blue running shoes, size 10, under ₹2,000.",
      sessionId,
      undefined,
      3, // Autonomy Level 3
      2000
    );

    expect(result.status).toBe("APPROVED_FOR_CHECKOUT"); // Approved automatically!
    expect(result.selectedProduct).toBeDefined();
  });
});
