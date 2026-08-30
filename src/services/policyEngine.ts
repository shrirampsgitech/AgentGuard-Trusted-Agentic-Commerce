/**
 * Policy Engine
 * A deterministic (non-LLM) rules engine that checks policies, budgets,
 * final prices, category whitelists, merchant allowlists, and autonomy levels before checkout.
 */

export interface UserPolicyData {
  id: string;
  maxBudget: number;
  allowedCategories: string[];
  allowedMerchants: string[];
  allowedPaymentMethods: string[];
  autonomyLevel: number; // 1 = Recommend, 2 = Prepare, 3 = Autonomous
}

export interface OrderContext {
  productId: string;
  productName: string;
  category: string;
  price: number;
  originalPrice: number; // Price when initially selected
  quantity: number;
  size: number;
  color: string;
  merchantId: string;
  merchantName: string;
  stock: number;
  paymentMethod: string;
  authorizationStatus: "NONE" | "USER_CONFIRMED" | "POLICY_AUTHORIZED" | "APPROVED_FOR_CHECKOUT";
}

export interface CheckResult {
  name: string;
  passed: boolean;
  expected: any;
  actual: any;
}

export interface PolicyValidationResult {
  decision: "ALLOW" | "BLOCK" | "ASK_USER";
  reason: string;
  checks: CheckResult[];
}

const globalForPolicy = globalThis as unknown as {
  memoryPolicy: UserPolicyData | undefined;
};

export class PolicyEngine {
  private static getMemoryPolicy(): UserPolicyData {
    if (!globalForPolicy.memoryPolicy) {
      globalForPolicy.memoryPolicy = {
        id: "default-policy",
        maxBudget: 2000,
        allowedCategories: ["shoes", "clothing"],
        allowedMerchants: ["QuickStep Sports", "UrbanStride"],
        allowedPaymentMethods: ["UPI"],
        autonomyLevel: 2,
      };
    }
    return globalForPolicy.memoryPolicy;
  }

  public static getPolicyMemory(): UserPolicyData {
    return this.getMemoryPolicy();
  }

  public static setPolicyMemory(policy: Partial<UserPolicyData>) {
    globalForPolicy.memoryPolicy = { ...this.getMemoryPolicy(), ...policy };
  }

  /**
   * Deterministically validate a pending checkout context against a UserPolicy.
   */
  static validate(order: OrderContext, policy: UserPolicyData): PolicyValidationResult {
    const checks: CheckResult[] = [];
    let overallDecision: "ALLOW" | "BLOCK" | "ASK_USER" = "ALLOW";
    const reasons: string[] = [];

    // 1. Budget Verification Check
    const totalCost = order.price * order.quantity;
    const budgetPassed = totalCost <= policy.maxBudget;
    checks.push({
      name: "budget",
      passed: budgetPassed,
      expected: policy.maxBudget,
      actual: totalCost,
    });
    if (!budgetPassed) {
      overallDecision = "BLOCK";
      reasons.push(`Total cost (₹${totalCost}) exceeds policy budget limit of ₹${policy.maxBudget}`);
    }

    // 2. Category Whitelist Check
    const categoryAllowed = policy.allowedCategories.map(c => c.toLowerCase()).includes(order.category.toLowerCase());
    checks.push({
      name: "category",
      passed: categoryAllowed,
      expected: policy.allowedCategories,
      actual: order.category,
    });
    if (!categoryAllowed) {
      overallDecision = "BLOCK";
      reasons.push(`Product category '${order.category}' is not whitelisted: [${policy.allowedCategories.join(", ")}]`);
    }

    // 3. Price Change Protection Check
    const pricePassed = order.price <= order.originalPrice;
    checks.push({
      name: "priceChange",
      passed: pricePassed,
      expected: order.originalPrice,
      actual: order.price,
    });
    if (!pricePassed) {
      overallDecision = "BLOCK";
      reasons.push(`Current price (₹${order.price}) exceeds authorized budget of ₹${order.originalPrice} by ₹${order.price - order.originalPrice}`);
    }

    // 4. Inventory Availability Check
    const stockPassed = order.stock > 0;
    checks.push({
      name: "inventory",
      passed: stockPassed,
      expected: "in-stock",
      actual: order.stock > 0 ? "in-stock" : "out-of-stock",
    });
    if (!stockPassed) {
      overallDecision = "BLOCK";
      reasons.push(`Product '${order.productName}' is out of stock`);
    }

    // 5. Merchant Allowlist Check
    const merchantPassed = policy.allowedMerchants.length === 0 || 
      policy.allowedMerchants.map(m => m.toLowerCase()).includes(order.merchantName.toLowerCase());
    checks.push({
      name: "merchant",
      passed: merchantPassed,
      expected: policy.allowedMerchants.length > 0 ? policy.allowedMerchants : "any",
      actual: order.merchantName,
    });
    if (!merchantPassed) {
      // If merchant is not whitelisted, but other blocks didn't trigger, ask user
      if (overallDecision !== "BLOCK") {
        overallDecision = "ASK_USER";
      }
      reasons.push(`Merchant '${order.merchantName}' is outside your preferred merchant list`);
    }

    // 6. Payment Method Check
    const paymentPassed = policy.allowedPaymentMethods.length === 0 || 
      policy.allowedPaymentMethods.map(p => p.toLowerCase()).includes(order.paymentMethod.toLowerCase());
    checks.push({
      name: "paymentMethod",
      passed: paymentPassed,
      expected: policy.allowedPaymentMethods.length > 0 ? policy.allowedPaymentMethods : "any",
      actual: order.paymentMethod,
    });
    if (!paymentPassed) {
      overallDecision = "BLOCK";
      reasons.push(`Payment method '${order.paymentMethod}' is not policy-approved: [${policy.allowedPaymentMethods.join(", ")}]`);
    }

    // 7. Autonomy & Explicit Authorization Check
    let autonomyPassed = false;
    let autonomyExpected = "";
    
    if (order.authorizationStatus === "USER_CONFIRMED") {
      autonomyPassed = true;
      autonomyExpected = "explicit-user-confirmed";
    } else {
      if (policy.autonomyLevel === 3) {
        autonomyPassed = true;
        autonomyExpected = "Level 3 (Bounded Autonomy)";
      } else if (policy.autonomyLevel === 2) {
        autonomyPassed = false;
        autonomyExpected = "Level 2 (Prepare checkout - user confirmation required)";
        if (overallDecision !== "BLOCK") {
          overallDecision = "ASK_USER";
        }
        reasons.push("Explicit user confirmation is required before checkout (Autonomy Level 2)");
      } else {
        autonomyPassed = false;
        autonomyExpected = "Level 1 (Recommend only - checkout prohibited)";
        overallDecision = "BLOCK";
        reasons.push("Autonomy Level is set to '1 - Recommend': checkout operations are prohibited");
      }
    }

    checks.push({
      name: "autonomy",
      passed: autonomyPassed,
      expected: autonomyExpected,
      actual: order.authorizationStatus,
    });

    // 8. Generate Summary Explanation
    let reason = "Approved for checkout.";
    if (overallDecision === "BLOCK") {
      reason = `Purchase blocked: ${reasons.join("; ")}`;
    } else if (overallDecision === "ASK_USER") {
      reason = `Confirmation required: ${reasons.join("; ")}`;
    }

    return {
      decision: overallDecision,
      reason,
      checks,
    };
  }
}
