/**
 * Audit Log Service
 * Records important agent steps, policy decisions, and payment events.
 * Fail-safe design: falls back to in-memory logs if database is unreachable.
 */

import { prisma } from "../lib/prisma";

export interface AuditLogEntry {
  id: string;
  sessionId: string;
  timestamp: Date;
  step: string;
  message: string;
  details?: any;
}

export class AuditService {
  // In-memory fallback log store
  private static memoryLogs: AuditLogEntry[] = [];

  /**
   * Log a new transaction step.
   */
  static async logStep(
    sessionId: string,
    step: string,
    message: string,
    details?: any
  ): Promise<AuditLogEntry> {
    const logEntry: AuditLogEntry = {
      id: Math.random().toString(36).substring(2, 15),
      sessionId,
      timestamp: new Date(),
      step,
      message,
      details: details ? JSON.parse(JSON.stringify(details)) : null,
    };

    // Always push to in-memory cache for fast querying and database fallback
    this.memoryLogs.push(logEntry);
    console.log(`[AUDIT] [${step}] [${sessionId}] ${message}`, details ? JSON.stringify(details) : "");

    try {
      // Attempt db write
      await prisma.auditLog.create({
        data: {
          sessionId,
          step,
          message,
          details: details ? details : undefined,
        },
      });
    } catch (error) {
      console.warn(
        "[AuditService] Failed to write log to PostgreSQL database. Kept in memory fallback.",
        error instanceof Error ? error.message : error
      );
    }

    return logEntry;
  }

  /**
   * Retrieve all audit logs for a given session.
   */
  static async getLogs(sessionId: string): Promise<AuditLogEntry[]> {
    try {
      const dbLogs = await prisma.auditLog.findMany({
        where: { sessionId },
        orderBy: { timestamp: "asc" },
      });

      if (dbLogs.length > 0) {
        return dbLogs.map((l) => ({
          id: l.id,
          sessionId: l.sessionId,
          timestamp: l.timestamp,
          step: l.step,
          message: l.message,
          details: l.details,
        }));
      }
    } catch (error) {
      console.warn(
        "[AuditService] Failed to query PostgreSQL database. Returning in-memory fallback list.",
        error instanceof Error ? error.message : error
      );
    }

    // Return filtered memory logs if db is empty or failed
    return this.memoryLogs.filter((l) => l.sessionId === sessionId);
  }

  /**
   * Clear in-memory logs (primarily for test scenarios).
   */
  static clearMemoryLogs() {
    this.memoryLogs = [];
  }
}
