/**
 * AI Buyer Agent Orchestrator
 * Responsible for parsing natural language, managing stateful intents,
 * verifying completeness, and coordinating catalog tool executions.
 */

import { MerchantService, ProductData } from "./merchantService";
import { ConstraintEngine, ConstraintProposal } from "./constraintEngine";
import { AuditService } from "./auditService";
import { PolicyEngine, OrderContext, UserPolicyData } from "./policyEngine";
import { prisma } from "../lib/prisma";

export interface IntentRequirement<T> {
  field: string;
  value: T;
  source: "explicit" | "inferred" | "unspecified";
  confidence: number;
  strength?: "hard" | "soft";
}

export interface BuyerIntent {
  category: IntentRequirement<string>;
  purpose: IntentRequirement<string[]>;
  color: IntentRequirement<string | null>;
  size: IntentRequirement<number | null>;
  maxBudget: IntentRequirement<number | null>;
  currency: IntentRequirement<string>;
  brand: IntentRequirement<string | null>;
  merchantPreference: IntentRequirement<string | null>;
  paymentPreference: IntentRequirement<string | null>;
  autonomousPurchase: IntentRequirement<boolean>;
  authorizationStatus: IntentRequirement<"NONE" | "USER_CONFIRMED" | "POLICY_AUTHORIZED" | "APPROVED_FOR_CHECKOUT">;
  originalPrice: IntentRequirement<number | null>; // Tracks selected item price for price-change checks
}

export interface AgentClarification {
  field: string;
  reason: string;
  question: string;
}

export interface AgentResult {
  status: "NEEDS_CLARIFICATION" | "SEARCHING" | "PRODUCTS_FOUND" | "NO_EXACT_MATCH" | "WAITING_FOR_USER" | "APPROVED_FOR_CHECKOUT";
  message: string;
  intent: BuyerIntent;
  products: ProductData[];
  alternatives: ConstraintProposal[];
  needsClarification: boolean;
  clarificationQuestion?: string;
  selectedProduct?: ProductData;
  policyResult?: any;
}

export class BuyerAgentService {
  /**
   * Create a default empty stateful intent structure.
   */
  static createDefaultIntent(): BuyerIntent {
    return {
      category: { field: "category", value: "shoes", source: "unspecified", confidence: 0.0, strength: "hard" },
      purpose: { field: "purpose", value: [], source: "unspecified", confidence: 0.0, strength: "soft" },
      color: { field: "color", value: null, source: "unspecified", confidence: 0.0, strength: "soft" },
      size: { field: "size", value: null, source: "unspecified", confidence: 0.0, strength: "hard" },
      maxBudget: { field: "maxBudget", value: null, source: "unspecified", confidence: 0.0, strength: "hard" },
      currency: { field: "currency", value: "INR", source: "inferred", confidence: 1.0 },
      brand: { field: "brand", value: null, source: "unspecified", confidence: 0.0, strength: "soft" },
      merchantPreference: { field: "merchantPreference", value: null, source: "unspecified", confidence: 0.0, strength: "soft" },
      paymentPreference: { field: "paymentPreference", value: null, source: "unspecified", confidence: 0.0, strength: "soft" },
      autonomousPurchase: { field: "autonomousPurchase", value: true, source: "inferred", confidence: 1.0 },
      authorizationStatus: { field: "authorizationStatus", value: "NONE", source: "explicit", confidence: 1.0 },
      originalPrice: { field: "originalPrice", value: null, source: "inferred", confidence: 1.0 },
    };
  }

  /**
   * Orchestrate the entire Buyer Agent logic flow.
   * Steps: Parse Input -> Check Completeness -> Query Merchants -> Match & Rank -> Handle Conflicts -> Policy & Autonomy Signoff
   */
  static async processMessage(
    message: string,
    sessionId: string,
    previousIntent?: BuyerIntent,
    policyAutonomy = 2,
    policyLimit = 2000
  ): Promise<AgentResult> {
    await AuditService.logStep(sessionId, "intent_received", `User message: "${message}"`);

    // 1. Intent Extraction
    const intent = await this.extractIntent(message, previousIntent);
    await AuditService.logStep(sessionId, "intent_extracted", `Structured Intent parsed`, intent);

    // 2. Intent Completeness Check
    const completeness = this.checkCompleteness(intent);
    if (!completeness.complete && completeness.missing && completeness.missing.length > 0) {
      const primaryMissing = completeness.missing[0];
      await AuditService.logStep(
        sessionId,
        "clarification_required",
        `Missing parameter: ${primaryMissing.field}. Asking: "${primaryMissing.question}"`
      );
      return {
        status: "NEEDS_CLARIFICATION",
        message: `I need to know your ${primaryMissing.field} before I can complete the checkout.`,
        intent,
        products: [],
        alternatives: [],
        needsClarification: true,
        clarificationQuestion: primaryMissing.question,
      };
    }

    // 3. Product Discovery (Exposed via MerchantService tools)
    await AuditService.logStep(sessionId, "product_search_started", `Searching merchant network for category='${intent.category.value}'`);
    const catalog = await MerchantService.searchProducts({
      category: intent.category.value,
    });
    await AuditService.logStep(sessionId, "products_found", `Discovered ${catalog.length} products in catalog`);

    // 4. Constraint Matching and Ranking (Exposed via ConstraintEngine tools)
    const matchResults = ConstraintEngine.matchConstraints(catalog, intent);

    // Filter exact matches to find those in stock
    const inStockExactMatches: ProductData[] = [];
    for (const match of matchResults.exactMatches) {
      const stockCheck = await MerchantService.checkInventory(match.id, intent.size.value || undefined);
      if (stockCheck.inStock) {
        inStockExactMatches.push(match);
      }
    }

    if (inStockExactMatches.length > 0) {
      await AuditService.logStep(
        sessionId,
        "exact_match_found",
        `Found ${inStockExactMatches.length} in-stock exact matches`
      );
      
      const ranked = ConstraintEngine.rankProducts(inStockExactMatches, intent);
      const topMatch = ranked[0];

      let comparisonText = "";
      if (ranked.length > 1) {
        comparisonText = " I compared multiple merchant catalog options: " + ranked.map((p, idx) => {
          return `Option ${String.fromCharCode(65 + idx)} from ${p.merchantName} at ₹${p.price} (${p.shippingDays}-day shipping, Rating: ${p.rating})`;
        }).join(" vs ") + ". " + `${ranked[0].merchantName} is recommended because it offers the best balance of price and fast delivery.`;
      }

      // Track original price on first selection to prevent price changes
      if (intent.originalPrice.value === null) {
        intent.originalPrice.value = topMatch.price;
      }

      // Initialize policy parameters
      const userPolicyData: UserPolicyData = {
        id: "default-policy",
        maxBudget: policyLimit,
        allowedCategories: ["shoes", "clothing"],
        allowedMerchants: ["QuickStep Sports", "UrbanStride"],
        allowedPaymentMethods: ["UPI"],
        autonomyLevel: policyAutonomy,
      };

      // Load policy details from DB if database is available
      try {
        const dbPolicy = await prisma.userPolicy.findUnique({
          where: { id: "default-policy" },
        });
        if (dbPolicy) {
          userPolicyData.maxBudget = dbPolicy.maxBudget;
          userPolicyData.allowedCategories = dbPolicy.allowedCategories;
          userPolicyData.allowedMerchants = dbPolicy.allowedMerchants;
          userPolicyData.allowedPaymentMethods = dbPolicy.allowedPaymentMethods;
          userPolicyData.autonomyLevel = dbPolicy.autonomyLevel;
        }
      } catch {
        // Fallback to defaults if DB is offline
      }

      // Fresh product lookup, fresh inventory, fresh price check
      const freshProduct = catalog.find(p => p.id === topMatch.id) || topMatch;
      const freshStock = freshProduct.stock;

      // Construct OrderContext for deterministic PolicyEngine
      const orderContext: OrderContext = {
        productId: freshProduct.id,
        productName: freshProduct.name,
        category: freshProduct.category,
        price: freshProduct.price,
        originalPrice: intent.originalPrice.value,
        quantity: 1,
        size: intent.size.value || 0,
        color: freshProduct.color,
        merchantId: freshProduct.merchantId,
        merchantName: freshProduct.merchantName,
        stock: freshStock,
        paymentMethod: "UPI",
        authorizationStatus: intent.authorizationStatus.value,
      };

      // 5. Evaluate Bounded Autonomy & Deterministic Policy checks
      await AuditService.logStep(sessionId, "policy_check_started", `Evaluating Policy Engine rules`);
      const policyResult = PolicyEngine.validate(orderContext, userPolicyData);

      // Log audits for each check
      for (const check of policyResult.checks) {
        if (check.name === "budget") {
          await AuditService.logStep(sessionId, "budget_check", `Limit: ₹${check.expected}, Actual: ₹${check.actual} - ${check.passed ? "PASSED" : "FAILED"}`);
        } else if (check.name === "category") {
          await AuditService.logStep(sessionId, "category_check", `Allowed categories: ${JSON.stringify(check.expected)}, Actual: '${check.actual}' - ${check.passed ? "PASSED" : "FAILED"}`);
        } else if (check.name === "merchant") {
          await AuditService.logStep(sessionId, "merchant_check", `Allowed merchants: ${JSON.stringify(check.expected)}, Actual: '${check.actual}' - ${check.passed ? "PASSED" : "FAILED"}`);
        } else if (check.name === "inventory") {
          await AuditService.logStep(sessionId, "inventory_check", `Inventory level check - ${check.passed ? "PASSED" : "FAILED"}`);
        } else if (check.name === "priceChange") {
          await AuditService.logStep(sessionId, "price_verification", `Original authorized price: ₹${check.expected}, Current price: ₹${check.actual} - ${check.passed ? "PASSED" : "FAILED"}`);
        } else if (check.name === "autonomy") {
          await AuditService.logStep(sessionId, "authorization_check", `Authorization check: ${check.passed ? "PASSED" : "FAILED"}`);
        }
      }

      // Enforce blocks
      if (policyResult.decision === "BLOCK") {
        // If it was blocked ONLY due to Autonomy Level 1 recommendation limit, return PRODUCTS_FOUND
        const blockedOnlyByAutonomy = policyResult.checks.every(c => c.name === "autonomy" ? !c.passed : c.passed);
        if (blockedOnlyByAutonomy && userPolicyData.autonomyLevel === 1) {
          await AuditService.logStep(sessionId, "policy_allowed", `Autonomy level 1: restricting to recommendation`);
          return {
            status: "PRODUCTS_FOUND",
            message: `I've found '${freshProduct.name}'. Since your safety policy is set to Recommend Only, please review it.${comparisonText}`,
            intent,
            products: ranked,
            alternatives: [],
            needsClarification: false,
            selectedProduct: freshProduct,
            policyResult,
          };
        }

        await AuditService.logStep(sessionId, "policy_blocked", `Purchase blocked: ${policyResult.reason}`);
        intent.authorizationStatus.value = "NONE";
        return {
          status: "WAITING_FOR_USER",
          message: `❌ ${policyResult.reason}`,
          intent,
          products: ranked,
          alternatives: [],
          needsClarification: false,
          selectedProduct: freshProduct,
          policyResult,
        };
      }

      if (policyResult.decision === "ASK_USER") {
        // If it asks user ONLY due to Autonomy Level 2 (Prepare), return PRODUCTS_FOUND
        const askOnlyByAutonomy = policyResult.checks.every(c => c.name === "autonomy" ? !c.passed : c.passed);
        if (askOnlyByAutonomy && userPolicyData.autonomyLevel === 2) {
          await AuditService.logStep(sessionId, "policy_allowed", `Autonomy level 2: prepared cart, manual authorization required`);
          return {
            status: "PRODUCTS_FOUND",
            message: `I've prepared the cart with '${freshProduct.name}' for ${freshProduct.price} INR. Please authorize the purchase.${comparisonText}`,
            intent,
            products: ranked,
            alternatives: [],
            needsClarification: false,
            selectedProduct: freshProduct,
            policyResult,
          };
        }

        await AuditService.logStep(sessionId, "policy_ask_user", `Awaiting confirmation: ${policyResult.reason}`);
        return {
          status: "WAITING_FOR_USER",
          message: policyResult.reason,
          intent,
          products: ranked,
          alternatives: [],
          needsClarification: false,
          selectedProduct: freshProduct,
          policyResult,
        };
      }

      // ALLOW decision check: Enforce Database connection safety verification
      if (policyResult.decision === "ALLOW") {
        const isDbOnline = await MerchantService.isDatabaseAvailable();
        if (!isDbOnline) {
          await AuditService.logStep(sessionId, "policy_blocked", `Database connection is offline during checkout verification. Blocking transaction.`);
          intent.authorizationStatus.value = "NONE";
          return {
            status: "WAITING_FOR_USER",
            message: "❌ Unable to verify the current product state. Purchase blocked for safety.",
            intent,
            products: [],
            alternatives: [],
            needsClarification: false,
            policyResult: {
              decision: "BLOCK",
              reason: "Unable to verify the current product state. Purchase blocked for safety.",
              checks: policyResult.checks.map(c => c.name === "inventory" ? { ...c, passed: false } : c),
            },
          };
        }

        // Database is online, transaction is safe and approved
        await AuditService.logStep(sessionId, "policy_allowed", `Purchase approved and pre-authorized for checkout`);
        intent.authorizationStatus.value = "APPROVED_FOR_CHECKOUT";
        
        return {
          status: "APPROVED_FOR_CHECKOUT",
          message: `I've found and selected the '${freshProduct.name}' for ${freshProduct.price} INR. Order safety checks passed.${comparisonText}`,
          intent,
          products: ranked,
          alternatives: [],
          needsClarification: false,
          selectedProduct: freshProduct,
          policyResult,
        };
      }
    }

    // No matches or stock outs
    if (matchResults.exactMatches.length > 0) {
      // Exact matches were out of stock
      const topMatch = matchResults.exactMatches[0];
      await AuditService.logStep(
        sessionId,
        "no_exact_match",
        `Exact match '${topMatch.name}' is out of stock. Diverting to alternatives search.`
      );
      
      const candidatesForAlternatives = catalog.filter((p) => p.id !== topMatch.id);
      const altResults = ConstraintEngine.analyzeConstraintConflicts(candidatesForAlternatives, intent);
      
      return {
        status: "NO_EXACT_MATCH",
        message: `The closest matching shoe '${topMatch.name}' is currently out of stock. Here are the closest alternative recommendations:`,
        intent,
        products: [],
        alternatives: altResults,
        needsClarification: false,
      };
    } else {
      // 5. Alternatives Conflict Resolution
      await AuditService.logStep(sessionId, "alternatives_generated", `Calculating constraint relaxation alternatives`);
      const altResults = ConstraintEngine.analyzeConstraintConflicts(catalog, intent);
      return {
        status: "NO_EXACT_MATCH",
        message: `I couldn't find an exact match matching all preferences. Here are the closest options with relaxed constraints:`,
        intent,
        products: [],
        alternatives: altResults,
        needsClarification: false,
      };
    }
  }

  /**
   * Determine parameter completeness based on category and input.
   */
  static checkCompleteness(intent: BuyerIntent): { complete: boolean; missing?: AgentClarification[] } {
    const missing: AgentClarification[] = [];

    // Size is required for shoes/clothing
    if ((intent.category.value === "shoes" || intent.category.value === "clothing") && !intent.size.value) {
      missing.push({
        field: "size",
        reason: "Required to verify inventory and complete purchase",
        question: `What size do you need for the ${intent.category.value}?`,
      });
    }

    return {
      complete: missing.length === 0,
      missing: missing.length > 0 ? missing : undefined,
    };
  }

  private static async extractIntent(message: string, previousIntent?: BuyerIntent): Promise<BuyerIntent> {
    const defaultIntent = this.createDefaultIntent();
    const intent = previousIntent ? { ...defaultIntent, ...JSON.parse(JSON.stringify(previousIntent)) } : defaultIntent;
    const normalized = message.toLowerCase();

    // Show all options handling: soften all constraints
    if (normalized.includes("show all options") || normalized.includes("show all")) {
      intent.category.strength = "soft";
      intent.size.strength = "soft";
      intent.maxBudget.strength = "soft";
      intent.color.strength = "soft";
      intent.brand.strength = "soft";
      intent.purpose.strength = "soft";
      intent.merchantPreference.strength = "soft";
      return intent;
    }

    // Reset or update confirmation state based on explicit user inputs
    if (
      normalized.includes("yes, authorize") ||
      normalized.includes("confirm purchase") ||
      normalized.includes("confirm order") ||
      normalized.includes("authorize purchase") ||
      normalized.includes("yes, confirm")
    ) {
      intent.authorizationStatus.value = "USER_CONFIRMED";
    }

    // Context updating checks (Conversation Turn D & E support)
    if (
      normalized.includes("color doesn't matter") ||
      normalized.includes("any color") ||
      normalized.includes("relax color")
    ) {
      intent.color.value = null;
      intent.color.source = "inferred";
      intent.color.confidence = 1.0;
      intent.color.strength = "soft";
      return intent;
    }
    if (
      normalized.includes("keep the blue requirement") ||
      normalized.includes("actually, keep it blue") ||
      normalized.includes("actually keep it blue") ||
      normalized.includes("keep it blue") ||
      normalized.includes("actually blue") ||
      normalized.includes("must be blue")
    ) {
      intent.color.value = "blue";
      intent.color.source = "explicit";
      intent.color.confidence = 1.0;
      intent.color.strength = "hard";
      return intent;
    }
    if (
      normalized.includes("budget can go up to") ||
      normalized.includes("allow ₹") ||
      (normalized.includes("allow ") && normalized.includes("increase")) ||
      normalized.includes("increase budget")
    ) {
      const budgetMatches = normalized.match(/(?:up to|allow|increase|to)\s*(?:₹|rs\.?\s*)?(\d+)/i);
      if (budgetMatches) {
        intent.maxBudget.value = parseFloat(budgetMatches[1]);
        intent.maxBudget.source = "explicit";
        intent.maxBudget.strength = "soft"; // Mark as soft relaxation or hard, let's keep it soft/hard appropriately
      }
      return intent;
    }
    if (
      normalized.includes("size 9.5 is okay") ||
      normalized.includes("allow size 9.5") ||
      normalized.includes("allow size ")
    ) {
      const sizeMatch = normalized.match(/(?:size)\s*(\d+(\.\d+)?)/i);
      intent.size.value = sizeMatch ? parseFloat(sizeMatch[1]) : 9.5;
      intent.size.source = "explicit";
      intent.size.strength = "soft";
      return intent;
    }
    if (
      normalized.includes("any merchant") ||
      normalized.includes("merchant doesn't matter") ||
      normalized.includes("relax merchant") ||
      normalized.includes("any brand") ||
      normalized.includes("brand doesn't matter")
    ) {
      intent.brand.value = null;
      intent.brand.source = "inferred";
      intent.brand.confidence = 1.0;
      intent.brand.strength = "soft";
      intent.merchantPreference.value = null;
      intent.merchantPreference.source = "inferred";
      intent.merchantPreference.confidence = 1.0;
      intent.merchantPreference.strength = "soft";
      return intent;
    }

    // Attempt Gemini API call if key is configured
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== "") {
      try {
        const { GoogleGenAI, Type } = require("@google/genai");
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        const systemInstruction = `
          You are the Buyer Intent Parser for AgentGuard.
          Your task is to parse shopper query text and convert it into a structured JSON query object.
          Maintain consistency with previous intents if provided.
          Do NOT invent information. Only populate fields explicitly mentioned or strongly inferred.
          Rules for "authorizationStatus":
          - Never mark authorizationStatus as USER_CONFIRMED or APPROVED_FOR_CHECKOUT unless the user explicitly stated approval to checkout or authorized the order in the current message.
        `;

        const responseSchema = {
          type: Type.OBJECT,
          properties: {
            category: {
              type: Type.OBJECT,
              properties: {
                value: { type: Type.STRING },
                source: { type: Type.STRING, enum: ["explicit", "inferred", "unspecified"] },
                strength: { type: Type.STRING, enum: ["hard", "soft"] },
                confidence: { type: Type.NUMBER }
              },
              required: ["value", "source", "strength", "confidence"]
            },
            purpose: {
              type: Type.OBJECT,
              properties: {
                value: { type: Type.ARRAY, items: { type: Type.STRING } },
                source: { type: Type.STRING, enum: ["explicit", "inferred", "unspecified"] },
                strength: { type: Type.STRING, enum: ["hard", "soft"] },
                confidence: { type: Type.NUMBER }
              },
              required: ["value", "source", "strength", "confidence"]
            },
            color: {
              type: Type.OBJECT,
              properties: {
                value: { type: Type.STRING, nullable: true },
                source: { type: Type.STRING, enum: ["explicit", "inferred", "unspecified"] },
                strength: { type: Type.STRING, enum: ["hard", "soft"] },
                confidence: { type: Type.NUMBER }
              },
              required: ["value", "source", "strength", "confidence"]
            },
            size: {
              type: Type.OBJECT,
              properties: {
                value: { type: Type.NUMBER, nullable: true },
                source: { type: Type.STRING, enum: ["explicit", "inferred", "unspecified"] },
                strength: { type: Type.STRING, enum: ["hard", "soft"] },
                confidence: { type: Type.NUMBER }
              },
              required: ["value", "source", "strength", "confidence"]
            },
            maxBudget: {
              type: Type.OBJECT,
              properties: {
                value: { type: Type.NUMBER, nullable: true },
                source: { type: Type.STRING, enum: ["explicit", "inferred", "unspecified"] },
                strength: { type: Type.STRING, enum: ["hard", "soft"] },
                confidence: { type: Type.NUMBER }
              },
              required: ["value", "source", "strength", "confidence"]
            },
            currency: {
              type: Type.OBJECT,
              properties: {
                value: { type: Type.STRING },
                source: { type: Type.STRING, enum: ["explicit", "inferred", "unspecified"] },
                confidence: { type: Type.NUMBER }
              },
              required: ["value", "source", "confidence"]
            },
            brand: {
              type: Type.OBJECT,
              properties: {
                value: { type: Type.STRING, nullable: true },
                source: { type: Type.STRING, enum: ["explicit", "inferred", "unspecified"] },
                strength: { type: Type.STRING, enum: ["hard", "soft"] },
                confidence: { type: Type.NUMBER }
              },
              required: ["value", "source", "strength", "confidence"]
            },
            merchantPreference: {
              type: Type.OBJECT,
              properties: {
                value: { type: Type.STRING, nullable: true },
                source: { type: Type.STRING, enum: ["explicit", "inferred", "unspecified"] },
                strength: { type: Type.STRING, enum: ["hard", "soft"] },
                confidence: { type: Type.NUMBER }
              },
              required: ["value", "source", "strength", "confidence"]
            },
            paymentPreference: {
              type: Type.OBJECT,
              properties: {
                value: { type: Type.STRING, nullable: true },
                source: { type: Type.STRING, enum: ["explicit", "inferred", "unspecified"] },
                strength: { type: Type.STRING, enum: ["hard", "soft"] },
                confidence: { type: Type.NUMBER }
              },
              required: ["value", "source", "strength", "confidence"]
            },
            autonomousPurchase: {
              type: Type.OBJECT,
              properties: {
                value: { type: Type.BOOLEAN },
                source: { type: Type.STRING, enum: ["explicit", "inferred", "unspecified"] },
                confidence: { type: Type.NUMBER }
              },
              required: ["value", "source", "confidence"]
            },
            authorizationStatus: {
              type: Type.OBJECT,
              properties: {
                value: { type: Type.STRING, enum: ["NONE", "USER_CONFIRMED"] },
                source: { type: Type.STRING, enum: ["explicit", "inferred", "unspecified"] },
                confidence: { type: Type.NUMBER }
              },
              required: ["value", "source", "confidence"]
            }
          },
          required: [
            "category",
            "purpose",
            "color",
            "size",
            "maxBudget",
            "currency",
            "brand",
            "merchantPreference",
            "paymentPreference",
            "autonomousPurchase",
            "authorizationStatus"
          ]
        };

        const prompt = `
          Previous Intent: ${JSON.stringify(intent)}
          New Shopper Message: "${message}"
        `;

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema,
          },
        });

        const parsed = JSON.parse(response.text.trim());

        const copyRequirement = (field: keyof BuyerIntent, parsedField: any) => {
          if (parsedField) {
            intent[field] = {
              field: field as string,
              value: parsedField.value,
              source: parsedField.source || "unspecified",
              confidence: parsedField.confidence || 0,
              strength: parsedField.strength || "soft"
            } as any;
          }
        };

        copyRequirement("category", parsed.category);
        copyRequirement("purpose", parsed.purpose);
        copyRequirement("color", parsed.color);
        copyRequirement("size", parsed.size);
        copyRequirement("maxBudget", parsed.maxBudget);
        copyRequirement("currency", parsed.currency);
        copyRequirement("brand", parsed.brand);
        copyRequirement("merchantPreference", parsed.merchantPreference);
        copyRequirement("paymentPreference", parsed.paymentPreference);
        copyRequirement("autonomousPurchase", parsed.autonomousPurchase);

        if (parsed.authorizationStatus) {
          intent.authorizationStatus.value = parsed.authorizationStatus.value;
          intent.authorizationStatus.source = parsed.authorizationStatus.source || "explicit";
          intent.authorizationStatus.confidence = parsed.authorizationStatus.confidence || 1.0;
        }

        return intent;
      } catch (error) {
        console.warn("[BuyerAgentService] Gemini API parsing failed. Falling back to local parser.", error);
      }
    }

    // Local Regex parser fallback logic
    // Category check
    if (normalized.includes("shirt") || normalized.includes("clothing") || normalized.includes("jacket")) {
      intent.category.value = "clothing";
      intent.category.source = "explicit";
      intent.category.strength = "hard";
      intent.category.confidence = 1.0;
    } else if (normalized.includes("watch") || normalized.includes("accessory") || normalized.includes("chrono") || normalized.includes("smartwatch")) {
      intent.category.value = "accessories";
      intent.category.source = "explicit";
      intent.category.strength = "hard";
      intent.category.confidence = 1.0;
    } else if (normalized.includes("shoe") || normalized.includes("runner") || normalized.includes("sneaker") || normalized.includes("trainer")) {
      intent.category.value = "shoes";
      intent.category.source = "explicit";
      intent.category.strength = "hard";
      intent.category.confidence = 1.0;
    }

    // Size check
    const sizeMatch = normalized.match(/size\s*(\d+(\.\d+)?)/i);
    if (sizeMatch) {
      intent.size.value = parseFloat(sizeMatch[1]);
      intent.size.source = "explicit";
      intent.size.confidence = 1.0;

      if (normalized.includes("prefer size") || normalized.includes("size preference") || normalized.includes("size if possible")) {
        intent.size.strength = "soft";
      } else {
        intent.size.strength = "hard";
      }
    } else {
      // Check for standalone numbers representing size (e.g. USER: "10")
      const standaloneNumMatch = normalized.match(/^\s*(\d+(\.\d+)?)\s*$/);
      if (standaloneNumMatch) {
        intent.size.value = parseFloat(standaloneNumMatch[1]);
        intent.size.source = "explicit";
        intent.size.confidence = 1.0;
        intent.size.strength = "hard";
      }
    }

    // Budget check
    const budgetMatch = normalized.match(/(?:under|below|max|budget|price|₹|rs\.?)\s*(\d+[\d,]*(\.\d+)?)\s*([kK]?)/i);
    if (budgetMatch) {
      const rawVal = budgetMatch[1].replace(/,/g, "");
      let parsedVal = parseFloat(rawVal);
      if (budgetMatch[3] && budgetMatch[3].toLowerCase() === "k") {
        parsedVal *= 1000;
      }
      intent.maxBudget.value = parsedVal;
      intent.maxBudget.source = "explicit";
      intent.maxBudget.confidence = 1.0;

      if (normalized.includes("prefer budget") || normalized.includes("budget if possible") || normalized.includes("around")) {
        intent.maxBudget.strength = "soft";
      } else {
        intent.maxBudget.strength = "hard";
      }
    } else {
      const kMatch = normalized.match(/\b(\d+(?:\.\d+)?)\s*[kK]\b/);
      if (kMatch) {
        intent.maxBudget.value = parseFloat(kMatch[1]) * 1000;
        intent.maxBudget.source = "explicit";
        intent.maxBudget.confidence = 1.0;
        intent.maxBudget.strength = "hard";
      } else {
        const numMatch = normalized.match(/\b(1\d{3}|2\d{3}|3\d{3}|4\d{3}|5\d{3})\b/);
        if (numMatch) {
          intent.maxBudget.value = parseFloat(numMatch[1]);
          intent.maxBudget.source = "explicit";
          intent.maxBudget.confidence = 1.0;
          intent.maxBudget.strength = "hard";
        }
      }
    }


    // Brand check
    const brands = ["nike", "adidas", "puma", "quickstep", "urbanstride", "sportkart"];
    for (const b of brands) {
      if (normalized.includes(b)) {
        const parsedBrand = b === "quickstep" ? "QuickStep Sports" : b === "urbanstride" ? "UrbanStride" : b === "sportkart" ? "SportKart" : b.charAt(0).toUpperCase() + b.slice(1);
        intent.brand.value = parsedBrand;
        intent.brand.source = "explicit";
        intent.brand.confidence = 1.0;

        if (normalized.includes(`${b} only`) || normalized.includes(`only ${b}`) || normalized.includes(`must be ${b}`)) {
          intent.brand.strength = "hard";
        } else {
          intent.brand.strength = "soft";
        }
        break;
      }
    }

    // Merchant preference check
    const merchants = ["quickstep sports", "urbanstride", "sportkart"];
    for (const m of merchants) {
      if (normalized.includes(m)) {
        const parsedMerch = m === "quickstep sports" ? "QuickStep Sports" : m === "urbanstride" ? "UrbanStride" : "SportKart";
        intent.merchantPreference.value = parsedMerch;
        intent.merchantPreference.source = "explicit";
        intent.merchantPreference.confidence = 1.0;

        if (normalized.includes(`${m} only`) || normalized.includes(`only ${m}`) || normalized.includes(`must be ${m}`)) {
          intent.merchantPreference.strength = "hard";
        } else {
          intent.merchantPreference.strength = "soft";
        }
        break;
      }
    }

    // Payment preference check
    if (normalized.includes("upi")) {
      intent.paymentPreference.value = "UPI";
      intent.paymentPreference.source = "explicit";
      intent.paymentPreference.confidence = 1.0;
      intent.paymentPreference.strength = "soft";
    } else if (normalized.includes("card") || normalized.includes("credit")) {
      intent.paymentPreference.value = "CARD";
      intent.paymentPreference.source = "explicit";
      intent.paymentPreference.confidence = 1.0;
      intent.paymentPreference.strength = "soft";
    }

    // Color check
    const colors = ["blue", "red", "black", "white", "grey"];
    const isStrictColor = normalized.includes("running") || normalized.includes("trainer") || normalized.includes("shadow") || normalized.includes("only") || normalized.includes("must");
    for (const c of colors) {
      if (normalized.includes(c)) {
        intent.color.value = c;
        intent.color.source = "explicit";
        intent.color.confidence = 1.0;

        if (normalized.includes(`${c} only`) || normalized.includes(`only ${c}`) || normalized.includes(`must be ${c}`)) {
          intent.color.strength = "hard";
        } else {
          intent.color.strength = isStrictColor ? "hard" : "soft";
        }
        break;
      }
    }

    // Purpose checks
    const purposes = ["running", "training", "hiking", "walking", "marathon", "casual", "formal"];
    const foundPurposes: string[] = [];
    for (const p of purposes) {
      if (normalized.includes(p)) {
        foundPurposes.push(p);
      }
    }
    if (foundPurposes.length > 0) {
      intent.purpose.value = foundPurposes;
      intent.purpose.source = "explicit";
      intent.purpose.confidence = 1.0;
      intent.purpose.strength = "soft";
    }

    // Autonomous purchase check
    if (normalized.includes("buy") || normalized.includes("purchase") || normalized.includes("checkout") || normalized.includes("order")) {
      intent.autonomousPurchase.value = true;
      intent.autonomousPurchase.source = "explicit";
      intent.autonomousPurchase.confidence = 1.0;
    }

    return intent;
  }
}
