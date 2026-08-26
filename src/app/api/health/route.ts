import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  let databaseStatus = "disconnected";

  try {
    // Probe database connection using a fast query
    await prisma.$queryRaw`SELECT 1`;
    databaseStatus = "connected";
  } catch (error) {
    console.warn(
      "[HealthCheck] Database connection probe failed:",
      error instanceof Error ? error.message : error
    );
  }

  const isGeminiConfigured = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== "";
  const isRazorpayConfigured = !!process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_ID !== "rzp_test_placeholder";

  return NextResponse.json(
    {
      status: "healthy",
      timestamp: new Date().toISOString(),
      database: databaseStatus,
      mockMode: {
        gemini: !isGeminiConfigured,
        razorpay: !isRazorpayConfigured,
      },
    },
    { status: 200 }
  );
}
