# AgentGuard — Trusted Agentic Commerce Platform

AgentGuard is a secure, competition-ready **Agentic Commerce platform** built for the **Razorpay AI Buildathon**.

The core idea is **bounded autonomy**: a customer gives a natural-language shopping request (e.g. *"Buy blue running shoes, size 10, under ₹2,000"*). An AI Buyer Agent parses the request, matches products, reasons about constraints, manages alternative proposals for out-of-stock items, and pre-authorizes purchases—but a deterministic, non-LLM Policy Engine strictly guards financial transactions against unauthorized spending.

---

## Why AgentGuard? (Competition Positioning)

Traditional AI commerce systems follow a fragile, un-monitored pattern. AgentGuard inserts a deterministic policy check and payment-integrity layer directly into the loop:

### Traditional Shopping Chatbot
```
User ──> AI Chatbot ──> Recommend Product ──> User Manual Checkout
```

### Naive Agentic Commerce
```
User ──> AI Agent ──[Hallucinate Price / Spend Limit]──> Direct Gateway (HALLUCINATIONS & EXPLOITS!)
```

### Trusted Agentic Commerce (AgentGuard Architecture)
```
User
  ↓
AI Agent (Reasoning, Alternatives & Negotiation)
  ↓
Constraint Check (Hard Requirements vs. Soft Preferences)
  ↓
User Policy (Deterministic constraints on Budget, Category, Merchant)
  ↓
Fresh Catalog Verification (Real-time DB lookup for Stock & Price protection)
  ↓
Deterministic Authorization (Safety checklist gates)
  ↓
Payment Execution (Razorpay Secure Webhooks & Captures)
  ↓
Audit Trail Logs (Immutable verification timelines)
```

The agent is empowered to reason, negotiate, and prepare checkouts autonomously, but has **zero capability** to authorize spending outside the customer's explicit, deterministic policies.

---

## 1. Key Features

- **AI Intent Extraction:** Parses natural language queries into structured parameters (budget, size, color, purpose, category) with confidence levels.
- **Constraint Relaxation Engine:** Differentiates hard requirements from soft preferences. Suggests compromises (e.g. alternative colors or budget relaxations) rather than failing silently.
- **Interactive Constraint Negotiation:** Let's the user explicitly relax a requirement with click actions in the Shopper UI if no exact matches are available.
- **Deterministic Policy Engine:** Non-LLM rule system validating budgets, category allowlists, merchant preferences, and payment method allowlists.
- **Price-Change Protection:** Tracks initial selection prices and locks checkout against mid-session price increases.
- **Stale Data Safeguards:** Re-verifies inventory levels and pricing from live database records. If connection is lost or unavailable, checkout is immediately blocked.
- **Purchase Safety Check UI:** Renders a visual pass/fail checklist on the Shopper Portal showing individual policy item validations.
- **Razorpay Sandbox Integration:** Secure Test Mode checkout with server-side signature validations and raw webhook signature verification.
- **Immutable Transaction Auditing:** Logs detailed validation checkpoints (e.g., `policy_check_started`, `budget_check`, `price_verification`, `policy_allowed`).

---

## 2. Technology Stack

- **Core:** HTML, React, Vanilla CSS, TypeScript
- **Framework:** Next.js 16 (App Router)
- **Database Access:** Prisma Client & PostgreSQL
- **Orchestration:** Gemini API (`@google/genai`) with offline fallback parser
- **Payment Processing:** Razorpay Node SDK
- **Testing:** Vitest

---

## 3. Current Progress (All Phases Complete)

- **Phase 1 — Architecture & Setup** ✓
- **Phase 2 — Core Commerce** ✓
- **Phase 3 — Buyer Intelligence** ✓
- **Phase 4 — Trust, Authorization & Policy Enforcement** ✓
- **Phase 5 — Razorpay Payment Integration** ✓
- **Phase 6 — Agentic Commerce Intelligence & Competition Polish** ✓

---

## 4. Testing

AgentGuard contains a robust Vitest test suite with **80 passing unit and integration tests** checking catalog properties, constraint scoring, parser history, safety gates, signature validation, duplicate webhooks, and concurrency safety:

To execute tests:
```bash
npm run test
```

### Test Suite Summary:
```text
  ✓ src/__tests__/commerce.test.ts (9 tests)
  ✓ src/__tests__/agent.test.ts (12 tests)
  ✓ src/__tests__/policy.test.ts (16 tests)
  ✓ src/__tests__/checkout.test.ts (23 tests)
  ✓ src/__tests__/intelligence.test.ts (20 tests)

 Test Files  5 passed (5)
      Tests  80 passed (80)
```
