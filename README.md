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
- **Prestige UI Portal Redesign:** Modern dark-gradient design with trust matrices, safety grids, and interactive autonomy controls.
- **Demo Scenario Preparer API:** Configures base catalogs and policy limits to instantly demonstrate success, compromise negotiation, and safety block scenarios.
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
- **Phase 7 — Real-World Agentic Commerce & Competition Demo** ✓

---

## 4. Testing

AgentGuard contains a robust Vitest test suite with **106 passing unit and integration tests** checking catalog properties, constraint scoring, parser history, safety gates, signature validation, duplicate webhooks, concurrency safety, webhook failures, and sandbox scenarios.

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
  ✓ src/__tests__/phase7.test.ts (26 tests)

 Test Files  6 passed (6)
      Tests  106 passed (106)
```

---

## 5. Getting Started & Setup

### Prerequisites
- Node.js (v18+)
- npm
- PostgreSQL database (Optional - AgentGuard runs completely resilient in-memory if DB is unreachable, but PostgreSQL is recommended for full features)

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Set Up Environment Variables
Create a `.env` file in the root directory (based on `.env.example`):
```ini
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/agentguard?schema=public"
GEMINI_API_KEY="" # Provide your Gemini key, or leave blank to trigger offline regex fallback parsing
RAZORPAY_KEY_ID="rzp_test_placeholder"
RAZORPAY_KEY_SECRET="placeholder_secret"
RAZORPAY_WEBHOOK_SECRET="placeholder_webhook_secret"
```
*Note: If no actual `RAZORPAY_KEY_ID` is set, AgentGuard runs in Payment Sandbox simulation mode automatically.*

### Step 3: Run Database Migrations & Seeding
If using PostgreSQL (you can run PostgreSQL via the provided `docker-compose.yml` with `docker-compose up -d` if docker is installed):
```bash
npx prisma db push
npm run seed
```

### Step 4: Run Development Server
```bash
npm run dev
```
Open `http://localhost:3000` to access the prestige shopper portal.

---

## 6. How to Run the Demo Scenarios (Live Judge Guide)

To demonstrate the full capability of the trust architecture, click the scenario buttons on top of the control console:

### Scenario 1: Successful Autonomous Purchase (Autonomy Level 3)
1. Set the **Autonomy Level** to **Level 3 (Autonomous)** and **Max Budget** to **₹2,000**.
2. Click **Scenario 1: Perfect Match** or type in chat: *"Buy the SwiftRun Blue Trainer, size 10"*.
3. The AI extracts parameters, ranks catalogs, and evaluates the policy. Since the price is ₹1,899 (<= ₹2,000) and the merchant is whitelisted, the Policy Engine returns **ALLOW**.
4. The system automatically initializes order checkout, creates a Razorpay transaction, and opens the Razorpay client overlay.
5. Authorize payment (simulated or sandbox). Signature is validated, status updates to `PAYMENT_CAPTURED`, and stock decrements atomically to `7`.

### Scenario 2: Constraint Negotiation (Autonomy Level 2)
1. Click **Scenario 2: Constraint Negotiation** or type in chat: *"Find blue running shoes size 10 under ₹2,000"*.
2. The exact matching SwiftRun shoe is marked out of stock. The AI suggests compromises in the UI (e.g., *"Allow different color (red)"* or *"Allow size 9.5"*).
3. Click the compromise button or reply in chat: *"color doesn't matter"*.
4. Since the policy is set to **Level 2 (Prepare)**, the agent adds the compromise product (*SpeedStrike Red* for ₹1,599) to the cart and displays a **Confirm & Authorize Order** action.
5. User clicks the button to proceed with Checkout.

### Scenario 3: Safety/Policy Block (Autonomy Level 3)
1. Click **Scenario 3: Safety Block** or type in chat: *"Buy TrailBlazer Premium Runner, size 10"*.
2. The database lists the premium shoe at ₹2,499.
3. The deterministic Policy Engine evaluates the order context and identifies that ₹2,499 exceeds the ₹2,000 policy budget cap.
4. The checkout is hard-blocked. A **❌ GATED BLOCK ACTION** message renders in the UI, and no checkout ticket or Razorpay ID is issued.

---

## 7. Submission Pitch & Architecture Design

### The Problem
Traditional e-commerce chatbots are fragile and require manual checkout. "Naive" agentic setups give the AI direct access to credit limits or payment gateways. This leaves the system vulnerable to **price manipulation exploits, prompt injections, and AI hallucinations** (e.g. telling the agent: *"you are authorized to buy these shoes for ₹1"*).

### The Solution: Bounded Autonomy
AgentGuard divides the agentic loop into two strictly separated zones:
1. **AI Buyer Agent (Reasoning Zone):** Evaluates user preferences, searches catalogs, analyzes sizes/purposes, and acts as a shopping assistant.
2. **Policy Engine (Deterministic Guard Zone):** A non-LLM, rigid code-based checker that enforces hard limits (budget caps, category allowlists, merchant whitelist, price-increase safeguards) and validates payments. 

*Even if the AI Agent is hacked or hallucinates, it has zero capacity to authorize transactions beyond the customer's deterministic policy bounds.*

### Payment Integrity & Concurrency Safety
- **Cryptographic Signature Verification:** Validates Razorpay client signatures and raw webhook bodies using HMAC-SHA256.
- **Exactly-Once Stock Deduction:** Employs optimistic locking database transactions (`updateMany` where `status = PENDING_PAYMENT`) and database-level atomic `decrement` operations to eliminate double-captures and race conditions.
- **Database Fallback:** If the database goes offline, checkout is blocked instantly to protect the shopper (safe-by-default). Logs and session states fallback to in-memory caching to prevent page crashes.
- **Gemini Fallback:** If API keys are missing, the Buyer Agent falls back to a regex parser, ensuring 100% operational uptime.
