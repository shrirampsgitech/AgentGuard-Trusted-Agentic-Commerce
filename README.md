# AgentGuard — Trusted Agentic Commerce Platform

AgentGuard is a secure, competition-ready **Agentic Commerce platform** built for the **Razorpay AI Buildathon**.

The core idea is **bounded autonomy**: a customer gives a natural-language shopping request (e.g. *"Buy blue running shoes, size 10, under ₹2,000"*). An AI Buyer Agent parses the request, matches products, reasons about constraints, manages alternative proposals for out-of-stock items, and pre-authorizes purchases—but a deterministic, non-LLM Policy Engine strictly guards financial transactions against unauthorized spending.

---

## 1. The Problem
While LLM-powered buyer agents can automate discovery and catalog reasoning, they are inherently probabilistic and susceptible to prompt injection, hallucinations, and logic errors. Entrusting direct financial authorization or payment execution to generative models introduces catastrophic security risks, such as:
- **Hallucinated Spending:** The AI ordering items exceeding the customer's budget.
- **Prompt Injection Hijacking:** Malicious merchant descriptions tricks the AI into routing purchases to unauthorized merchants or utilizing expensive payment methods.
- **Stale Information Errors:** The agent making purchase decisions based on stale pricing or out-of-stock data cached in browser sessions.

---

## 2. The Solution
AgentGuard solves this by enforcing a strict **separation of concerns** between AI reasoning and authorization/payment execution. The generative model is restricted to a read-only sandboxed role: it discovers and ranks products, but has zero capability to authorize purchases. All safety checks, budget validations, merchant checks, and inventory verifications are handled by a deterministic, standard TypeScript **Policy Engine** that evaluates constraints on fresh database queries before any transaction can reach payment gateways.

---

## 3. Key Features
- **AI Intent Extraction:** Parses natural language queries into structured parameters (budget, size, color, purpose, category) with confidence levels.
- **Constraint Relaxation Engine:** Differentiates hard requirements from soft preferences. Suggests compromises (e.g. alternative colors or budget relaxations) rather than failing silently.
- **Deterministic Policy Engine:** Non-LLM rule system validating budgets, category allowlists, merchant preferences, and payment method allowlists.
- **Price-Change Protection:** Tracks initial selection prices and locks checkout against mid-session price increases.
- **Stale Data Safeguards:** Re-verifies inventory levels and pricing from live database records. If connection is lost or unavailable, checkout is immediately blocked.
- **Purchase Safety Check UI:** Renders a visual pass/fail checklist on the Shopper Portal showing individual policy item validations.
- **Immutable Transaction Auditing:** Logs detailed validation checkpoints (e.g., `policy_check_started`, `budget_check`, `price_verification`, `policy_allowed`).

---

## 4. Agentic Commerce Flow
1. **User Message:** User enters a request (e.g. *"Buy blue running shoes size 10"*).
2. **Intent Parsing:** Local regex/keyword parser or Gemini SDK extracts requirements and maintains session state.
3. **Completeness Check:** Agent verifies if critical fields (like size) are missing and requests clarification if needed.
4. **Network Discovery:** Agent queries `MerchantService` to retrieve product options from simulated merchant catalogs.
5. **Constraint Matching:** `ConstraintEngine` scores candidates, checks stock levels, and prepares alternatives if exact matches are unavailable.
6. **Fresh Policy Check:** Fresh data is pulled from the DB. `PolicyEngine.validate` assesses the context against configured `UserPolicy` limits.
7. **Final Decision:**
   - **Level 1 (Recommend Only):** Prohibits purchase; restricts result to product suggestions.
   - **Level 2 (Prepare Checkout):** Prepares the checkout state, requiring the user to click "Authorize Purchase".
   - **Level 3 (Autonomous):** Automatically pre-approves the order for Razorpay sandbox checkout.

---

## 5. Architecture
```
  Shopper Message
        ↓
   Buyer Agent ──[Query]──> Merchant Service (Simulated Network)
        ↓
  Ranked Product
        ↓
  Fresh DB Lookup ───> Price & Stock Verification
        ↓
  Policy Engine ──────> Deterministic Budget, Category, Merchant Checks
        ↓
   ALLOW / BLOCK
        ↓
 APPROVED_FOR_CHECKOUT (Ready for Razorpay Sandbox execution)
```

---

## 6. Safety & Authorization Rules
- **Autonomy Levels:**
  - **Level 1 (RECOMMEND_ONLY):** Restricted to search and recommendations. No checkout allowed.
  - **Level 2 (PREPARE_CHECKOUT):** Prepares cart items but requires explicit user click to proceed to payment.
  - **Level 3 (BOUNDED_AUTONOMY):** Proceeds to checkout automatically when all deterministic policy constraints pass.
- **Independent Calculations:** The Policy Engine recalculates budget limits using `order.price * order.quantity` directly on the server. Client-side claims (like sending a fake lower price) are ignored and blocked.
- **Database Safety Guard:** If the live database goes offline during checkout verification, the purchase is immediately blocked to prevent stale-state transactions:
  > *"Unable to verify the current product state. Purchase blocked for safety."*

---

## 7. Technology Stack
- **Core:** HTML, React, Vanilla CSS, TypeScript
- **Framework:** Next.js 16 (App Router)
- **Database Access:** Prisma Client & PostgreSQL
- **Orchestration:** Gemini API (`@google/genai`) with offline fallback parser
- **Testing:** Vitest

---

## 8. Current Progress
- **Phase 1 — Architecture & Setup** ✓
- **Phase 2 — Core Commerce** ✓
- **Phase 3 — Buyer Intelligence** ✓
- **Phase 4 — Trust, Authorization & Policy Enforcement** ✓
- **Phase 5 — Razorpay Payment Integration** ── *Upcoming*
- **Phase 6 — Final Polish & Sandbox Demo** ── *Upcoming*

---

## 9. Testing
AgentGuard contains a robust Vitest test suite with **37 passing unit and integration tests** checking catalog properties, constraint scoring, parser history, and safety gates:

To execute tests:
```bash
npm run test
```

### Policy Test Scenarios Cover:
1. Level 1 recommendations allowed.
2. Level 1 purchase execution blocked.
3. Level 2 cart preparation allowed.
4. Level 2 checkout requires manual confirmation.
5. Level 3 autonomous purchase allowed.
6. Budget limits exceeded blocked.
7. Un-whitelisted categories blocked.
8. Un-whitelisted merchants blocked/referred.
9. Invalid payment methods blocked.
10. Price-hikes mid-session blocked (price-change protection).
11. Out-of-stock items blocked.
12. Database connection offline during checkout blocked.
13. Frontend policy claim overrides blocked.
14. Malicious LLM claim properties blocked.

---

## 10. Future Roadmap
- **Phase 5: Payments & Capturing Transactions**
  - Integrate real Razorpay order execution, transaction capture flows, and webhook signature verification.
- **Phase 6: Admin Policy Dashboard**
  - Manage categories, merchants, budget thresholds, and review historical audit logs.
- **Phase 7: Real Merchant Catalog Integration**
  - Connect simulated services to live commerce catalogs and merchant APIs.
