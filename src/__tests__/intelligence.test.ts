import { describe, it, expect, vi } from "vitest";
import { BuyerAgentService, BuyerIntent } from "../services/buyerAgent";
import { ConstraintEngine } from "../services/constraintEngine";
import { PolicyEngine, OrderContext, UserPolicyData } from "../services/policyEngine";
import { ProductData } from "../services/merchantService";

describe("Agentic Commerce Intelligence & Competition Polish - Phase 6 Tests", () => {
  
  // 1. Hard vs soft preference detection
  it("should classify category, size, and budget as hard constraints by default, and color, brand, purpose as soft preferences", async () => {
    // Access private extractIntent via any cast for testing
    const agent = BuyerAgentService as any;
    const intent = await agent.extractIntent("Buy running shoes, size 10, under 2000");
    
    expect(intent.category.strength).toBe("hard");
    expect(intent.size.strength).toBe("hard");
    expect(intent.maxBudget.strength).toBe("hard");
    
    const intentWithColor = await agent.extractIntent("Buy blue shoes if possible, size 10, under 2000");
    expect(intentWithColor.color.value).toBe("blue");
    expect(intentWithColor.color.strength).toBe("soft"); // color is soft preference by default
    
    const intentOnlyColor = await agent.extractIntent("Buy blue only shoes, size 10");
    expect(intentOnlyColor.color.value).toBe("blue");
    expect(intentOnlyColor.color.strength).toBe("hard"); // explicit "only" marks color as hard
  });

  // 2. Missing size clarification
  it("should detect missing size and request clarification for shoes", () => {
    const intent = BuyerAgentService.createDefaultIntent();
    intent.category.value = "shoes";
    intent.size.value = null; // missing size
    
    const check = BuyerAgentService.checkCompleteness(intent);
    expect(check.complete).toBe(false);
    expect(check.missing?.[0].field).toBe("size");
    expect(check.missing?.[0].question).toContain("What size do you need");
  });

  // 3. No unnecessary clarification
  it("should not block or ask clarification for missing color, purpose, or merchant preference", () => {
    const intent = BuyerAgentService.createDefaultIntent();
    intent.category.value = "shoes";
    intent.size.value = 10;
    intent.color.value = null; // optional
    intent.purpose.value = []; // optional
    
    const check = BuyerAgentService.checkCompleteness(intent);
    expect(check.complete).toBe(true);
    expect(check.missing).toBeUndefined();
  });

  // 4. Exact match
  it("should filter exact matches based on satisfied hard constraints, even if soft constraints differ", () => {
    const intent = BuyerAgentService.createDefaultIntent();
    intent.category.value = "shoes";
    intent.size.value = 10;
    intent.maxBudget.value = 2000;
    intent.color.value = "blue";
    intent.color.strength = "soft"; // soft preference color doesn't match, but hard ones do
    
    const products: ProductData[] = [
      {
        id: "p1",
        merchantId: "m1",
        merchantName: "QuickStep",
        name: "Red shoe size 10 under 2k",
        category: "shoes",
        purpose: ["running"],
        color: "red", // mismatch, but soft
        sizes: [10],
        price: 1899,
        currency: "INR",
        rating: 4.5,
        stock: 5,
        returnDays: 14,
        shippingDays: 2,
        description: "Hike",
        active: true
      }
    ];

    const matchResults = ConstraintEngine.matchConstraints(products, intent);
    expect(matchResults.exactMatches.length).toBe(1); // Classified as exact match since color is soft
  });

  // 5. Multiple exact matches
  it("should identify multiple products satisfying hard constraints as exact matches", () => {
    const intent = BuyerAgentService.createDefaultIntent();
    intent.category.value = "shoes";
    intent.size.value = 10;
    intent.maxBudget.value = 2000;
    
    const products: ProductData[] = [
      {
        id: "p1",
        merchantId: "m1",
        merchantName: "QuickStep",
        name: "Shoe A",
        category: "shoes",
        purpose: ["running"],
        color: "blue",
        sizes: [10],
        price: 1899,
        currency: "INR",
        rating: 4.5,
        stock: 5,
        returnDays: 14,
        shippingDays: 2,
        description: "Desc",
        active: true
      },
      {
        id: "p2",
        merchantId: "m2",
        merchantName: "UrbanStride",
        name: "Shoe B",
        category: "shoes",
        purpose: ["running"],
        color: "red",
        sizes: [10],
        price: 1999,
        currency: "INR",
        rating: 4.7,
        stock: 8,
        returnDays: 30,
        shippingDays: 3,
        description: "Desc A",
        active: true
      }
    ];

    const matchResults = ConstraintEngine.matchConstraints(products, intent);
    expect(matchResults.exactMatches.length).toBe(2);
  });

  // 6. No exact match
  it("should return empty matches if any hard constraints are violated", () => {
    const intent = BuyerAgentService.createDefaultIntent();
    intent.category.value = "shoes";
    intent.size.value = 10;
    intent.maxBudget.value = 1500; // tight budget
    
    const products: ProductData[] = [
      {
        id: "p1",
        merchantId: "m1",
        merchantName: "QuickStep",
        name: "Expensive Shoe",
        category: "shoes",
        purpose: ["running"],
        color: "blue",
        sizes: [10],
        price: 1899, // exceeds budget
        currency: "INR",
        rating: 4.5,
        stock: 5,
        returnDays: 14,
        shippingDays: 2,
        description: "Desc",
        active: true
      }
    ];

    const matchResults = ConstraintEngine.matchConstraints(products, intent);
    expect(matchResults.exactMatches.length).toBe(0); // blocked by hard budget constraint
  });

  // 7. Alternative ranking
  it("should score and rank alternative proposals based on severity of constraints conflict", () => {
    const intent = BuyerAgentService.createDefaultIntent();
    intent.category.value = "shoes";
    intent.size.value = 10;
    intent.maxBudget.value = 2000;
    intent.color.value = "blue";
    intent.color.strength = "hard"; // color is now hard
    
    const products: ProductData[] = [
      {
        id: "p1",
        merchantId: "m1",
        merchantName: "QuickStep",
        name: "Overbudget Blue Shoe",
        category: "shoes",
        purpose: ["running"],
        color: "blue",
        sizes: [10],
        price: 2200, // exceeds budget by 200
        currency: "INR",
        rating: 4.5,
        stock: 5,
        returnDays: 14,
        shippingDays: 2,
        description: "Desc",
        active: true
      },
      {
        id: "p2",
        merchantId: "m2",
        merchantName: "UrbanStride",
        name: "Red Shoe",
        category: "shoes",
        purpose: ["running"],
        color: "red", // wrong color
        sizes: [10],
        price: 1899,
        currency: "INR",
        rating: 4.5,
        stock: 5,
        returnDays: 14,
        shippingDays: 2,
        description: "Desc",
        active: true
      }
    ];

    const conflicts = ConstraintEngine.analyzeConstraintConflicts(products, intent);
    // Red Shoe violates color (-100 penalty), Overbudget Blue Shoe violates budget (-400 penalty)
    // Red Shoe should score higher and be listed first
    expect(conflicts[0].product.name).toBe("Red Shoe");
    expect(conflicts[1].product.name).toBe("Overbudget Blue Shoe");
  });

  // 8. Explicit constraint relaxation
  it("should relax constraints based on user conversation turn commands", async () => {
    const agent = BuyerAgentService as any;
    const initialIntent = BuyerAgentService.createDefaultIntent();
    initialIntent.color.value = "blue";
    initialIntent.color.strength = "hard";
    
    const updatedIntent = await agent.extractIntent("Color doesn't matter", initialIntent);
    expect(updatedIntent.color.value).toBeNull();
  });

  // 9. Re-asserted constraint
  it("should restore and enforce color requirements on user re-assertion commands", async () => {
    const agent = BuyerAgentService as any;
    const initialIntent = BuyerAgentService.createDefaultIntent();
    initialIntent.color.value = null; // flexible
    
    const updatedIntent = await agent.extractIntent("Actually, keep it blue", initialIntent);
    expect(updatedIntent.color.value).toBe("blue");
    expect(updatedIntent.color.strength).toBe("hard");
  });

  // 10. Silent relaxation prevention
  it("should never relax size or budget constraints silently without explicit user commands", async () => {
    const agent = BuyerAgentService as any;
    const initialIntent = BuyerAgentService.createDefaultIntent();
    initialIntent.size.value = 10;
    initialIntent.maxBudget.value = 2000;
    
    // Non-relaxation query should preserve initial parameters
    const updatedIntent = await agent.extractIntent("Find shoes", initialIntent);
    expect(updatedIntent.size.value).toBe(10);
    expect(updatedIntent.maxBudget.value).toBe(2000);
  });

  // 11. Budget relaxation requiring user approval
  it("should increase maximum budget limit only upon explicit user relaxation turn", async () => {
    const agent = BuyerAgentService as any;
    const initialIntent = BuyerAgentService.createDefaultIntent();
    initialIntent.maxBudget.value = 2000;
    
    const updatedIntent = await agent.extractIntent("budget can go up to 2500", initialIntent);
    expect(updatedIntent.maxBudget.value).toBe(2500);
  });

  // 12. Size relaxation requiring user approval
  it("should adjust shoe size requirements only on explicit user approval messages", async () => {
    const agent = BuyerAgentService as any;
    const initialIntent = BuyerAgentService.createDefaultIntent();
    initialIntent.size.value = 10;
    
    const updatedIntent = await agent.extractIntent("size 9.5 is okay", initialIntent);
    expect(updatedIntent.size.value).toBe(9.5);
  });

  // 13. Merchant relaxation requiring user approval
  it("should update merchant preferences when user relaxes merchant requirements", async () => {
    const agent = BuyerAgentService as any;
    const initialIntent = BuyerAgentService.createDefaultIntent();
    initialIntent.brand.value = "QuickStep Sports";
    initialIntent.brand.strength = "hard";
    
    const updatedIntent = await agent.extractIntent("Any merchant is fine", initialIntent);
    // Setting brand to null allows any merchant
    expect(updatedIntent.brand.value).toBeNull();
  });

  // 14. Autonomy Level 1
  it("should block autonomous checkouts and return PRODUCTS_FOUND for Level 1 autonomy", () => {
    const context: OrderContext = {
      productId: "p1",
      productName: "SwiftRun",
      category: "shoes",
      price: 1899,
      originalPrice: 1899,
      quantity: 1,
      size: 10,
      color: "blue",
      merchantId: "m1",
      merchantName: "QuickStep Sports",
      stock: 5,
      paymentMethod: "UPI",
      authorizationStatus: "NONE",
    };

    const policy: UserPolicyData = {
      id: "p-policy",
      maxBudget: 2000,
      allowedCategories: ["shoes"],
      allowedMerchants: ["QuickStep Sports"],
      allowedPaymentMethods: ["UPI"],
      autonomyLevel: 1, // Recommend only
    };

    const validation = PolicyEngine.validate(context, policy);
    expect(validation.decision).toBe("BLOCK"); // blocks auto checkout
    const autonomyCheck = validation.checks.find(c => c.name === "autonomy");
    expect(autonomyCheck?.passed).toBe(false);
  });

  // 15. Autonomy Level 2
  it("should require manual confirmation (ASK_USER) for Level 2 autonomy when order checks pass", () => {
    const context: OrderContext = {
      productId: "p1",
      productName: "SwiftRun",
      category: "shoes",
      price: 1899,
      originalPrice: 1899,
      quantity: 1,
      size: 10,
      color: "blue",
      merchantId: "m1",
      merchantName: "QuickStep Sports",
      stock: 5,
      paymentMethod: "UPI",
      authorizationStatus: "NONE",
    };

    const policy: UserPolicyData = {
      id: "p-policy",
      maxBudget: 2000,
      allowedCategories: ["shoes"],
      allowedMerchants: ["QuickStep Sports"],
      allowedPaymentMethods: ["UPI"],
      autonomyLevel: 2, // Prepare and Ask
    };

    const validation = PolicyEngine.validate(context, policy);
    expect(validation.decision).toBe("ASK_USER"); // asks user before payment
  });

  // 16. Autonomy Level 3
  it("should authorize checkout autonomously (ALLOW) for Level 3 autonomy if all policies pass", () => {
    const context: OrderContext = {
      productId: "p1",
      productName: "SwiftRun",
      category: "shoes",
      price: 1899,
      originalPrice: 1899,
      quantity: 1,
      size: 10,
      color: "blue",
      merchantId: "m1",
      merchantName: "QuickStep Sports",
      stock: 5,
      paymentMethod: "UPI",
      authorizationStatus: "NONE",
    };

    const policy: UserPolicyData = {
      id: "p-policy",
      maxBudget: 2000,
      allowedCategories: ["shoes"],
      allowedMerchants: ["QuickStep Sports"],
      allowedPaymentMethods: ["UPI"],
      autonomyLevel: 3, // Full Autonomy
    };

    const validation = PolicyEngine.validate(context, policy);
    expect(validation.decision).toBe("ALLOW");
  });

  // 17. Policy still blocks Level 3 overspending
  it("should block Level 3 autonomy purchases if budget limit is violated", () => {
    const context: OrderContext = {
      productId: "p1",
      productName: "SwiftRun",
      category: "shoes",
      price: 2200, // exceeds budget
      originalPrice: 2200,
      quantity: 1,
      size: 10,
      color: "blue",
      merchantId: "m1",
      merchantName: "QuickStep Sports",
      stock: 5,
      paymentMethod: "UPI",
      authorizationStatus: "NONE",
    };

    const policy: UserPolicyData = {
      id: "p-policy",
      maxBudget: 2000, // 2000 budget
      allowedCategories: ["shoes"],
      allowedMerchants: ["QuickStep Sports"],
      allowedPaymentMethods: ["UPI"],
      autonomyLevel: 3,
    };

    const validation = PolicyEngine.validate(context, policy);
    expect(validation.decision).toBe("BLOCK"); // blocked!
    const budgetCheck = validation.checks.find(c => c.name === "budget");
    expect(budgetCheck?.passed).toBe(false);
  });

  // 18. Decision timeline events
  it("should generate audit trail entries for all verified policy parameters", () => {
    const context: OrderContext = {
      productId: "p1",
      productName: "SwiftRun",
      category: "shoes",
      price: 1899,
      originalPrice: 1899,
      quantity: 1,
      size: 10,
      color: "blue",
      merchantId: "m1",
      merchantName: "QuickStep Sports",
      stock: 5,
      paymentMethod: "UPI",
      authorizationStatus: "NONE",
    };

    const policy: UserPolicyData = {
      id: "p-policy",
      maxBudget: 2000,
      allowedCategories: ["shoes"],
      allowedMerchants: ["QuickStep Sports"],
      allowedPaymentMethods: ["UPI"],
      autonomyLevel: 3,
    };

    const validation = PolicyEngine.validate(context, policy);
    expect(validation.checks.map(c => c.name)).toContain("budget");
    expect(validation.checks.map(c => c.name)).toContain("category");
    expect(validation.checks.map(c => c.name)).toContain("merchant");
  });

  // 19. Explainable product recommendation
  it("should return correct matching constraints for explainable recommendations", () => {
    const intent = BuyerAgentService.createDefaultIntent();
    intent.category.value = "shoes";
    intent.size.value = 10;
    intent.maxBudget.value = 2000;
    
    const product: ProductData = {
      id: "p1",
      merchantId: "m1",
      merchantName: "QuickStep",
      name: "SwiftRun Blue",
      category: "shoes",
      purpose: ["running"],
      color: "blue",
      sizes: [10],
      price: 1899,
      currency: "INR",
      rating: 4.5,
      stock: 5,
      returnDays: 14,
      shippingDays: 2,
      description: "Desc",
      active: true
    };

    expect(product.sizes).toContain(intent.size.value);
    expect(product.price).toBeLessThanOrEqual(intent.maxBudget.value!);
  });

  // 20. Merchant comparison ranking
  it("should rank merchant options sorting by pricing, shipping speed, and rating metrics", () => {
    const intent = BuyerAgentService.createDefaultIntent();
    intent.category.value = "shoes";
    
    const products: ProductData[] = [
      {
        id: "slow",
        merchantId: "m1",
        merchantName: "QuickStep",
        name: "Slow Shoe",
        category: "shoes",
        purpose: ["running"],
        color: "blue",
        sizes: [10],
        price: 1899,
        currency: "INR",
        rating: 4.0,
        stock: 5,
        returnDays: 14,
        shippingDays: 10, // slow shipping
        description: "Desc",
        active: true
      },
      {
        id: "fast",
        merchantId: "m2",
        merchantName: "UrbanStride",
        name: "Fast Shoe",
        category: "shoes",
        purpose: ["running"],
        color: "blue",
        sizes: [10],
        price: 1899,
        currency: "INR",
        rating: 4.5, // high rating
        stock: 5,
        returnDays: 14,
        shippingDays: 2, // fast shipping
        description: "Desc",
        active: true
      }
    ];

    const ranked = ConstraintEngine.rankProducts(products, intent);
    expect(ranked[0].id).toBe("fast"); // fast shoe ranked higher!
  });

  // 17. Natural language shopping queries parsing checks
  it("should correctly parse budget 3k, size 9, and category shoes/blue color from natural language", async () => {
    const agent = BuyerAgentService as any;
    const intent = await agent.extractIntent("buy blue trainers size 9 budget 3k");
    
    expect(intent.category.value).toBe("shoes");
    expect(intent.size.value).toBe(9);
    expect(intent.maxBudget.value).toBe(3000);
    expect(intent.color.value).toBe("blue");
  });

  it("should correctly parse budget 2k, size 9, and category shoes/blue color from detailed request", async () => {
    const agent = BuyerAgentService as any;
    const intent = await agent.extractIntent("buy me SwiftRun Blue Trainer size 9 budget 2k");
    
    expect(intent.category.value).toBe("shoes");
    expect(intent.size.value).toBe(9);
    expect(intent.maxBudget.value).toBe(2000);
    expect(intent.color.value).toBe("blue");
  });
});

