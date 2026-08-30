/**
 * InMemoryOrderStore
 *
 * An in-process fallback store for Order records when PostgreSQL is offline.
 * Mirrors the Prisma Order + OrderItem schema so checkout and payment/verify
 * routes degrade gracefully without a live database connection.
 *
 * Lifecycle: module-scoped Map — persists for the lifetime of the Next.js
 * server worker process. In production you always want a real DB; this
 * fallback is for local development and demo environments.
 */

export interface InMemoryOrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  size: number;
  color: string;
  price: number;
}

export interface InMemoryOrder {
  id: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  razorpaySignature: string | null;
  status: string; // "CREATED" | "PENDING_PAYMENT" | "PAYMENT_CAPTURED" | "PAYMENT_FAILED"
  totalAmount: number;
  currency: string;
  buyerName: string;
  shippingAddress: string;
  createdAt: Date;
  updatedAt: Date;
  items: InMemoryOrderItem[];
}

const globalForOrders = globalThis as unknown as {
  inMemoryOrders: Map<string, InMemoryOrder> | undefined;
};

const getOrdersMap = (): Map<string, InMemoryOrder> => {
  if (!globalForOrders.inMemoryOrders) {
    globalForOrders.inMemoryOrders = new Map<string, InMemoryOrder>();
  }
  return globalForOrders.inMemoryOrders;
};

function randomId(prefix = ""): string {
  return `${prefix}${Math.random().toString(36).substring(2, 14)}`;
}

export const InMemoryOrderStore = {
  /**
   * Create a new order with one item.
   */
  create(input: {
    productId: string;
    quantity: number;
    size: number;
    color: string;
    price: number;
    totalAmount: number;
    currency?: string;
    buyerName?: string;
    shippingAddress?: string;
  }): InMemoryOrder {
    const id = randomId("mem_order_");
    const itemId = randomId("mem_item_");
    const now = new Date();
    const order: InMemoryOrder = {
      id,
      razorpayOrderId: null,
      razorpayPaymentId: null,
      razorpaySignature: null,
      status: "CREATED",
      totalAmount: input.totalAmount,
      currency: input.currency ?? "INR",
      buyerName: input.buyerName ?? "Shopper",
      shippingAddress: input.shippingAddress ?? "Sandbox Test Address",
      createdAt: now,
      updatedAt: now,
      items: [
        {
          id: itemId,
          orderId: id,
          productId: input.productId,
          quantity: input.quantity,
          size: input.size,
          color: input.color,
          price: input.price,
        },
      ],
    };
    getOrdersMap().set(id, order);
    return order;
  },

  /**
   * Find an order by its internal ID.
   */
  findById(id: string): InMemoryOrder | null {
    return getOrdersMap().get(id) ?? null;
  },

  /**
   * Update an order's fields.
   */
  update(
    id: string,
    data: Partial<Pick<InMemoryOrder, "razorpayOrderId" | "razorpayPaymentId" | "razorpaySignature" | "status">>
  ): InMemoryOrder | null {
    const order = getOrdersMap().get(id);
    if (!order) return null;
    const updated: InMemoryOrder = { ...order, ...data, updatedAt: new Date() };
    getOrdersMap().set(id, updated);
    return updated;
  },

  /**
   * Attempt an atomic status transition from expectedStatus → newStatus.
   * Returns true if the update was applied, false if the order was already
   * in a different state (idempotency guard).
   */
  updateStatus(
    id: string,
    expectedStatus: string,
    newStatus: string,
    extra?: Partial<Pick<InMemoryOrder, "razorpayPaymentId" | "razorpaySignature">>
  ): boolean {
    const order = getOrdersMap().get(id);
    if (!order || order.status !== expectedStatus) return false;
    getOrdersMap().set(id, {
      ...order,
      status: newStatus,
      ...(extra ?? {}),
      updatedAt: new Date(),
    });
    return true;
  },

  /**
   * List all orders (for the /api/orders route).
   */
  list(): InMemoryOrder[] {
    return Array.from(getOrdersMap().values());
  },

  /** Clear all orders — used by demo reset. */
  clear(): void {
    getOrdersMap().clear();
  },
};
