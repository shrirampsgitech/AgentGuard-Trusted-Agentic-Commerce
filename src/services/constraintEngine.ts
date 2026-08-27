/**
 * Constraint & Ranking Engine
 * Evaluates hard vs. soft constraints, ranks products using commercial metrics,
 * and analyzes conflicts to suggest alternative matches.
 */

import { ProductData } from "./merchantService";
import { BuyerIntent } from "./buyerAgent";

export interface ConstraintProposal {
  product: ProductData;
  violatedConstraint: "budget" | "color" | "size" | "purpose" | "stock" | "none";
  difference: number | null;
  explanation: string;
  score: number;
}

export class ConstraintEngine {
  /**
   * Separate exact matches from conflict candidate lists.
   */
  static matchConstraints(
    products: ProductData[],
    intent: BuyerIntent
  ): { exactMatches: ProductData[] } {
    const exactMatches = products.filter((p) => {
      // 1. Hard Category check
      if (intent.category.value && p.category.toLowerCase() !== intent.category.value.toLowerCase()) {
        if (intent.category.strength !== "soft") return false;
      }
      // 2. Hard Size check (hard by default)
      if (intent.size.value !== null && !p.sizes.includes(intent.size.value)) {
        if (intent.size.strength !== "soft") return false;
      }
      // 3. Hard Budget check (hard by default)
      if (intent.maxBudget.value !== null && p.price > intent.maxBudget.value) {
        if (intent.maxBudget.strength !== "soft") return false;
      }
      // 4. Soft Color check (soft by default, unless explicitly hard)
      if (intent.color.value !== null && p.color.toLowerCase() !== intent.color.value.toLowerCase()) {
        if (intent.color.strength === "hard") return false;
      }
      // 5. Soft Brand preference (soft by default)
      if (intent.brand.value !== null && p.merchantName.toLowerCase() !== intent.brand.value.toLowerCase()) {
        if (intent.brand.strength === "hard") return false;
      }
      // 6. Soft Purpose check (soft by default)
      if (intent.purpose.value && intent.purpose.value.length > 0) {
        const hasMatchingPurpose = intent.purpose.value.some((purp) =>
          p.purpose.map((pr) => pr.toLowerCase()).includes(purp.toLowerCase())
        );
        if (!hasMatchingPurpose && intent.purpose.strength === "hard") {
          return false;
        }
      }
      return true;
    });

    return { exactMatches };
  }

  /**
   * Deterministically rank candidate products using commercial attributes.
   * Rationale: Score = 1000 - (Price / 10) + (Rating * 30) - (ShippingDays * 15) + (ReturnDays * 0.5)
   */
  static rankProducts(products: ProductData[], intent: BuyerIntent): ProductData[] {
    const scored = products.map((p) => {
      let score = 1000;
      
      // 1. Price factor (lower price is ranked higher)
      score -= p.price / 10;
      
      // 2. Rating factor (higher rating is better)
      score += p.rating * 30;
      
      // 3. Shipping time factor (faster shipping is better)
      score -= p.shippingDays * 15;
      
      // 4. Return window factor (more days is better)
      score += p.returnDays * 0.5;

      // 5. Soft color preference penalty (if specified color doesn't match)
      if (intent.color.value !== null && p.color.toLowerCase() !== intent.color.value.toLowerCase()) {
        score -= 200;
      }

      // 6. Soft brand/merchant preference penalty (if specified brand doesn't match)
      if (intent.brand.value !== null && p.merchantName.toLowerCase() !== intent.brand.value.toLowerCase()) {
        score -= 150;
      }

      return { product: p, score };
    });

    // Sort descending by score
    return scored.sort((a, b) => b.score - a.score).map((s) => s.product);
  }

  /**
   * Identify alternative proposals by parsing which constraints were violated.
   * Rank alternatives by minimal severity of violation.
   */
  static analyzeConstraintConflicts(
    products: ProductData[],
    intent: BuyerIntent
  ): ConstraintProposal[] {
    const proposals: ConstraintProposal[] = products.map((p) => {
      let score = 1000;
      let violatedConstraint: "budget" | "color" | "size" | "purpose" | "stock" | "none" = "none";
      let difference: number | null = null;
      let explanation = "Meets all criteria.";

      // Check stock status
      if (p.stock <= 0) {
        violatedConstraint = "stock";
        score -= 200;
        explanation = "Product is currently out of stock";
      }
      // Check hard size constraint
      else if (intent.size.value !== null && !p.sizes.includes(intent.size.value)) {
        violatedConstraint = "size";
        score -= 500; // High deduction for sizing
        explanation = `Size mismatch (available: ${p.sizes.join(", ")}, requested: ${intent.size.value})`;
      }
      // Check hard budget constraint
      else if (intent.maxBudget.value !== null && p.price > intent.maxBudget.value) {
        violatedConstraint = "budget";
        difference = p.price - intent.maxBudget.value;
        score -= 400 + difference / 10; // Deduct more for higher prices
        explanation = `Exceeds budget limit of ₹${intent.maxBudget.value} by ₹${difference}`;
      }
      // Check soft color preference
      else if (intent.color.value !== null && p.color.toLowerCase() !== intent.color.value.toLowerCase()) {
        violatedConstraint = "color";
        score -= 100; // Minor deduction for color
        explanation = `Color differs (available: ${p.color}, requested: ${intent.color.value})`;
      }
      // Check soft purpose preference
      else if (intent.purpose.value && intent.purpose.value.length > 0) {
        const matchesPurpose = intent.purpose.value.some((purp) =>
          p.purpose.map((pr) => pr.toLowerCase()).includes(purp.toLowerCase())
        );
        if (!matchesPurpose) {
          violatedConstraint = "purpose";
          score -= 80;
          explanation = `Purpose differs (designed for: ${p.purpose.join(", ")})`;
        }
      }

      // Add commercial attributes check
      score += p.rating * 10 - p.shippingDays * 5;

      return {
        product: p,
        violatedConstraint,
        difference,
        explanation,
        score,
      };
    });

    // Sort proposals by score descending (closest alternatives first)
    return proposals.sort((a, b) => b.score - a.score);
  }
}
