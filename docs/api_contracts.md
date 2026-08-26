# AgentGuard API Contracts

This document outlines the API endpoints, request schemas, response formats, and webhooks for the **AgentGuard** platform.

---

## 1. System Health & Diagnostics

### `GET /api/health`
Checks the service status, database connectivity, and mock mode configurations.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-08-26T14:15:00.000Z",
  "database": "connected",
  "mockMode": {
    "gemini": true,
    "razorpay": true
  }
}
```

---

## 2. Customer Shopping Chat

### `POST /api/chat`
Send shopper messages to the AI Buyer Agent.

**Request Body:**
```json
{
  "message": "Buy me blue running shoes, size 10, under ₹2,000",
  "sessionId": "session-xyz-123",
  "autonomyLevel": 2
}
```

**Response (Match Found / Ready for Checkout):**
```json
{
  "sessionId": "session-xyz-123",
  "response": "I've found the perfect shoe. The 'Blue Streak' from QuickStep Sports. It's a size 10 blue running shoe for ₹1,899, which is within your ₹2,000 budget.",
  "status": "PREPARED", 
  "extractedIntent": {
    "category": "shoes",
    "purpose": "running",
    "color": "blue",
    "size": 10,
    "max_budget": 2000,
    "currency": "INR",
    "autonomous_purchase": false
  },
  "actionRequired": "CONFIRM_PURCHASE",
  "product": {
    "id": "prod-101",
    "merchantId": "merch-1",
    "name": "Blue Streak Running Shoe",
    "price": 1899,
    "currency": "INR",
    "color": "blue",
    "size": 10
  },
  "auditLogs": [
    {
      "step": "INTENT_EXTRACTION",
      "message": "Extracted intent: Category = shoes, Size = 10, Budget = 2000"
    },
    {
      "step": "PRODUCT_DISCOVERY",
      "message": "Found 3 matching blue shoes. 1 matches size 10 and budget."
    },
    {
      "step": "POLICY_CHECK",
      "message": "Policy status: ALLOWED. (Price ₹1,899 <= Limit ₹2,000)"
    }
  ]
}
```

**Response (No Match / Clarification Needed):**
```json
{
  "sessionId": "session-xyz-123",
  "response": "I couldn't find a blue size-10 shoe under ₹2,000. I did find a black size-10 option for ₹1,899. Would you like me to relax the color preference?",
  "status": "CLARIFICATION_REQUIRED",
  "actionRequired": "RELAX_CONSTRAINT",
  "alternatives": [
    {
      "id": "prod-102",
      "name": "Black Shadow Running Shoe",
      "price": 1899,
      "color": "black",
      "size": 10,
      "conflict": "color (expected blue, found black)"
    }
  ]
}
```

---

## 3. Merchant & Catalog API (AI-Readable)

### `GET /api/merchants`
Returns a list of all active simulated merchants.

**Response:**
```json
[
  {
    "id": "merch-quickstep",
    "name": "QuickStep Sports",
    "logoUrl": "/images/merchants/quickstep.png",
    "description": "Your go-to store for high-performance running shoes and trainers.",
    "rating": 4.8,
    "active": true
  }
]
```

### `GET /api/merchants/:id`
Retrieves detailed information for a single merchant.

**Response:**
```json
{
  "id": "merch-quickstep",
  "name": "QuickStep Sports",
  "logoUrl": "/images/merchants/quickstep.png",
  "description": "Your go-to store for high-performance running shoes and trainers.",
  "rating": 4.8,
  "active": true
}
```

### `GET /api/products`
Retrieves product catalogs across all merchants. Supports filtering via search parameters.

**Query Parameters:**
- `category` (string, optional) - e.g., "shoes"
- `color` (string, optional) - e.g., "blue"
- `maxPrice` (number, optional) - e.g., 2000
- `size` (number, optional) - e.g., 10
- `merchantId` (string, optional) - e.g., "merch-quickstep"

**Response:**
```json
[
  {
    "id": "prod-exact-match",
    "merchantId": "merch-quickstep",
    "merchantName": "QuickStep Sports",
    "name": "SwiftRun Blue Trainer",
    "category": "shoes",
    "purpose": ["running", "training"],
    "color": "blue",
    "sizes": [8, 9, 10, 11],
    "price": 1899,
    "currency": "INR",
    "rating": 4.5,
    "stock": 8,
    "returnDays": 30,
    "shippingDays": 2,
    "description": "Highly responsive running shoe with breathable mesh upper.",
    "active": true
  }
]
```

### `GET /api/products/:id`
Retrieves details for a single product by ID.

**Response:**
```json
{
  "id": "prod-exact-match",
  "merchantId": "merch-quickstep",
  "merchantName": "QuickStep Sports",
  "name": "SwiftRun Blue Trainer",
  "category": "shoes",
  "purpose": ["running", "training"],
  "color": "blue",
  "sizes": [8, 9, 10, 11],
  "price": 1899,
  "currency": "INR",
  "rating": 4.5,
  "stock": 8,
  "returnDays": 30,
  "shippingDays": 2,
  "description": "Highly responsive running shoe with breathable mesh upper.",
  "active": true
}
```

### `GET /api/products/:id/inventory`
Checks current stock levels and checks size eligibility.

**Query Parameters:**
- `size` (number, optional) - verify availability of a specific size.

**Response:**
```json
{
  "productId": "prod-exact-match",
  "sizeCheck": 10,
  "inStock": true,
  "availableStock": 8
}
```

---

## 4. Policy Management & System Orders

### `GET /api/policy`
Retrieves the active global User Policy settings (max budget, category list, merchant list, payment methods, and autonomy level).

**Response:**
```json
{
  "success": true,
  "policy": {
    "id": "default-policy",
    "maxBudget": 2000,
    "allowedCategories": ["shoes", "clothing"],
    "allowedMerchants": ["QuickStep Sports", "UrbanStride"],
    "allowedPaymentMethods": ["UPI"],
    "autonomyLevel": 2
  }
}
```

### `POST /api/policy`
Update the deterministic buyer security policy.

**Request Body:**
```json
{
  "maxBudget": 2500,
  "allowedCategories": ["shoes", "clothing"],
  "allowedMerchants": ["QuickStep Sports", "UrbanStride", "SportKart"],
  "allowedPaymentMethods": ["UPI", "Card"],
  "autonomyLevel": 3
}
```

**Response:**
```json
{
  "success": true,
  "policy": {
    "id": "default-policy",
    "maxBudget": 2500,
    "allowedCategories": ["shoes", "clothing"],
    "allowedMerchants": ["QuickStep Sports", "UrbanStride", "SportKart"],
    "allowedPaymentMethods": ["UPI", "Card"],
    "autonomyLevel": 3
  }
}
```

---

### `GET /api/orders`
Retrieves a list of all historical database transaction order records.

**Response:**
```json
{
  "success": true,
  "orders": [
    {
      "id": "clt123abc000008ld",
      "razorpayOrderId": "order_mock_7a6d8s9",
      "razorpayPaymentId": "pay_mock_9a8s7d6",
      "status": "PAYMENT_CAPTURED",
      "totalAmount": 1899,
      "createdAt": "2026-08-26T14:15:00.000Z",
      "items": [
        {
          "id": "item-01",
          "productId": "prod-101",
          "productName": "SwiftRun Blue Trainer",
          "price": 1899,
          "quantity": 1
        }
      ]
    }
  ]
}
```

---

## 5. Checkout & Payments

### `POST /api/checkout`
Triggers the pre-payment safety gate (database online, inventory checks, price integrity, policy rules) and creates the Razorpay test mode transaction.

**Request Body:**
```json
{
  "sessionId": "session_98a7sd8f",
  "productId": "prod-exact-match",
  "size": 10,
  "quantity": 1,
  "originalPrice": 1899,
  "authorizationStatus": "USER_CONFIRMED"
}
```

**Response (Success - Order Created):**
```json
{
  "orderId": "clt123abc000008ld",
  "razorpayOrderId": "order_mock_7a6d8s9",
  "amount": 189900,
  "currency": "INR",
  "keyId": "rzp_test_yourkeyid"
}
```

**Response (Error - Rules Violation):**
```json
{
  "error": "Current price ₹2,399 exceeds your authorized budget of ₹2,000.",
  "decision": "BLOCK"
}
```

---

### `POST /api/payment/verify`
Server-side transaction verification endpoint. Validates client-side signature integrity and transitions order statuses.

**Request Body:**
```json
{
  "orderId": "clt123abc000008ld",
  "razorpayOrderId": "order_mock_7a6d8s9",
  "razorpayPaymentId": "pay_mock_9a8s7d6",
  "razorpaySignature": "valid_mock_signature",
  "sessionId": "session_98a7sd8f"
}
```

**Response (Signature Valid):**
```json
{
  "success": true,
  "message": "Payment verified successfully."
}
```

**Response (Signature Invalid):**
```json
{
  "error": "Invalid payment signature."
}
```

---

### `POST /api/webhooks/razorpay`
Server-to-server webhook callback. Performs signature checks on the raw string request body and processes order confirmations idempotently.

**Headers:**
- `x-razorpay-signature`: HMAC-SHA256 signature generated by Razorpay.

**Request Body (Raw Payload):**
```json
{
  "event": "payment.captured",
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_mock_9a8s7d6",
        "amount": 189900,
        "currency": "INR",
        "order_id": "order_mock_7a6d8s9",
        "status": "captured"
      }
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "event": "payment.captured"
}
```
*(Returns `200 OK` immediately if the order was already marked as PAID to prevent double-deducting inventory).*
