"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  MessageSquare,
  CreditCard,
  RefreshCw,
  BarChart3,
  CheckCircle,
  ChevronRight,
  Info,
  AlertTriangle,
  Play,
  User,
  Bot,
  Database,
  Sliders,
  DollarSign
} from "lucide-react";

// Mock products database for client simulation
const MOCK_PRODUCTS = [
  {
    id: "prod-101",
    merchantId: "merchant-1",
    merchantName: "QuickStep Sports",
    name: "SwiftRun Blue Trainer",
    category: "shoes",
    purpose: ["running", "training"],
    color: "blue",
    sizes: [8, 9, 10, 11],
    price: 1899,
    currency: "INR",
    rating: 4.5,
    stock: 8,
    returnDays: 30,
  },
  {
    id: "prod-102",
    merchantId: "merchant-1",
    merchantName: "QuickStep Sports",
    name: "AeroMax Black Sneaker",
    category: "shoes",
    purpose: ["running", "walking"],
    color: "black",
    sizes: [7, 8, 9, 10],
    price: 1799,
    currency: "INR",
    rating: 4.2,
    stock: 15,
    returnDays: 14,
  },
  {
    id: "prod-103",
    merchantId: "merchant-1",
    merchantName: "QuickStep Sports",
    name: "TrailBlazer Red Hike",
    category: "shoes",
    purpose: ["hiking", "outdoor"],
    color: "red",
    sizes: [9, 10, 11, 12],
    price: 2499,
    currency: "INR",
    rating: 4.7,
    stock: 4,
    returnDays: 30,
  },
  {
    id: "prod-104",
    merchantId: "merchant-1",
    merchantName: "QuickStep Sports",
    name: "CloudPace Grey Runner",
    category: "shoes",
    purpose: ["running", "marathon"],
    color: "grey",
    sizes: [8, 9, 10],
    price: 1999,
    currency: "INR",
    rating: 4.6,
    stock: 0, // OUT OF STOCK
    returnDays: 30,
  },
  {
    id: "prod-201",
    merchantId: "merchant-2",
    merchantName: "Urban Style Outfitters",
    name: "Denim Trucker Jacket",
    category: "clothing",
    purpose: ["casual", "fashion"],
    color: "blue",
    sizes: [9.5, 10, 10.5],
    price: 1499,
    currency: "INR",
    rating: 4.4,
    stock: 20,
    returnDays: 15,
  },
  {
    id: "prod-301",
    merchantId: "merchant-3",
    merchantName: "Apex Chrono",
    name: "Legacy Quartz Watch",
    category: "accessories",
    purpose: ["formal", "casual"],
    color: "black",
    sizes: [10],
    price: 2999,
    currency: "INR",
    rating: 4.8,
    stock: 5,
    returnDays: 30,
  }
];

interface Message {
  sender: "user" | "agent";
  text: string;
  timestamp: string;
  type?: "text" | "product-card" | "alternatives-card" | "clarification";
  data?: any;
}

interface AuditLog {
  step: string;
  message: string;
  status: "success" | "warning" | "error" | "info";
  time: string;
}

export default function AgentGuardHome() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [apiHealth, setApiHealth] = useState<any>(null);
  const [sessionId, setSessionId] = useState<string>("");
  const [sessionIntent, setSessionIntent] = useState<any>(null);
  
  // Policy values editable on frontend
  const [policyLimit, setPolicyLimit] = useState(2000);
  const [policyAutonomy, setPolicyAutonomy] = useState(2); // 1 = Recommend, 2 = Prepare, 3 = Autonomous
  const [allowedCategories, setAllowedCategories] = useState<string[]>(["shoes", "clothing"]);
  const [allowedMerchants, setAllowedMerchants] = useState<string[]>(["QuickStep Sports", "UrbanStride"]);
  const [allowedPaymentMethods, setAllowedPaymentMethods] = useState<string[]>(["UPI"]);
  
  // Dashboard states
  const [totalRequests, setTotalRequests] = useState(142);
  const [successPurchases, setSuccessPurchases] = useState(84);
  const [blockedPurchases, setBlockedPurchases] = useState(58);
  
  // Active checkout state
  const [activeCheckoutProduct, setActiveCheckoutProduct] = useState<any>(null);
  const [activeOrderId, setActiveOrderId] = useState<string>("");
  const [activeRazorpayOrderId, setActiveRazorpayOrderId] = useState<string>("");
  const [paymentStep, setPaymentStep] = useState<"none" | "paying" | "verifying" | "captured" | "failed">("none");

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Persistence helper for policy adjustments
  const savePolicyToBackend = async (
    limit: number,
    autonomy: number,
    categories: string[],
    merchants: string[],
    payments: string[]
  ) => {
    try {
      await fetch("/api/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxBudget: limit,
          autonomyLevel: autonomy,
          allowedCategories: categories,
          allowedMerchants: merchants,
          allowedPaymentMethods: payments,
        }),
      });
    } catch (error) {
      console.error("Failed to save policy to backend:", error);
    }
  };

  const handleCategoryToggle = (category: string) => {
    const updated = allowedCategories.includes(category)
      ? allowedCategories.filter(c => c !== category)
      : [...allowedCategories, category];
    setAllowedCategories(updated);
    savePolicyToBackend(policyLimit, policyAutonomy, updated, allowedMerchants, allowedPaymentMethods);
  };

  const handleMerchantToggle = (merchant: string) => {
    const updated = allowedMerchants.includes(merchant)
      ? allowedMerchants.filter(m => m !== merchant)
      : [...allowedMerchants, merchant];
    setAllowedMerchants(updated);
    savePolicyToBackend(policyLimit, policyAutonomy, allowedCategories, updated, allowedPaymentMethods);
  };

  const handlePaymentToggle = (payment: string) => {
    const updated = allowedPaymentMethods.includes(payment)
      ? allowedPaymentMethods.filter(p => p !== payment)
      : [...allowedPaymentMethods, payment];
    setAllowedPaymentMethods(updated);
    savePolicyToBackend(policyLimit, policyAutonomy, allowedCategories, allowedMerchants, updated);
  };

  // Initialize with system message & health checks
  useEffect(() => {
    // Generate unique sessionId on start
    setSessionId(`session_${Math.random().toString(36).substring(2, 12)}`);

    // Dynamically inject Razorpay checkout script
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);

    setMessages([
      {
        sender: "agent",
        text: "Welcome to AgentGuard Shopper Portal. I am your autonomous AI Buyer Agent. Give me a shopping request and I will safely coordinate searches, compare values, check budget policies, and prepare checkout orders.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: "text"
      }
    ]);
    
    // Fetch initial API health checks (fail gracefully to mock mode)
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => setApiHealth(data))
      .catch((err) => {
        console.warn("Could not reach health check API, running in client-sandbox mode.", err);
        setApiHealth({ status: "healthy", database: "connected (mock)", mockMode: { gemini: true, razorpay: true } });
      });

    // Load initial active policy settings
    fetch("/api/policy")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.policy) {
          setPolicyLimit(data.policy.maxBudget);
          setPolicyAutonomy(data.policy.autonomyLevel);
          setAllowedCategories(data.policy.allowedCategories || ["shoes", "clothing"]);
          setAllowedMerchants(data.policy.allowedMerchants || ["QuickStep Sports", "UrbanStride"]);
          setAllowedPaymentMethods(data.policy.allowedPaymentMethods || ["UPI"]);
        }
      })
      .catch((err) => console.warn("Failed to fetch initial policy settings:", err));

    // Populate default audit logs
    setAuditLogs([
      { step: "SYSTEM_BOOT", message: "AgentGuard microservices started successfully", status: "success", time: "14:11:41" },
      { step: "DB_INIT", message: "Connected to PostgreSQL database catalog pool", status: "success", time: "14:11:42" },
      { step: "POLICY_BOOT", message: "Deterministic Policy Engine initialized", status: "success", time: "14:11:42" }
    ]);
  }, []);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fast format for currency
  const formatINR = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0
    }).format(val);
  };

  // Pre-canned shopping templates
  const applyTemplate = (text: string) => {
    setInputMessage(text);
  };

  // Core processing orchestration (Phase 3 Backend Chat integrations)
  const handleSendMessage = async (textToSend?: string) => {
    const rawText = textToSend || inputMessage;
    if (!rawText.trim()) return;

    // Add user message to screen
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: Message = { sender: "user", text: rawText, timestamp };
    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputMessage("");
    setIsProcessing(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: rawText,
          sessionId: sessionId,
          sessionIntent: sessionIntent,
          policyAutonomy: policyAutonomy,
          policyLimit: policyLimit,
        }),
      });

      const data = await response.json();
      
      // Update session state
      setSessionIntent(data.intent);
      
      // Check block/success count updates from audit logs
      if (data.auditLogs) {
        const blocks = data.auditLogs.filter((log: any) => log.step.includes("BLOCKED") || log.step.includes("BLOCK")).length;
        if (blocks > 0) setBlockedPurchases((prev) => prev + 1);
        
        // Render logs in the right panel
        const formattedLogs = data.auditLogs.map((log: any) => ({
          step: log.step,
          message: log.message,
          status: log.step.includes("BLOCKED") || log.step.includes("FAIL")
            ? "error"
            : log.step.includes("WARN") || log.step.includes("ALERT") || log.step.includes("RELAX")
            ? "warning"
            : "success",
          time: new Date(log.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        }));
        setAuditLogs(formattedLogs);
      }

      // Add Agent response message
      let msgType: "text" | "product-card" | "alternatives-card" | "clarification" = "text";
      let msgData: any = null;

      if (data.status === "NEEDS_CLARIFICATION") {
        msgType = "clarification";
      } else if (
        data.status === "PRODUCTS_FOUND" ||
        data.status === "APPROVED_FOR_CHECKOUT" ||
        data.status === "WAITING_FOR_USER"
      ) {
        msgType = "product-card";
        msgData = {
          product: data.selectedProduct,
          size: data.intent?.size?.value,
          color: data.intent?.color?.value || "any",
          policyResult: data.policyResult,
        };
      } else if (data.status === "NO_EXACT_MATCH") {
        msgType = "alternatives-card";
        msgData = {
          alternatives: data.alternatives.map((a: any) => ({
            ...a.product,
            explanation: a.explanation,
          })),
          originalPreferences: {
            color: data.intent?.color?.value,
            size: data.intent?.size?.value,
            budget: data.intent?.maxBudget?.value,
          },
        };
      }

      setMessages((prev) => [
        ...prev,
        {
          sender: "agent",
          text: data.message,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          type: msgType,
          data: msgData,
        },
      ]);
      
      setTotalRequests((prev) => prev + 1);
    } catch (error) {
      console.error("[Chat UI] Network or server execution failed:", error);
      setMessages((prev) => [
        ...prev,
        {
          sender: "agent",
          text: "I encountered a communication error with the Buyer Agent service. Please verify your server is running.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  // Launch Razorpay Order trigger
  const triggerPaymentOrder = async (product: any, addAudit?: any, autonomous = false) => {
    const logger = addAudit || ((step: string, message: string, status: string) => {
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setAuditLogs((prev) => [{ step, message, status: status as any, time }, ...prev]);
    });

    logger("PAYMENT_SERVICE", `Contacting checkout API to initiate safety validation and order creation...`, "info");
    setActiveCheckoutProduct(product);
    setPaymentStep("paying");

    try {
      const checkoutSize = sessionIntent?.size?.value || 10;
      const checkoutOriginalPrice = sessionIntent?.originalPrice?.value !== undefined 
        ? sessionIntent.originalPrice.value 
        : product.price;
      const checkoutAuthStatus = sessionIntent?.authorizationStatus?.value || "NONE";

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          productId: product.id,
          size: checkoutSize,
          quantity: 1,
          originalPrice: checkoutOriginalPrice,
          authorizationStatus: checkoutAuthStatus,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        logger("CHECKOUT_BLOCKED", `Checkout blocked: ${data.error || "Safety rules violation"}`, "error");
        setPaymentStep("failed");
        setBlockedPurchases((prev) => prev + 1);
        setMessages((prev) => [
          ...prev,
          {
            sender: "agent",
            text: `❌ Checkout blocked: ${data.error || "Policy Engine rules violation."}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
        return;
      }

      const { orderId, razorpayOrderId, amount, currency, keyId } = data;
      setActiveOrderId(orderId);
      setActiveRazorpayOrderId(razorpayOrderId);
      logger("RAZORPAY_ORDER_CREATED", `Razorpay Order generated successfully. ID: ${razorpayOrderId}`, "success");

      // Level 3 autonomous pre-authorization bypasses checkout window popup in tests
      if (autonomous) {
        logger("PAYMENT_AUTONOMOUS", "Autonomy Level 3: Auto-authorizing checkout payment", "info");
        await verifyPaymentSignatureOnBackend(
          orderId,
          razorpayOrderId,
          `pay_auto_${Math.random().toString(36).substring(2, 12)}`,
          "valid_mock_signature"
        );
        return;
      }

      // For Level 2, try to open the official Razorpay Checkout widget
      if (typeof window !== "undefined" && (window as any).Razorpay && keyId && keyId !== "rzp_test_placeholder") {
        logger("PAYMENT_POPUP_OPEN", "Launching Razorpay secure payment checkout popup...", "info");
        const options = {
          key: keyId,
          amount: amount,
          currency: currency,
          name: "AgentGuard Sandbox",
          description: `Payment for ${product.name}`,
          order_id: razorpayOrderId,
          handler: async function (response: any) {
            logger("PAYMENT_POPUP_SUCCESS", "Widget transaction complete. Forwarding to signature check...", "info");
            await verifyPaymentSignatureOnBackend(
              orderId,
              razorpayOrderId,
              response.razorpay_payment_id,
              response.razorpay_signature
            );
          },
          prefill: {
            name: "Shopper",
            email: "shopper@agentguard.ai",
            contact: "9999999999",
          },
          theme: { color: "#4f46e5" },
          modal: {
            ondismiss: function () {
              logger("PAYMENT_CANCELLED", "User closed the payment popup window.", "warning");
              handleVerificationFailure("Payment cancelled by user.");
            }
          }
        };
        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      } else {
        logger("PAYMENT_SANDBOX_MOCK", "No credentials or script. Ready for manual mock action.", "info");
        setMessages((prev) => [
          ...prev,
          {
            sender: "agent",
            text: `I have prepared the Order: ${razorpayOrderId}. Please authorize sandbox payment in the right shield panel.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      }
    } catch (err) {
      console.error(err);
      logger("PAYMENT_SERVICE_FAILED", "Network error starting payment checkout.", "error");
      setPaymentStep("failed");
    }
  };

  // Perform server-side HMAC check on the backend API
  const verifyPaymentSignatureOnBackend = async (
    orderId: string,
    rzpOrderId: string,
    rzpPaymentId: string,
    rzpSignature: string
  ) => {
    setPaymentStep("verifying");
    const logger = (step: string, message: string, status: "success" | "warning" | "error" | "info" = "success") => {
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setAuditLogs((prev) => [{ step, message, status, time }, ...prev]);
    };

    logger("PAYMENT_VERIFICATION_STARTED", "Starting transaction verification with backend...", "info");

    try {
      const response = await fetch("/api/payment/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          razorpayOrderId: rzpOrderId,
          razorpayPaymentId: rzpPaymentId,
          razorpaySignature: rzpSignature,
          sessionId,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setPaymentStep("captured");
        setSuccessPurchases((prev) => prev + 1);
        logger("PAYMENT_CAPTURED", `Signature validated. Order confirmed.`, "success");
        setMessages((prev) => [
          ...prev,
          {
            sender: "agent",
            text: `🎉 Thank you! Payment captured and verified successfully. Order ID ${orderId} has been confirmed. Stock inventory updated.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      } else {
        handleVerificationFailure(data.error || "Payment verification failed.");
      }
    } catch (err) {
      console.error(err);
      handleVerificationFailure("Network error during verification.");
    }
  };

  const handleVerificationFailure = (reason: string) => {
    setPaymentStep("failed");
    setBlockedPurchases((prev) => prev + 1);
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setAuditLogs((prev) => [
      { step: "PAYMENT_FAILED", message: `Transaction failed: ${reason}`, status: "error", time },
      ...prev
    ]);
    setMessages((prev) => [
      ...prev,
      {
        sender: "agent",
        text: `❌ Checkout failed: ${reason}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  // Handle manual payment modal submission
  const completeManualPayment = async (success: boolean) => {
    const mockPaymentId = `pay_mock_${Math.random().toString(36).substring(2, 12)}`;
    const mockSignature = success ? "valid_mock_signature" : "invalid_mock_signature";
    await verifyPaymentSignatureOnBackend(activeOrderId, activeRazorpayOrderId, mockPaymentId, mockSignature);
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-[#f4f4f5] font-sans antialiased">
      {/* Top Premium Nav */}
      <header className="border-b border-[#27272a] bg-[#09090b]/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-indigo-500 to-emerald-500 p-2 rounded-xl text-black">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              AgentGuard
            </h1>
            <p className="text-xs text-[#a1a1aa]">
              Secure AI-Agentic Commerce Platform
            </p>
          </div>
        </div>

        {/* Health status badges */}
        <div className="flex items-center gap-3 text-xs">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 px-3 py-1.5 mr-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Admin Console</span>
          </Link>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#18181b] border border-[#27272a]">
            <Database className="h-3 w-3 text-emerald-400" />
            <span>DB Pool: {apiHealth?.database === "connected" ? "PostgreSQL Connected" : "Local Mock Sandbox"}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#18181b] border border-[#27272a]">
            <Bot className="h-3 w-3 text-purple-400" />
            <span>AI: {apiHealth?.mockMode?.gemini ? "MOCK Mode" : "Gemini API Live"}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#18181b] border border-[#27272a]">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
            <span>Health Status: ONLINE</span>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-6 space-y-6">
        {/* Core Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-[#18181b]/50 border border-[#27272a] p-5 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-[#a1a1aa] uppercase tracking-wider">Total Shopping Requests</p>
              <h3 className="text-2xl font-bold mt-1 text-white">{totalRequests}</h3>
            </div>
            <div className="bg-indigo-500/10 p-3 rounded-xl text-indigo-400">
              <MessageSquare className="h-5 w-5" />
            </div>
          </div>
          <div className="bg-[#18181b]/50 border border-[#27272a] p-5 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-[#a1a1aa] uppercase tracking-wider">Successful Purchases</p>
              <h3 className="text-2xl font-bold mt-1 text-emerald-400">{successPurchases}</h3>
            </div>
            <div className="bg-emerald-500/10 p-3 rounded-xl text-emerald-400">
              <ShoppingCart className="h-5 w-5" />
            </div>
          </div>
          <div className="bg-[#18181b]/50 border border-[#27272a] p-5 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-[#a1a1aa] uppercase tracking-wider">Policy Blocked Attempts</p>
              <h3 className="text-2xl font-bold mt-1 text-rose-500">{blockedPurchases}</h3>
            </div>
            <div className="bg-rose-500/10 p-3 rounded-xl text-rose-400">
              <ShieldAlert className="h-5 w-5" />
            </div>
          </div>
          <div className="bg-[#18181b]/50 border border-[#27272a] p-5 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-[#a1a1aa] uppercase tracking-wider">Avg Decision Latency</p>
              <h3 className="text-2xl font-bold mt-1 text-white">1.8s</h3>
            </div>
            <div className="bg-amber-500/10 p-3 rounded-xl text-amber-400">
              <RefreshCw className="h-5 w-5 animate-spin" style={{ animationDuration: '6s' }} />
            </div>
          </div>
        </div>

        {/* Triple Panel Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Column 1: AI Buyer Chat Hub (Span 5) */}
          <div className="lg:col-span-5 flex flex-col bg-[#18181b]/30 border border-[#27272a] rounded-2xl overflow-hidden h-[620px]">
            {/* Header */}
            <div className="px-4 py-3 bg-[#18181b]/60 border-b border-[#27272a] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-indigo-400" />
                <span className="text-sm font-semibold">AI Buyer Agent Chat</span>
              </div>
              <span className="text-xs text-indigo-400 font-mono">Autonomy Level: {policyAutonomy}</span>
            </div>

            {/* Chat Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex gap-3 max-w-[85%] ${
                    msg.sender === "user" ? "ml-auto flex-row-reverse" : ""
                  }`}
                >
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                      msg.sender === "user"
                        ? "bg-[#27272a] text-zinc-200"
                        : "bg-indigo-600 text-white"
                    }`}
                  >
                    {msg.sender === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </div>

                  <div className="space-y-2">
                    <div
                      className={`rounded-2xl px-4 py-2.5 text-sm ${
                        msg.sender === "user"
                          ? "bg-indigo-600 text-white"
                          : "bg-[#27272a]/70 text-zinc-100 border border-[#3f3f46]/40"
                      }`}
                    >
                      {msg.text}
                    </div>

                    {/* Render Special Cards */}
                    {msg.type === "product-card" && msg.data && (
                      <div className="bg-[#1e1e24] border border-indigo-500/30 rounded-xl p-4 space-y-3 mt-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-xs text-[#a1a1aa] bg-[#27272a] px-2 py-0.5 rounded">
                              {msg.data.product.merchantName}
                            </span>
                            <h4 className="font-semibold text-white mt-1">{msg.data.product.name}</h4>
                          </div>
                          <span className="text-emerald-400 font-bold">{formatINR(msg.data.product.price)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-[#a1a1aa]">
                          <div>Size: <span className="text-white font-medium">{msg.data.size}</span></div>
                          <div>Color: <span className="text-white font-medium capitalize">{msg.data.color}</span></div>
                          <div>Return: <span className="text-white font-medium">{msg.data.product.returnDays} Days</span></div>
                          <div>Stock: <span className="text-emerald-400 font-medium">In Stock ({msg.data.product.stock})</span></div>
                        </div>

                        {/* Why I chose this block */}
                        <div className="bg-[#09090b]/40 border border-[#27272a] rounded-xl p-3 mt-2 space-y-1.5 text-xs text-[#a1a1aa]">
                          <p className="font-semibold text-white text-[10px] uppercase tracking-wider pb-1 border-b border-[#27272a]">Why I Recommend This</p>
                          <div className="space-y-1 text-[10px]">
                            <div className="flex items-center gap-1.5 text-emerald-400">
                              <span>✓</span> <span>Matches size requirement ({msg.data.size})</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-emerald-400">
                              <span>✓</span> <span>Within maximum budget cap ({formatINR(policyLimit)})</span>
                            </div>
                            {sessionIntent?.color?.value && msg.data.product.color.toLowerCase() === sessionIntent.color.value.toLowerCase() && (
                              <div className="flex items-center gap-1.5 text-emerald-400">
                                <span>✓</span> <span>Matches color preference ({msg.data.product.color})</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1.5 text-emerald-400">
                              <span>✓</span> <span>In stock at {msg.data.product.merchantName}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[#71717a]">
                              <span>✓</span> <span>Determined as the best match with rank score: {Math.round(1000 - msg.data.product.price / 10 + msg.data.product.rating * 30 - msg.data.product.shippingDays * 15)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Merchant comparison option cards */}
                        {msg.data.products && msg.data.products.length > 1 && (
                          <div className="bg-[#09090b]/40 border border-[#27272a]/60 rounded-xl p-3 mt-2 space-y-2 text-xs">
                            <p className="font-semibold text-white text-[10px] uppercase tracking-wider pb-1 border-b border-[#27272a]">Merchant Options Compared</p>
                            <div className="space-y-2">
                              {msg.data.products.map((p: any, pidx: number) => (
                                <div key={pidx} className={`p-2 rounded-lg border ${pidx === 0 ? "border-indigo-500/30 bg-indigo-500/5" : "border-[#27272a]"} flex justify-between items-center text-[10px]`}>
                                  <div>
                                    <p className="font-semibold text-white">{p.merchantName} {pidx === 0 && <span className="text-[8px] bg-indigo-500/20 text-indigo-400 px-1 py-0.5 rounded ml-1 font-mono uppercase font-bold">RECOMMENDED</span>}</p>
                                    <p className="text-[#a1a1aa] mt-0.5">{p.shippingDays}d shipping | {p.rating}★ Rating</p>
                                  </div>
                                  <p className="font-bold text-white">{formatINR(p.price)}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Purchase Safety Check list */}
                        {msg.data.policyResult && (
                          <div className="bg-[#09090b]/60 border border-[#27272a]/80 rounded-lg p-3 space-y-2 mt-2">
                            <p className="text-[10px] font-bold text-[#a1a1aa] border-b border-[#27272a] pb-1 uppercase tracking-wider">Purchase Safety Check</p>
                            <div className="space-y-1.5 text-[10px]">
                              {msg.data.policyResult.checks.map((chk: any, cidx: number) => (
                                <div key={cidx} className="flex justify-between items-center">
                                  <span className="text-[#71717a] capitalize">{chk.name === "priceChange" ? "price protection" : chk.name}</span>
                                  <div className="flex items-center gap-1">
                                    {chk.name === "budget" && (
                                      <span className="text-[9px] text-[#a1a1aa] font-mono mr-1">₹{chk.actual} / ₹{chk.expected}</span>
                                    )}
                                    <span className={chk.passed ? "text-emerald-400 font-medium" : "text-rose-400 font-medium"}>
                                      {chk.passed ? "✓ Passed" : "❌ Failed"}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="border-t border-[#27272a] pt-1.5 mt-1 flex justify-between items-center text-[10px]">
                              <span className="text-[#a1a1aa] font-medium">Final Decision:</span>
                              <span className={`font-bold ${msg.data.policyResult.decision === "ALLOW" ? "text-emerald-400" : msg.data.policyResult.decision === "BLOCK" ? "text-rose-400" : "text-amber-400"}`}>
                                {msg.data.policyResult.decision === "ALLOW" ? "✓ APPROVED FOR CHECKOUT" : msg.data.policyResult.decision === "BLOCK" ? "❌ BLOCKED" : "⚠ CONFIRMATION REQUIRED"}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Show button only if decision is not ALLOW and not BLOCK */}
                        {msg.data.policyResult?.decision !== "ALLOW" && msg.data.policyResult?.decision !== "BLOCK" && (
                          <button
                            onClick={() => triggerPaymentOrder(msg.data.product)}
                            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <CreditCard className="h-3.5 w-3.5" />
                            Authorize Purchase
                          </button>
                        )}

                        {/* Show automatic checkout notification if ALLOW */}
                        {msg.data.policyResult?.decision === "ALLOW" && (
                          <button
                            onClick={() => triggerPaymentOrder(msg.data.product, null, true)}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            Auto-Approved: Complete Sandbox Checkout
                          </button>
                        )}
                      </div>
                    )}

                    {msg.type === "alternatives-card" && msg.data && (
                      <div className="space-y-2.5 mt-2">
                        <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-3 text-xs text-[#a1a1aa] leading-relaxed">
                          <p className="font-semibold text-rose-400 mb-1">⚠️ Exact Match Unavailable</p>
                          <p className="text-[10px]">No products in stock match all constraints. Review the closest options below and select which criteria you would like to relax.</p>
                        </div>
                        {msg.data.alternatives.map((alt: any, idx: number) => {
                          const isBudget = alt.violatedConstraint === "budget";
                          const isSize = alt.violatedConstraint === "size";
                          const isColor = alt.violatedConstraint === "color";
                          
                          let relaxationText = "Relax preference";
                          let command = `Select option: ${alt.product.name}`;
                          
                          if (isBudget) {
                            relaxationText = `Allow ₹${alt.difference} increase`;
                            command = `budget can go up to ${alt.product.price}`;
                          } else if (isSize) {
                            relaxationText = `Allow size ${alt.product.sizes[0] || "flexible"}`;
                            command = `size ${alt.product.sizes[0] || 9.5} is okay`;
                          } else if (isColor) {
                            relaxationText = "Color doesn't matter";
                            command = "color doesn't matter";
                          }

                          return (
                            <div
                              key={idx}
                              className="bg-[#1e1e24] border border-[#27272a] hover:border-indigo-500/20 rounded-xl p-3 flex flex-col gap-2 transition-all"
                            >
                              <div className="flex items-center justify-between text-xs">
                                <div>
                                  <p className="font-medium text-white">{alt.product.name}</p>
                                  <p className="text-[10px] text-zinc-400 mt-0.5">
                                    Merchant: {alt.product.merchantName} | Rating: {alt.product.rating}★
                                  </p>
                                </div>
                                <p className="font-bold text-white">{formatINR(alt.product.price)}</p>
                              </div>
                              
                              <div className="flex items-center justify-between border-t border-[#27272a] pt-2 mt-1">
                                <span className="text-[10px] text-rose-400 font-medium">
                                  {alt.explanation}
                                </span>
                                <button
                                  onClick={() => handleSendMessage(command)}
                                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded text-[9px] font-semibold transition-colors"
                                >
                                  {relaxationText}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <span className="text-[10px] text-[#71717a] block">
                      {msg.timestamp}
                    </span>
                  </div>
                </div>
              ))}
              {isProcessing && (
                <div className="flex gap-3 max-w-[85%]">
                  <div className="h-8 w-8 rounded-full bg-indigo-600 flex items-center justify-center shrink-0 animate-pulse">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="bg-[#27272a]/70 rounded-2xl px-4 py-2.5 border border-[#3f3f46]/40 text-xs text-[#a1a1aa] flex items-center gap-2">
                    <RefreshCw className="h-3 w-3 animate-spin text-indigo-400" />
                    Agent is evaluating constraints and querying merchants...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Suggestions Quick Buttons */}
            <div className="px-4 py-2 border-t border-[#27272a]/40 bg-[#18181b]/10 space-y-1.5">
              <span className="text-[10px] text-[#71717a] font-medium uppercase tracking-wider block">Quick Templates</span>
              <div className="flex flex-wrap gap-1.5 max-h-[70px] overflow-y-auto">
                <button
                  onClick={() => applyTemplate("Buy me blue running shoes, size 10, under ₹2,000")}
                  className="bg-[#27272a]/50 hover:bg-[#27272a] text-[#d4d4d8] border border-[#3f3f46]/30 text-[10px] py-1 px-2 rounded-full transition-colors truncate max-w-[200px]"
                >
                  Exact Match: Blue Runner under ₹2k
                </button>
                <button
                  onClick={() => applyTemplate("I need size 10 shoes under 2k. Color doesn't matter.")}
                  className="bg-[#27272a]/50 hover:bg-[#27272a] text-[#d4d4d8] border border-[#3f3f46]/30 text-[10px] py-1 px-2 rounded-full transition-colors truncate max-w-[200px]"
                >
                  Relaxed color match
                </button>
                <button
                  onClick={() => applyTemplate("Buy me a shoe under ₹3,000")}
                  className="bg-[#27272a]/50 hover:bg-[#27272a] text-[#d4d4d8] border border-[#3f3f46]/30 text-[10px] py-1 px-2 rounded-full transition-colors truncate max-w-[200px]"
                >
                  Incomplete: Shoe without size
                </button>
                <button
                  onClick={() => applyTemplate("Buy me a black quartz watch, size 10, under 4k")}
                  className="bg-[#27272a]/50 hover:bg-[#27272a] text-[#d4d4d8] border border-[#3f3f46]/30 text-[10px] py-1 px-2 rounded-full transition-colors truncate max-w-[200px]"
                >
                  Policy Block: Watch (Category mismatch)
                </button>
              </div>
            </div>

            {/* Input form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="p-3 border-t border-[#27272a] bg-[#18181b]/50 flex gap-2"
            >
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Ask the AI Buyer Agent to search and buy..."
                className="flex-1 bg-[#09090b] border border-[#27272a] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500/80 transition-colors placeholder-[#71717a]"
              />
              <button
                type="submit"
                disabled={isProcessing || !inputMessage.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-[#27272a] disabled:text-[#71717a] text-white px-4 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1"
              >
                <Play className="h-3 w-3 fill-current" />
                Run
              </button>
            </form>
          </div>

          {/* Column 2: Safety Policy Shield & Catalog (Span 4) */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            
            {/* Policy Shield Config */}
            <div className="bg-[#18181b]/30 border border-[#27272a] rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-[#27272a]">
                <Sliders className="h-4.5 w-4.5 text-indigo-400" />
                <h3 className="text-sm font-semibold text-white">Safety & Autonomy Policy</h3>
              </div>

              <div className="space-y-4 text-xs">
                {/* Autonomy Level */}
                <div className="space-y-1.5">
                  <label className="text-[#a1a1aa] block font-medium">Autonomy Authorization Level</label>
                  <div className="grid grid-cols-3 gap-1 bg-[#09090b] p-1 rounded-xl border border-[#27272a]">
                    {[1, 2, 3].map((lvl) => (
                      <button
                        key={lvl}
                        onClick={() => {
                          setPolicyAutonomy(lvl);
                          savePolicyToBackend(policyLimit, lvl, allowedCategories, allowedMerchants, allowedPaymentMethods);
                          const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                          setAuditLogs((prev) => [
                            {
                              step: "POLICY_CHANGE",
                              message: `Autonomy level adjusted manually to Level ${lvl}`,
                              status: "info",
                              time
                            },
                            ...prev
                          ]);
                        }}
                        className={`py-1.5 rounded-lg font-medium text-[10px] text-center transition-all ${
                          policyAutonomy === lvl
                            ? "bg-indigo-600 text-white"
                            : "text-[#71717a] hover:text-white"
                        }`}
                      >
                        Lvl {lvl}
                        <span className="block text-[8px] font-normal">
                          {lvl === 1 ? "Recommend" : lvl === 2 ? "Prepare" : "Autonomous"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Hard Limit Budget */}
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <label className="text-[#a1a1aa] font-medium">Hard Budget Limit</label>
                    <span className="text-indigo-400 font-mono font-bold">{formatINR(policyLimit)}</span>
                  </div>
                  <input
                    type="range"
                    min="500"
                    max="5000"
                    step="100"
                    value={policyLimit}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setPolicyLimit(val);
                      savePolicyToBackend(val, policyAutonomy, allowedCategories, allowedMerchants, allowedPaymentMethods);
                    }}
                    className="w-full h-1.5 bg-[#09090b] rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                  <div className="flex justify-between text-[10px] text-[#71717a]">
                    <span>Min: ₹500</span>
                    <span>Max: ₹5,000</span>
                  </div>
                </div>

                {/* Approved Category Checkboxes */}
                <div className="space-y-1.5">
                  <label className="text-[#a1a1aa] block font-medium">Whitelisted Categories</label>
                  <div className="grid grid-cols-3 gap-2">
                    {["shoes", "clothing", "accessories"].map((cat) => (
                      <label key={cat} className="flex items-center gap-1.5 cursor-pointer text-[#d4d4d8]">
                        <input
                          type="checkbox"
                          checked={allowedCategories.includes(cat)}
                          onChange={() => handleCategoryToggle(cat)}
                          className="rounded border-[#27272a] bg-[#09090b] text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer h-3.5 w-3.5"
                        />
                        <span className="capitalize text-[10px]">{cat}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Approved Merchants Checkboxes */}
                <div className="space-y-1.5">
                  <label className="text-[#a1a1aa] block font-medium">Whitelisted Merchants</label>
                  <div className="grid grid-cols-1 gap-1.5">
                    {["QuickStep Sports", "UrbanStride", "SportKart"].map((merch) => (
                      <label key={merch} className="flex items-center gap-1.5 cursor-pointer text-[#d4d4d8]">
                        <input
                          type="checkbox"
                          checked={allowedMerchants.includes(merch)}
                          onChange={() => handleMerchantToggle(merch)}
                          className="rounded border-[#27272a] bg-[#09090b] text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer h-3.5 w-3.5"
                        />
                        <span className="text-[10px]">{merch}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Approved Payment Methods Checkboxes */}
                <div className="space-y-1.5">
                  <label className="text-[#a1a1aa] block font-medium">Allowed Payment Methods</label>
                  <div className="flex gap-4">
                    {["UPI", "Card", "NetBanking"].map((pay) => (
                      <label key={pay} className="flex items-center gap-1.5 cursor-pointer text-[#d4d4d8]">
                        <input
                          type="checkbox"
                          checked={allowedPaymentMethods.includes(pay)}
                          onChange={() => handlePaymentToggle(pay)}
                          className="rounded border-[#27272a] bg-[#09090b] text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer h-3.5 w-3.5"
                        />
                        <span className="text-[10px]">{pay}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Safety Rules check info */}
                <div className="bg-[#27272a]/30 border border-[#3f3f46]/30 rounded-xl p-3 space-y-2">
                  <span className="font-semibold text-white text-[10px] block">Active Verification Policies:</span>
                  <div className="space-y-1.5 text-[10px] text-[#a1a1aa]">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-500"></div>
                      <span>Max cost validation (Strict cap match)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-500"></div>
                      <span>Merchant registry signature checks</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-500"></div>
                      <span>No direct payment hooks to LLM</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Active Intent Parser Status Panel */}
            <div className="bg-[#18181b]/30 border border-[#27272a] rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-[#27272a]">
                <Bot className="h-4.5 w-4.5 text-indigo-400" />
                <h3 className="text-sm font-semibold text-white">Active Buyer Intent Tracker</h3>
              </div>
              <div className="space-y-2 text-xs">
                {/* Category */}
                <div className="flex justify-between items-center bg-[#09090b]/40 p-2.5 rounded-xl border border-[#27272a]/50">
                  <span className="text-[#a1a1aa] font-medium">Category</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-white capitalize">{sessionIntent?.category?.value || "shoes"}</span>
                    <span className="text-[9px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded font-mono font-medium">
                      {sessionIntent?.category?.source === "explicit" ? "✓ USER SPECIFIED" : "⚠ DEFAULT ASSUMPTION"}
                    </span>
                  </div>
                </div>
                {/* Size */}
                <div className="flex justify-between items-center bg-[#09090b]/40 p-2.5 rounded-xl border border-[#27272a]/50">
                  <span className="text-[#a1a1aa] font-medium">Shoe Size</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-white font-mono">{sessionIntent?.size?.value || "Not specified"}</span>
                    {sessionIntent?.size?.value ? (
                      <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-medium">
                        ✓ USER SPECIFIED
                      </span>
                    ) : (
                      <span className="text-[9px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded font-mono font-medium animate-pulse">
                        ⚠ MISSING / BLOCKED
                      </span>
                    )}
                  </div>
                </div>
                {/* Budget */}
                <div className="flex justify-between items-center bg-[#09090b]/40 p-2.5 rounded-xl border border-[#27272a]/50">
                  <span className="text-[#a1a1aa] font-medium">Max Budget</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-white font-mono">{sessionIntent?.maxBudget?.value ? `₹${sessionIntent.maxBudget.value}` : "Not specified"}</span>
                    {sessionIntent?.maxBudget?.value ? (
                      <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-medium">
                        ✓ USER SPECIFIED
                      </span>
                    ) : (
                      <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-mono font-medium">
                        ⚠ ASSUMED (ANY)
                      </span>
                    )}
                  </div>
                </div>
                {/* Color */}
                <div className="flex justify-between items-center bg-[#09090b]/40 p-2.5 rounded-xl border border-[#27272a]/50">
                  <span className="text-[#a1a1aa] font-medium">Preferred Color</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-white capitalize">{sessionIntent?.color?.value || "Flexible / Any"}</span>
                    {sessionIntent?.color?.value ? (
                      sessionIntent.color.source === "explicit" ? (
                        <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-medium">
                          ✓ USER SPECIFIED
                        </span>
                      ) : (
                        <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-mono font-medium">
                          ⚠ INFERRED
                        </span>
                      )
                    ) : (
                      <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-mono font-medium">
                        ⚠ FLEXIBLE
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Merchant Catalog Showcase */}
            <div className="bg-[#18181b]/30 border border-[#27272a] rounded-2xl p-5 space-y-3 flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 pb-2 border-b border-[#27272a]">
                <Database className="h-4.5 w-4.5 text-indigo-400" />
                <h3 className="text-sm font-semibold text-white">Merchant Stock Catalog</h3>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2.5 text-xs pr-1">
                {MOCK_PRODUCTS.map((prod) => (
                  <div key={prod.id} className="p-3 bg-[#09090b]/50 border border-[#27272a] rounded-xl flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white text-xs">{prod.name}</p>
                      <p className="text-[#a1a1aa] text-[10px] mt-0.5">
                        Sizes: {prod.sizes.join(", ")} | Color: <span className="capitalize">{prod.color}</span>
                      </p>
                      <p className="text-[9px] text-[#71717a] mt-0.5">{prod.merchantName}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-white text-xs">{formatINR(prod.price)}</p>
                      {prod.stock > 0 ? (
                        <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded mt-1 inline-block">
                          {prod.stock} In Stock
                        </span>
                      ) : (
                        <span className="text-[10px] text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded mt-1 inline-block">
                          Out of Stock
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Column 3: Timeline & Webhook Sandbox (Span 3) */}
          <div className="lg:col-span-3 flex flex-col gap-6">
            
            {/* Razorpay Webhook Sandbox */}
            <div className="bg-[#18181b]/30 border border-[#27272a] rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#27272a]">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4.5 w-4.5 text-indigo-400" />
                  <h3 className="text-sm font-semibold text-white">Razorpay Webhook Sandbox</h3>
                </div>
                <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded font-mono uppercase">
                  Test Mode
                </span>
              </div>

              {paymentStep === "none" && (
                <div className="text-center py-6 text-[#71717a] text-xs">
                  <AlertTriangle className="h-6 w-6 text-[#71717a] mx-auto mb-2" />
                  No order active. Initialize a search and checkout from the chat to see payment events.
                </div>
              )}

              {paymentStep === "paying" && activeCheckoutProduct && (
                <div className="space-y-4 text-xs">
                  <div className="bg-[#09090b] border border-[#27272a] rounded-xl p-3.5 space-y-2">
                    <p className="text-[10px] text-[#a1a1aa] uppercase font-bold tracking-wider">Awaiting Sandbox Checkout</p>
                    <div className="flex justify-between mt-1.5">
                      <span className="text-[#a1a1aa]">Product:</span>
                      <span className="text-white font-medium truncate max-w-[150px]">{activeCheckoutProduct.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#a1a1aa]">Amount:</span>
                      <span className="text-emerald-400 font-bold">{formatINR(activeCheckoutProduct.price)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#a1a1aa]">Internal Order:</span>
                      <span className="text-white font-mono text-[9px] truncate max-w-[130px]" title={activeOrderId}>{activeOrderId || "creating..."}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#a1a1aa]">Razorpay ID:</span>
                      <span className="text-white font-mono text-[9px] truncate max-w-[130px]" title={activeRazorpayOrderId}>{activeRazorpayOrderId || "creating..."}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => completeManualPayment(false)}
                      className="bg-rose-600 hover:bg-rose-700 text-white font-semibold py-2 rounded-xl transition-colors text-[10px]"
                    >
                      Fail Payment
                    </button>
                    <button
                      onClick={() => completeManualPayment(true)}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-2 rounded-xl transition-colors text-[10px]"
                    >
                      Authorize Payment
                    </button>
                  </div>
                </div>
              )}

              {paymentStep === "verifying" && activeCheckoutProduct && (
                <div className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 p-4 rounded-xl text-center space-y-2">
                  <div className="h-6 w-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-1"></div>
                  <p className="text-xs font-semibold">Verifying Signature...</p>
                  <p className="text-[10px] text-[#a1a1aa]">
                    Contacting backend verification service to validate payment HMAC and signature hashes...
                  </p>
                </div>
              )}

              {paymentStep === "captured" && activeCheckoutProduct && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl text-center space-y-2">
                  <CheckCircle className="h-7 w-7 mx-auto" />
                  <p className="text-xs font-semibold">Payment Confirmed</p>
                  <p className="text-[10px] text-[#a1a1aa]">
                    Signature payload matches internal hash. Webhook successfully updated merchant inventory stock.
                  </p>
                  <button
                    onClick={() => {
                      setPaymentStep("none");
                      setActiveCheckoutProduct(null);
                      setActiveOrderId("");
                      setActiveRazorpayOrderId("");
                    }}
                    className="text-[10px] text-zinc-400 underline hover:text-white mt-1 block w-full text-center"
                  >
                    Reset Sandbox
                  </button>
                </div>
              )}

              {paymentStep === "failed" && activeCheckoutProduct && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-center space-y-2">
                  <AlertTriangle className="h-7 w-7 mx-auto" />
                  <p className="text-xs font-semibold">Transaction Aborted</p>
                  <p className="text-[10px] text-[#a1a1aa]">
                    The transaction was canceled by the customer or checkout signature check failed. Safety policies halted execution.
                  </p>
                  <button
                    onClick={() => {
                      setPaymentStep("none");
                      setActiveCheckoutProduct(null);
                      setActiveOrderId("");
                      setActiveRazorpayOrderId("");
                    }}
                    className="text-[10px] text-zinc-400 underline hover:text-white mt-1 block w-full text-center"
                  >
                    Reset Sandbox
                  </button>
                </div>
              )}
            </div>

            {/* Audit Log / Timeline */}
            <div className="bg-[#18181b]/30 border border-[#27272a] rounded-2xl p-5 flex-1 flex flex-col overflow-hidden max-h-[350px]">
              <div className="flex items-center gap-2 pb-2 border-b border-[#27272a]">
                <BarChart3 className="h-4.5 w-4.5 text-indigo-400" />
                <h3 className="text-sm font-semibold text-white">Decisions Audit Log</h3>
              </div>

              <div className="flex-1 overflow-y-auto mt-3 pr-1 space-y-3 font-mono text-[10px]">
                {auditLogs.map((log, index) => (
                  <div key={index} className="flex gap-2.5 items-start">
                    <div className="text-[#71717a] shrink-0 font-light">{log.time}</div>
                    <div className="space-y-0.5">
                      <span
                        className={`font-semibold uppercase text-[8px] px-1 rounded inline-block ${
                          log.status === "success"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : log.status === "warning"
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                            : log.status === "error"
                            ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                            : "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                        }`}
                      >
                        {log.step}
                      </span>
                      <p className="text-zinc-300 leading-normal">{log.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>
      </main>

      {/* Footer details */}
      <footer className="border-t border-[#27272a] bg-[#09090b] text-[#71717a] py-6 text-center text-xs mt-12 space-y-1">
        <p>© 2026 AgentGuard - Built for Razorpay AI Buildathon Hackathon.</p>
        <p className="text-[10px]">All payment executions in Sandbox Test Mode. Bounded Autonomy Engine V1.0.</p>
      </footer>
    </div>
  );
}
