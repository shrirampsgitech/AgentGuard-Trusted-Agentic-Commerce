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

## 4. Policy Management

### `POST /api/policy`
Update the deterministic buyer security policy.

**Request Body:**
```json
{
  "maxBudget": 2500,
  "allowedCategory": "shoes",
  "allowedPaymentMethod": "UPI",
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
    "allowedCategory": "shoes",
    "allowedPaymentMethod": "UPI",
    "autonomyLevel": 3
  }
}
```

---

## 5. Checkout & Payments

### `POST /api/checkout`
Create a payment order inside Razorpay and return the transaction credentials.

**Request Body:**
```json
{
  "productId": "prod-101",
  "size": 10,
  "color": "blue",
  "buyerName": "Suresh Kumar",
  "shippingAddress": "123 Tech Park, Bangalore"
}
```

**Response:**
```json
{
  "orderId": "order-internal-555",
  "razorpayOrderId": "order_Hj231Salkd",
  "amount": 189900,
  "currency": "INR",
  "keyId": "rzp_test_yourkeyid"
}
```

### `POST /api/webhooks/razorpay`
Incoming webhook handler to verify Razorpay signatures and update payment states asynchronously.

**Headers:**
- `X-Razorpay-Signature`: HMAC SHA256 signature generated using the webhook secret.

**Payload:**
```json
{
  "event": "payment.captured",
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_HJk21sKa",
        "amount": 189900,
        "currency": "INR",
        "order_id": "order_Hj231Salkd",
        "status": "captured"
      }
    }
  }
}
```

**Response:**
- `200 OK` (with signature check verification status)
