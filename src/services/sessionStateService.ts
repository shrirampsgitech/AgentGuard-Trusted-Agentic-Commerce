import { prisma } from "../lib/prisma";
import { BuyerIntent } from "./buyerAgent";

export interface SessionStateData {
  id: string;
  buyerIntent: BuyerIntent | null;
  selectedProductId: string | null;
  relaxationDecisions: string[];
  authorizationState: string;
}

export class SessionStateService {
  // In-memory fallback map
  private static memorySessions = new Map<string, SessionStateData>();

  /**
   * Save or update a session state.
   */
  static async saveSession(
    id: string,
    buyerIntent: BuyerIntent,
    selectedProductId: string | null = null,
    relaxationDecisions: string[] = [],
    authorizationState: string = "NONE"
  ): Promise<SessionStateData> {
    const sessionData: SessionStateData = {
      id,
      buyerIntent: buyerIntent ? JSON.parse(JSON.stringify(buyerIntent)) : null,
      selectedProductId,
      relaxationDecisions,
      authorizationState,
    };

    // Always cache in memory
    this.memorySessions.set(id, sessionData);

    try {
      await prisma.sessionState.upsert({
        where: { id },
        update: {
          buyerIntent: buyerIntent ? (buyerIntent as any) : undefined,
          selectedProductId,
          relaxationDecisions,
          authorizationState,
        },
        create: {
          id,
          buyerIntent: buyerIntent ? (buyerIntent as any) : undefined,
          selectedProductId,
          relaxationDecisions,
          authorizationState,
        },
      });
    } catch (error) {
      console.warn(
        `[SessionStateService] Failed to write session state to database. Kept in memory fallback.`,
        error instanceof Error ? error.message : error
      );
    }

    return sessionData;
  }

  /**
   * Retrieve a session state.
   */
  static async getSession(id: string): Promise<SessionStateData | null> {
    try {
      const dbSession = await prisma.sessionState.findUnique({
        where: { id },
      });

      if (dbSession) {
        return {
          id: dbSession.id,
          buyerIntent: dbSession.buyerIntent as unknown as BuyerIntent,
          selectedProductId: dbSession.selectedProductId,
          relaxationDecisions: dbSession.relaxationDecisions,
          authorizationState: dbSession.authorizationState,
        };
      }
    } catch (error) {
      console.warn(
        `[SessionStateService] Failed to read session state from database. Falling back to in-memory cache.`,
        error instanceof Error ? error.message : error
      );
    }

    return this.memorySessions.get(id) || null;
  }

  /**
   * Delete a session state.
   */
  static async deleteSession(id: string): Promise<void> {
    this.memorySessions.delete(id);
    try {
      await prisma.sessionState.delete({
        where: { id },
      });
    } catch (error) {
      // Ignore if not found or DB offline
    }
  }

  /**
   * Clear all sessions (primarily for demo/test resets).
   */
  static async clearAllSessions(): Promise<void> {
    this.memorySessions.clear();
    try {
      await prisma.sessionState.deleteMany({});
    } catch (error) {
      // Ignore if DB offline
    }
  }
}
