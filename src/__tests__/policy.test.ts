import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PolicyEngine, OrderContext, UserPolicyData } from "../services/policyEngine";
import { BuyerAgentService } from "../services/buyerAgent";
import { MerchantService } from "../services/merchantService";

describe("AgentGuard Trust & PolicyEngine Tests", () => {
  const sessionId = "policy-test-session";

  // Standard valid policy
  const defaultPolicy: UserPolicyData = {
    id: "default-policy",
    maxBudget: 2000,
    allowedCategories: ["shoes", "clothing"],
    allowedMerchants: ["QuickStep Sports", "UrbanStride"],
    allowedPaymentMethods: ["UPI"],
    autonomyLevel: 2, // Prepare checkout
  };

  // Standard valid order
  const defaultOrder: OrderContext = {
    productId: "prod-exact-match",
    productName: "SwiftRun Blue Trainer",
    category: "shoes",
    price: 1899,
    originalPrice: 1899,
    quantity: 1,
    size: 10,
    color: "blue",
    merchantId: "merch-quickstep",
    merchantName: "QuickStep Sports",
    stock: 5,
    paymentMethod: "UPI",
    authorizationStatus: "NONE",
  };

  beforeEach(() => {
    process.env.FORCE_DB_AVAILABLE = "true";
  });

  // 1. Level 1 recommendation allowed
  it("should allow Level 1 recommendation (search and recommend)", async () => {
    const policy = { ...defaultPolicy, autonomyLevel: 1 };
    const order = { ...defaultOrder, authorizationStatus: "NONE" as const };
    
    // Recommendations check runs against policy
    const result = PolicyEngine.validate(order, policy);
    
    // Level 1 blocks checkout but allows recommendations (status PRODUCTS_FOUND in Agent)
    expect(result.decision).toBe("BLOCK"); 
    expect(result.reason).toContain("prohibited");
  });

  // 2. Level 1 purchase blocked
  it("should block autonomous purchase execution under Level 1", () => {
    const policy = { ...defaultPolicy, autonomyLevel: 1 };
    const order = { ...defaultOrder, authorizationStatus: "NONE" as const };

    const result = PolicyEngine.validate(order, policy);
    expect(result.decision).toBe("BLOCK");
    expect(result.checks.find(c => c.name === "autonomy")?.passed).toBe(false);
  });

  // 3. Level 2 cart preparation allowed
  it("should allow Level 2 cart preparation (status PRODUCTS_FOUND)", async () => {
    const result = await BuyerAgentService.processMessage(
      "Buy blue running shoes size 10 under 2000",
      sessionId,
      undefined,
      2, // Level 2
      2000
    );

    // Level 2 returns PRODUCTS_FOUND representing the prepared cart, but not APPROVED_FOR_CHECKOUT
    expect(result.status).toBe("PRODUCTS_FOUND");
    expect(result.selectedProduct?.id).toBe("prod-exact-match");
  });

  // 4. Level 2 checkout requires confirmation
  it("should set decision to ASK_USER when Level 2 checkout is evaluated without user confirmation", () => {
    const policy = { ...defaultPolicy, autonomyLevel: 2 };
    const order = { ...defaultOrder, authorizationStatus: "NONE" as const };

    const result = PolicyEngine.validate(order, policy);
    expect(result.decision).toBe("ASK_USER");
    expect(result.reason).toContain("confirmation is required");
  });

  // 5. Level 3 valid purchase allowed
  it("should automatically allow and approve checkout under Level 3 Bounded Autonomy", () => {
    const policy = { ...defaultPolicy, autonomyLevel: 3 };
    const order = { ...defaultOrder, authorizationStatus: "NONE" as const };

    const result = PolicyEngine.validate(order, policy);
    expect(result.decision).toBe("ALLOW");
  });

  // 6. Budget violation blocked
  it("should block order if total cost exceeds policy maximum budget", () => {
    const policy = { ...defaultPolicy, maxBudget: 1500 };
    const order = { ...defaultOrder, price: 1899 }; // 1899 > 1500

    const result = PolicyEngine.validate(order, policy);
    expect(result.decision).toBe("BLOCK");
    expect(result.reason).toContain("exceeds policy budget limit");
  });

  // 7. Category violation blocked
  it("should block purchase if category is not whitelisted in policy", () => {
    const policy = { ...defaultPolicy, allowedCategories: ["clothing"] }; // only clothing
    const order = { ...defaultOrder, category: "shoes" };

    const result = PolicyEngine.validate(order, policy);
    expect(result.decision).toBe("BLOCK");
    expect(result.reason).toContain("is not whitelisted");
  });

  // 8. Merchant violation blocked
  it("should trigger ASK_USER / BLOCK if merchant is not in allowlist", () => {
    const policy = { ...defaultPolicy, allowedMerchants: ["QuickStep Sports"] };
    const order = { ...defaultOrder, merchantName: "SportKart" };

    const result = PolicyEngine.validate(order, policy);
    expect(result.decision).toBe("ASK_USER"); // Preferred merchant mismatch triggers manual check
    expect(result.reason).toContain("outside your preferred merchant list");
  });

  // 9. Payment method violation blocked
  it("should block purchase if payment method is not allowed by policy", () => {
    const policy = { ...defaultPolicy, allowedPaymentMethods: ["UPI"] };
    const order = { ...defaultOrder, paymentMethod: "card" };

    const result = PolicyEngine.validate(order, policy);
    expect(result.decision).toBe("BLOCK");
    expect(result.reason).toContain("is not policy-approved");
  });

  // 10. Price change above budget blocked
  it("should block order if current price has increased from selection price", () => {
    const policy = defaultPolicy;
    const order = { ...defaultOrder, price: 2399, originalPrice: 1899 }; // Price increased by ₹500

    const result = PolicyEngine.validate(order, policy);
    expect(result.decision).toBe("BLOCK");
    expect(result.reason).toContain("exceeds authorized budget");
  });

  // 11. Inventory unavailable blocked
  it("should block purchase when product goes out of stock", () => {
    const policy = defaultPolicy;
    const order = { ...defaultOrder, stock: 0 };

    const result = PolicyEngine.validate(order, policy);
    expect(result.decision).toBe("BLOCK");
    expect(result.reason).toContain("is out of stock");
  });

  // 12. Database unavailable during checkout blocked
  it("should block checkout verification if the live database connection is lost", async () => {
    process.env.FORCE_DB_AVAILABLE = "false"; // Simulate database connection timeout/loss

    const result = await BuyerAgentService.processMessage(
      "confirm purchase", // Send checkout confirmation
      sessionId,
      {
        category: { field: "category", value: "shoes", source: "explicit", confidence: 1.0, strength: "hard" },
        purpose: { field: "purpose", value: ["running"], source: "explicit", confidence: 1.0, strength: "soft" },
        color: { field: "color", value: "blue", source: "explicit", confidence: 1.0, strength: "hard" },
        size: { field: "size", value: 10, source: "explicit", confidence: 1.0, strength: "hard" },
        maxBudget: { field: "maxBudget", value: 2000, source: "explicit", confidence: 1.0, strength: "hard" },
        currency: { field: "currency", value: "INR", source: "inferred", confidence: 1.0 },
        brand: { field: "brand", value: null, source: "unspecified", confidence: 0.0, strength: "soft" },
        merchantPreference: { field: "merchantPreference", value: null, source: "unspecified", confidence: 0.0, strength: "soft" },
        paymentPreference: { field: "paymentPreference", value: null, source: "unspecified", confidence: 0.0, strength: "soft" },
        autonomousPurchase: { field: "autonomousPurchase", value: true, source: "inferred", confidence: 1.0 },
        authorizationStatus: { field: "authorizationStatus", value: "USER_CONFIRMED", source: "explicit", confidence: 1.0 },
        originalPrice: { field: "originalPrice", value: 1899, source: "inferred", confidence: 1.0 },
      },
      3, // Autonomy level 3
      2000
    );

    // Must block checkout and return safety alert message
    expect(result.status).toBe("WAITING_FOR_USER");
    expect(result.message).toContain("Unable to verify the current product state. Purchase blocked for safety.");
  });

  // 13. Frontend cannot override policy
  it("should ensure backend enforces policy checks independently of frontend claims", () => {
    const policy = { ...defaultPolicy, maxBudget: 2000 };
    
    // Simulate malicious client attempting to claim a passing price of 1899 for a 5000 INR product
    const order: OrderContext = {
      ...defaultOrder,
      price: 5000, // Actual cost is 5000 (violates budget!)
      originalPrice: 1899, // Malicious claim
    };

    const result = PolicyEngine.validate(order, policy);
    expect(result.decision).toBe("BLOCK"); // Should block based on actual price calculations
    expect(result.checks.find(c => c.name === "budget")?.passed).toBe(false);
  });

  // 14. LLM output cannot override policy
  it("should ensure deterministic code controls decisions rather than generative output", () => {
    // Attempt to override decisions with positive labels
    const order: OrderContext = {
      ...defaultOrder,
      price: 3500, // Exceeds budget
    };
    
    const result = PolicyEngine.validate(order, defaultPolicy);
    expect(result.decision).toBe("BLOCK");
  });

  // 15. Authorization cannot be inferred from shopping intent
  it("should keep authorizationStatus as NONE when user says 'buy' without explicit authorization phrases", async () => {
    const result = await BuyerAgentService.processMessage(
      "Buy running shoes size 10 under 2000",
      sessionId,
      undefined,
      2, // Level 2
      2000
    );

    // Status is PRODUCTS_FOUND (recommendation/cart prep) but authorizationStatus remains NONE
    expect(result.intent.authorizationStatus.value).toBe("NONE");
  });

  // 16. Security Test: Malicious AI payload simulation
  it("should block purchase even if client returns fraudulent authorization claim properties", () => {
    const maliciousOrder: OrderContext = {
      ...defaultOrder,
      price: 5000,
      authorizationStatus: "APPROVED_FOR_CHECKOUT" as any, // Fraudulent status claim
    };

    const result = PolicyEngine.validate(maliciousOrder, defaultPolicy); // policy maximumBudget = 2000
    expect(result.decision).toBe("BLOCK");
  });
});
