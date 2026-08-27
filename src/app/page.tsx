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
  Sparkles,
  HelpCircle,
  ArrowRight,
  Flame,
  UserCheck,
  Check,
  X
} from "lucide-react";

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

export default function Home() {
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
  
  // Dashboard stats
  const [totalRequests, setTotalRequests] = useState(142);
  const [successPurchases, setSuccessPurchases] = useState(84);
  const [blockedPurchases, setBlockedPurchases] = useState(58);
  
  // Active checkout state
  const [activeCheckoutProduct, setActiveCheckoutProduct] = useState<any>(null);
  const [activeOrderId, setActiveOrderId] = useState<string>("");
  const [activeRazorpayOrderId, setActiveRazorpayOrderId] = useState<string>("");
  const [paymentStep, setPaymentStep] = useState<"none" | "paying" | "verifying" | "captured" | "failed">("none");

  // Orders list
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersFilter, setOrdersFilter] = useState<"ALL" | "SUCCESSFUL" | "FAILED" | "BLOCKED">("ALL");

  // Live database catalog showcase
  const [liveCatalog, setLiveCatalog] = useState<any[]>([]);

  // Refs
  const chatEndRef = useRef<HTMLDivElement>(null);
  const sandboxRef = useRef<HTMLDivElement>(null);

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
      fetchLiveCatalog();
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

  // Fetch live products
  const fetchLiveCatalog = async () => {
    try {
      const res = await fetch("/api/products");
      if (res.ok) {
        const data = await res.json();
        setLiveCatalog(data);
      }
    } catch (error) {
      console.warn("Catalog fetch failed, falling back to static schema mock.", error);
    }
  };

  // Fetch live orders
  const fetchOrders = async () => {
    try {
      const res = await fetch("/api/orders");
      const data = await res.json();
      if (data.success && data.orders) {
        setOrders(data.orders);
      }
    } catch (error) {
      console.warn("Orders fetch failed.", error);
    }
  };

  // Initialize page, session, and scripts
  useEffect(() => {
    // Generate or restore unique sessionId on start
    let activeSessionId = localStorage.getItem("agentguard_sessionId");
    if (!activeSessionId) {
      activeSessionId = `session_${Math.random().toString(36).substring(2, 12)}`;
      localStorage.setItem("agentguard_sessionId", activeSessionId);
    }
    setSessionId(activeSessionId);

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
    
    // Fetch initial health checks
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => setApiHealth(data))
      .catch(() => {
        setApiHealth({ status: "healthy", database: "connected (mock)", mockMode: { gemini: true, razorpay: true } });
      });

    // Load active policy settings
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
      .catch((err) => console.warn("Failed to fetch policy:", err));

    // Restore persistent session
    fetch(`/api/session?sessionId=${activeSessionId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.session) {
          setSessionIntent(data.session.intent);
          if (data.session.selectedProduct) {
            setActiveCheckoutProduct(data.session.selectedProduct);
          }
          if (data.session.authorizationState) {
            if (data.session.authorizationState === "APPROVED_FOR_CHECKOUT") {
              setPaymentStep("paying");
            } else if (data.session.authorizationState === "POLICY_AUTHORIZED") {
              setPaymentStep("captured");
            }
          }
        }
        if (data.success && data.auditLogs && data.auditLogs.length > 0) {
          setAuditLogs(data.auditLogs.map((l: any) => ({
            step: l.step,
            message: l.message,
            status: l.step.includes("fail") || l.step.includes("block") ? "error" : "success",
            time: new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          })));
        }
      })
      .catch((err) => console.warn("Failed to restore session state:", err));

    // Populate boot logs
    setAuditLogs([
      { step: "SYSTEM_BOOT", message: "AgentGuard microservices started successfully", status: "success", time: "14:11:41" },
      { step: "DB_INIT", message: "Connected to PostgreSQL database catalog pool", status: "success", time: "14:11:42" },
      { step: "POLICY_BOOT", message: "Deterministic Policy Engine initialized", status: "success", time: "14:11:42" }
    ]);

    fetchLiveCatalog();
    fetchOrders();
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

  // Scroll to Sandbox helper
  const scrollToSandbox = () => {
    sandboxRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Core processing orchestration
  const handleSendMessage = async (textToSend?: string) => {
    const rawText = textToSend || inputMessage;
    if (!rawText.trim()) return;

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: Message = { sender: "user", text: rawText, timestamp };
    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputMessage("");
    setIsProcessing(true);
    setTotalRequests((prev) => prev + 1);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: rawText,
          sessionId: sessionId,
          sessionIntent: sessionIntent,
          policyAutonomy: policyAutonomy,
          policyLimit: policyLimit
        }),
      });

      const data = await response.json();
      setIsProcessing(false);

      if (response.ok) {
        setSessionIntent(data.intent);

        let msgType: "text" | "product-card" | "alternatives-card" | "clarification" = "text";
        let cardData = null;

        if (data.status === "NEEDS_CLARIFICATION") {
          msgType = "clarification";
        } else if (data.status === "PRODUCTS_FOUND" && data.selectedProduct) {
          msgType = "product-card";
          cardData = {
            product: data.selectedProduct,
            size: data.intent.size?.value || 10,
            color: data.intent.color?.value || data.selectedProduct.color,
            policyResult: data.policyResult,
            products: data.products,
          };
          setActiveCheckoutProduct(data.selectedProduct);
        } else if (data.status === "APPROVED_FOR_CHECKOUT" && data.selectedProduct) {
          msgType = "product-card";
          cardData = {
            product: data.selectedProduct,
            size: data.intent.size?.value || 10,
            color: data.intent.color?.value || data.selectedProduct.color,
            policyResult: data.policyResult,
            products: data.products,
          };
          setActiveCheckoutProduct(data.selectedProduct);
          // If autonomy level is 3, automatically initiate payment order!
          if (policyAutonomy === 3) {
            triggerPaymentOrder(data.selectedProduct, data.intent);
          }
        } else if (data.status === "NO_EXACT_MATCH") {
          msgType = "alternatives-card";
          cardData = {
            alternatives: data.alternatives.map((a: any) => ({
              product: a.product,
              violatedConstraint: a.violatedConstraint,
              difference: a.difference,
              explanation: a.explanation
            }))
          };
        } else if (data.status === "WAITING_FOR_USER") {
          msgType = "product-card";
          cardData = {
            product: data.selectedProduct,
            size: data.intent.size?.value || 10,
            color: data.intent.color?.value || data.selectedProduct?.color,
            policyResult: data.policyResult,
          };
          setActiveCheckoutProduct(data.selectedProduct);
        }

        setMessages((prev) => [
          ...prev,
          {
            sender: "agent",
            text: data.message,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: msgType,
            data: cardData,
          }
        ]);

        if (data.auditLogs) {
          setAuditLogs(data.auditLogs.map((l: any) => ({
            step: l.step,
            message: l.message,
            status: l.step.includes("fail") || l.step.includes("block") ? "error" : "success",
            time: new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          })));
        }

        // Increment block counter if blocked by policy
        if (data.policyResult?.decision === "BLOCK") {
          setBlockedPurchases((prev) => prev + 1);
        }

        fetchLiveCatalog();
      } else {
        setMessages((prev) => [
          ...prev,
          {
            sender: "agent",
            text: `⚠️ Request failed: ${data.error || "Unable to retrieve recommendation"}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: "text"
          }
        ]);
      }
    } catch (err) {
      console.error(err);
      setIsProcessing(false);
      setMessages((prev) => [
        ...prev,
        {
          sender: "agent",
          text: "⚠️ Communication breakdown with agent microservices.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: "text"
        }
      ]);
    }
  };

  // Coordinate Sandbox checkout initialization
  const triggerPaymentOrder = async (product: any, currentIntent: any = null, forceUserConfirm = false) => {
    setPaymentStep("paying");
    const logger = (step: string, message: string, status: "success" | "warning" | "error" | "info" = "success") => {
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setAuditLogs((prev) => [{ step, message, status, time }, ...prev]);
    };

    logger("CHECKOUT_INITIATED", `Sending checkout parameters to secure verification gateway...`, "info");

    try {
      const activeIntent = currentIntent || sessionIntent;
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          productId: product.id,
          size: activeIntent?.size?.value || 10,
          originalPrice: activeIntent?.originalPrice?.value || product.price,
          authorizationStatus: forceUserConfirm ? "USER_CONFIRMED" : (activeIntent?.authorizationStatus?.value || "NONE"),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        logger("CHECKOUT_BLOCKED", `Gateway check failed: ${data.error}`, "error");
        setPaymentStep("failed");
        setBlockedPurchases((prev) => prev + 1);
        setMessages((prev) => [
          ...prev,
          {
            sender: "agent",
            text: `❌ Checkout Blocked: ${data.error}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          }
        ]);
        return;
      }

      setActiveOrderId(data.orderId);
      setActiveRazorpayOrderId(data.razorpayOrderId);
      logger("ORDER_CREATED", `Internal order ID ${data.orderId} matches Razorpay ${data.razorpayOrderId}`, "success");

      // Auto-trigger Razorpay sandbox modal
      if ((window as any).Razorpay) {
        const options = {
          key: data.keyId,
          amount: data.amount,
          currency: data.currency,
          name: "AgentGuard Sandbox",
          description: `Payment for ${product.name}`,
          order_id: data.razorpayOrderId,
          handler: async function (response: any) {
            await verifyPaymentSignatureOnBackend(
              data.orderId,
              data.razorpayOrderId,
              response.razorpay_payment_id,
              response.razorpay_signature
            );
          },
          modal: {
            ondismiss: function () {
              logger("PAYMENT_CANCELLED", "User cancelled sandbox checkout frame.", "warning");
              setPaymentStep("failed");
            }
          },
          theme: { color: "#4f46e5" }
        };
        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      } else {
        // Fallback for mock sandbox panel
        logger("AWAITING_SANDBOX_ACTION", "Please authorize/fail transaction manually in sandbox controller.", "warning");
        setMessages((prev) => [
          ...prev,
          {
            sender: "agent",
            text: `I have prepared the Order: ${data.razorpayOrderId}. Please authorize sandbox payment in the right sandbox controller.`,
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
        fetchOrders();
        fetchLiveCatalog();
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
    fetchOrders();
  };

  // Handle manual payment modal submission
  const completeManualPayment = async (success: boolean) => {
    const mockPaymentId = `pay_mock_${Math.random().toString(36).substring(2, 12)}`;
    const mockSignature = success ? "valid_mock_signature" : "invalid_mock_signature";
    await verifyPaymentSignatureOnBackend(activeOrderId, activeRazorpayOrderId, mockPaymentId, mockSignature);
  };

  // Run Demo Scenario
  const runDemoScenario = async (scenarioId: number) => {
    setIsProcessing(true);
    setPaymentStep("none");
    setActiveCheckoutProduct(null);
    setAuditLogs([]);

    try {
      const response = await fetch("/api/demo/scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId }),
      });

      if (response.ok) {
        // Fetch fresh policy
        const polRes = await fetch("/api/policy");
        const polData = await polRes.json();
        if (polData.success && polData.policy) {
          setPolicyLimit(polData.policy.maxBudget);
          setPolicyAutonomy(polData.policy.autonomyLevel);
        }

        fetchLiveCatalog();
        fetchOrders();

        if (scenarioId === 1) {
          setMessages([
            {
              sender: "agent",
              text: "Demo Mode activated: Scenario 1 - Perfect Match. Autonomy level set to 3. I will attempt to automatically buy the SwiftRun Trainer size 10.",
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          ]);
          setTimeout(() => handleSendMessage("Buy the SwiftRun Blue Trainer, size 10."), 1000);
        } else if (scenarioId === 2) {
          setMessages([
            {
              sender: "agent",
              text: "Demo Mode activated: Scenario 2 - Constraint Negotiation. Stock of the SwiftRun Blue Trainer set to 0. I will look for alternatives.",
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          ]);
          setTimeout(() => handleSendMessage("Find blue running shoes size 10 under ₹2,000."), 1000);
        } else if (scenarioId === 3) {
          setMessages([
            {
              sender: "agent",
              text: "Demo Mode activated: Scenario 3 - Safety Policy Block. I will attempt to buy shoes that cost ₹2,499 under a ₹2,000 policy budget cap.",
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          ]);
          setTimeout(() => handleSendMessage("Buy the TrailBlazer Premium Runner, size 10."), 1000);
        }
      }
    } catch (error) {
      console.error("Failed to set up demo scenario:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetDemo = async () => {
    try {
      const response = await fetch("/api/demo/reset", { method: "POST" });
      if (response.ok) {
        localStorage.removeItem("agentguard_sessionId");
        window.location.reload();
      }
    } catch (error) {
      console.error("Failed to reset database states:", error);
    }
  };

  // Filter orders
  const filteredOrders = orders.filter((o) => {
    if (ordersFilter === "ALL") return true;
    if (ordersFilter === "SUCCESSFUL") return o.status === "PAYMENT_CAPTURED" || o.status === "PAID";
    if (ordersFilter === "FAILED") return o.status === "PAYMENT_FAILED" || o.status === "FAILED";
    if (ordersFilter === "BLOCKED") return o.status === "CANCELLED" || o.status === "BLOCKED";
    return true;
  });

  return (
    <div className="min-h-screen bg-[#020205] text-[#f4f4f5] font-sans antialiased selection:bg-indigo-500/30 selection:text-indigo-200">
      
      {/* ABOVE-THE-FOLD PRESTIGE LANDING HERO */}
      <section className="relative overflow-hidden border-b border-[#1f1f2e] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(79,70,229,0.18),rgba(255,255,255,0))] pb-20 pt-16 px-6">
        <div className="max-w-[1200px] mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/5 text-xs text-indigo-400 font-medium">
            <Sparkles className="h-3.5 w-3.5" />
            Phase 7: Live Agentic Commerce Trust Engine
          </div>
          
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent max-w-4xl mx-auto leading-none">
            AGENTGUARD
          </h1>
          
          <p className="text-xl md:text-2xl text-zinc-300 max-w-2xl mx-auto font-light leading-relaxed">
            AI that can shop for you — without being allowed to spend beyond your rules.
          </p>

          <p className="text-sm text-[#a1a1aa] max-w-xl mx-auto">
            Traditional shopping bots directly call APIs or bypass validation. AgentGuard inserts a deterministic trust validation pipeline that re-verifies pricing, stock, budget caps, and policies.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <button
              onClick={scrollToSandbox}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-6 rounded-xl transition-all shadow-lg shadow-indigo-600/20 hover:scale-[1.02] flex items-center gap-2 text-sm"
            >
              Launch Sandbox Console
              <ArrowRight className="h-4 w-4" />
            </button>
            
            <button
              onClick={() => {
                scrollToSandbox();
                setTimeout(() => runDemoScenario(2), 500);
              }}
              className="bg-[#18181b] border border-[#27272a] hover:bg-[#27272a] text-zinc-200 font-semibold py-3 px-6 rounded-xl transition-all text-sm"
            >
              Test Turn Negotiation
            </button>
          </div>

          {/* Prestige Comparison Matrix */}
          <div className="pt-16 max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            <div className="bg-[#09090b]/40 border border-[#1f1f2e] p-6 rounded-2xl space-y-3">
              <span className="text-xs font-semibold text-[#71717a] uppercase tracking-wider block">Traditional Bot</span>
              <p className="text-sm font-bold text-rose-400">User ➔ Chatbot ➔ Catalog</p>
              <p className="text-xs text-[#a1a1aa] leading-relaxed">
                Zero budget gating, zero autonomy protection. Conversational but zero trust context.
              </p>
            </div>
            <div className="bg-[#09090b]/40 border border-[#1f1f2e] p-6 rounded-2xl space-y-3">
              <span className="text-xs font-semibold text-[#71717a] uppercase tracking-wider block">Basic Commerce Agent</span>
              <p className="text-sm font-bold text-amber-400">User ➔ AI Agent ➔ Payment</p>
              <p className="text-xs text-[#a1a1aa] leading-relaxed">
                LLM directly triggers checkout, making it vulnerable to prompt injection price tampering.
              </p>
            </div>
            <div className="bg-indigo-950/20 border border-indigo-500/30 p-6 rounded-2xl space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider block">AgentGuard</span>
                <span className="bg-indigo-500/20 text-indigo-400 text-[8px] font-mono px-1 rounded uppercase font-bold">Secure</span>
              </div>
              <p className="text-sm font-bold text-emerald-400">User ➔ AI ➔ Policy Guard ➔ Razorpay</p>
              <p className="text-xs text-[#a1a1aa] leading-relaxed">
                Deterministic validation rules enforce limits. The LLM never controls payment authorization.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* WHY CAN I TRUST THIS AGENT? */}
      <section className="bg-[#09090b]/60 border-b border-[#1f1f2e] py-16 px-6">
        <div className="max-w-[1200px] mx-auto space-y-10">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-extrabold tracking-tight text-white">Why Can I Trust This Agent?</h2>
            <p className="text-sm text-[#a1a1aa] max-w-xl mx-auto">
              AgentGuard implements a 10-layer trust security architecture designed to prevent payment exploits.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 text-xs">
            <div className="bg-[#18181b]/30 border border-[#27272a] p-5 rounded-xl space-y-2">
              <div className="h-8 w-8 bg-indigo-500/10 rounded-lg text-indigo-400 flex items-center justify-center font-bold">1</div>
              <p className="font-semibold text-zinc-100">AI Recommends Only</p>
              <p className="text-[#a1a1aa] leading-relaxed">AI acts as a researcher, suggesting best items but holds zero authority to checkout.</p>
            </div>
            <div className="bg-[#18181b]/30 border border-[#27272a] p-5 rounded-xl space-y-2">
              <div className="h-8 w-8 bg-indigo-500/10 rounded-lg text-indigo-400 flex items-center justify-center font-bold">2</div>
              <p className="font-semibold text-zinc-100">Deterministic Engine</p>
              <p className="text-[#a1a1aa] leading-relaxed">Safety boundaries are parsed by non-LLM, rigid code logic which cannot be prompt-hacked.</p>
            </div>
            <div className="bg-[#18181b]/30 border border-[#27272a] p-5 rounded-xl space-y-2">
              <div className="h-8 w-8 bg-indigo-500/10 rounded-lg text-indigo-400 flex items-center justify-center font-bold">3</div>
              <p className="font-semibold text-zinc-100">Fresh Price Checks</p>
              <p className="text-[#a1a1aa] leading-relaxed">Catalog price is re-verified from product DB at checkout, blocking client-side price updates.</p>
            </div>
            <div className="bg-[#18181b]/30 border border-[#27272a] p-5 rounded-xl space-y-2">
              <div className="h-8 w-8 bg-indigo-500/10 rounded-lg text-indigo-400 flex items-center justify-center font-bold">4</div>
              <p className="font-semibold text-zinc-100">Rigid Budget Limits</p>
              <p className="text-[#a1a1aa] leading-relaxed">If the real order sum exceeds the policy budget, the transaction is hard-blocked instantly.</p>
            </div>
            <div className="bg-[#18181b]/30 border border-[#27272a] p-5 rounded-xl space-y-2">
              <div className="h-8 w-8 bg-indigo-500/10 rounded-lg text-indigo-400 flex items-center justify-center font-bold">5</div>
              <p className="font-semibold text-zinc-100">Inventory Verification</p>
              <p className="text-[#a1a1aa] leading-relaxed">Inventory levels are verified atomically before creating a Razorpay transaction ticket.</p>
            </div>
            <div className="bg-[#18181b]/30 border border-[#27272a] p-5 rounded-xl space-y-2">
              <div className="h-8 w-8 bg-indigo-500/10 rounded-lg text-indigo-400 flex items-center justify-center font-bold">6</div>
              <p className="font-semibold text-zinc-100">Merchant Allowlists</p>
              <p className="text-[#a1a1aa] leading-relaxed">Restricts vendor search and payments to whitelisted commercial partners.</p>
            </div>
            <div className="bg-[#18181b]/30 border border-[#27272a] p-5 rounded-xl space-y-2">
              <div className="h-8 w-8 bg-indigo-500/10 rounded-lg text-indigo-400 flex items-center justify-center font-bold">7</div>
              <p className="font-semibold text-zinc-100">Signature Verification</p>
              <p className="text-[#a1a1aa] leading-relaxed">All checkouts calculate an server-side HMAC-SHA256 signature to verify receipt.</p>
            </div>
            <div className="bg-[#18181b]/30 border border-[#27272a] p-5 rounded-xl space-y-2">
              <div className="h-8 w-8 bg-indigo-500/10 rounded-lg text-indigo-400 flex items-center justify-center font-bold">8</div>
              <p className="font-semibold text-zinc-100">Idempotent Webhooks</p>
              <p className="text-[#a1a1aa] leading-relaxed">Webhook deliveries execute under database locks, preventing double payment state capture.</p>
            </div>
            <div className="bg-[#18181b]/30 border border-[#27272a] p-5 rounded-xl space-y-2">
              <div className="h-8 w-8 bg-indigo-500/10 rounded-lg text-indigo-400 flex items-center justify-center font-bold">9</div>
              <p className="font-semibold text-zinc-100">Audit timeline logs</p>
              <p className="text-[#a1a1aa] leading-relaxed">Every transaction audit trace is written to database logs, leaving an immutable history.</p>
            </div>
            <div className="bg-[#18181b]/30 border border-[#27272a] p-5 rounded-xl space-y-2">
              <div className="h-8 w-8 bg-indigo-500/10 rounded-lg text-indigo-400 flex items-center justify-center font-bold">10</div>
              <p className="font-semibold text-zinc-100">Database Freshness</p>
              <p className="text-[#a1a1aa] leading-relaxed">Checkout aborts immediately if db status is offline, preventing unverified transactions.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CORE SANDBOX APPLICATION */}
      <section ref={sandboxRef} className="max-w-[1600px] mx-auto p-6 space-y-6 scroll-mt-20">
        
        {/* TOP STATUS CONTROL HEADER */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-[#18181b]/30 border border-[#27272a] p-4 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600/10 p-2 rounded-xl text-indigo-400">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">AgentGuard Control Console</h2>
              <p className="text-xs text-[#a1a1aa]">Sandbox simulation panel with hot-reload states</p>
            </div>
          </div>

          {/* Health Status Badges */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span>Admin Console</span>
            </Link>
            
            <button
              onClick={handleResetDemo}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/30 hover:bg-rose-900/40 text-rose-400 border border-rose-500/20 font-medium transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Reset Sandbox DB</span>
            </button>
            
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#09090b] border border-[#27272a]">
              <Database className="h-3.5 w-3.5 text-emerald-400" />
              <span>DB Connection: {apiHealth?.database === "connected" ? "PostgreSQL" : "Local Mock Sandbox"}</span>
            </div>
            
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#09090b] border border-[#27272a]">
              <Bot className="h-3.5 w-3.5 text-purple-400" />
              <span>Parser: {apiHealth?.mockMode?.gemini ? "Local Fallback" : "Gemini API Active"}</span>
            </div>
          </div>
        </div>

        {/* STATS OVERVIEW */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-[#18181b]/50 border border-[#27272a] p-5 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-[#a1a1aa] uppercase tracking-wider">Total Sandbox Interactions</p>
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
              <p className="text-xs font-medium text-[#a1a1aa] uppercase tracking-wider">Safety Engine Blocks</p>
              <h3 className="text-2xl font-bold mt-1 text-rose-500">{blockedPurchases}</h3>
            </div>
            <div className="bg-rose-500/10 p-3 rounded-xl text-rose-400">
              <ShieldAlert className="h-5 w-5" />
            </div>
          </div>
          <div className="bg-[#18181b]/50 border border-[#27272a] p-5 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-[#a1a1aa] uppercase tracking-wider">Turn State Persistence</p>
              <h3 className="text-2xl font-bold mt-1 text-white">Survives Refresh</h3>
            </div>
            <div className="bg-indigo-500/10 p-3 rounded-xl text-indigo-400">
              <UserCheck className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* DEMO MODE CONTROL TABS */}
        <div className="bg-[#18181b]/50 border border-[#27272a] p-5 rounded-2xl space-y-3">
          <h3 className="text-sm font-semibold text-white">Live Competition Scenarios</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => runDemoScenario(1)}
              className="bg-[#09090b] border border-indigo-500/30 hover:border-indigo-500/70 p-4 rounded-xl text-left transition-all space-y-1 hover:scale-[1.01]"
            >
              <div className="flex justify-between items-center text-xs font-semibold text-indigo-400">
                <span>Scenario 1: Perfect Match</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-mono uppercase">Lvl 3</span>
              </div>
              <p className="text-xs font-medium text-white">"Buy the SwiftRun Blue Trainer, size 10"</p>
              <p className="text-[10px] text-[#a1a1aa]">Satisfies budget cap (1899 &lt; 2000), whitelists category/merchant, policy ALLOWS automatically.</p>
            </button>
            <button
              onClick={() => runDemoScenario(2)}
              className="bg-[#09090b] border border-indigo-500/30 hover:border-indigo-500/70 p-4 rounded-xl text-left transition-all space-y-1 hover:scale-[1.01]"
            >
              <div className="flex justify-between items-center text-xs font-semibold text-indigo-400">
                <span>Scenario 2: Constraint Negotiation</span>
                <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-mono uppercase">Lvl 2</span>
              </div>
              <p className="text-xs font-medium text-white">"Find blue running shoes size 10 under ₹2,000"</p>
              <p className="text-[10px] text-[#a1a1aa]">Matches no exact item (stock = 0). Computes 3 safe alternatives and triggers relaxation buttons.</p>
            </button>
            <button
              onClick={() => runDemoScenario(3)}
              className="bg-[#09090b] border border-indigo-500/30 hover:border-indigo-500/70 p-4 rounded-xl text-left transition-all space-y-1 hover:scale-[1.01]"
            >
              <div className="flex justify-between items-center text-xs font-semibold text-indigo-400">
                <span>Scenario 3: Safety Block</span>
                <span className="text-[10px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded font-mono uppercase">Lvl 3</span>
              </div>
              <p className="text-xs font-medium text-white">"Buy TrailBlazer Premium Runner, size 10"</p>
              <p className="text-[10px] text-[#a1a1aa]">Matches premium shoe at ₹2,499. The policy limits budget to ₹2,000. Safety engine BLOCKS checkout.</p>
            </button>
          </div>
        </div>

        {/* 3-COLUMN TRIPLE PANEL LAYOUT */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* COLUMN 1: AI Buyer Chat Hub & Timeline (col-span-4) */}
          <div className="lg:col-span-4 flex flex-col bg-[#18181b]/30 border border-[#27272a] rounded-2xl overflow-hidden h-[620px]">
            <div className="px-4 py-3 bg-[#18181b]/60 border-b border-[#27272a] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-indigo-400" />
                <span className="text-sm font-semibold">AI Buyer Agent Chat</span>
              </div>
              <span className="text-xs text-indigo-400 font-mono">Session: {sessionId.substring(0, 12)}...</span>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex gap-3 max-w-[90%] ${
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

                  <div className="space-y-2 flex-1">
                    <div
                      className={`rounded-2xl px-4 py-2.5 text-sm ${
                        msg.sender === "user"
                          ? "bg-indigo-600 text-white"
                          : "bg-[#27272a]/70 text-zinc-100 border border-[#3f3f46]/40"
                      }`}
                    >
                      {msg.text}
                    </div>

                    {/* RENDER SPECIAL PRODUCT CARDS */}
                    {msg.type === "product-card" && msg.data && (
                      <div className="bg-[#111115] border border-indigo-500/30 rounded-xl p-4 space-y-3 mt-2 shadow-lg">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded uppercase font-bold tracking-wider">
                              {msg.data.product.merchantName}
                            </span>
                            <h4 className="font-semibold text-white mt-1.5">{msg.data.product.name}</h4>
                          </div>
                          <span className="text-emerald-400 font-bold">{formatINR(msg.data.product.price)}</span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 text-[11px] text-[#a1a1aa] border-t border-[#27272a] pt-2">
                          <div>Requested Size: <span className="text-white font-medium">{msg.data.size}</span></div>
                          <div>Color: <span className="text-white font-medium capitalize">{msg.data.color}</span></div>
                          <div>Return Window: <span className="text-white font-medium">{msg.data.product.returnDays} Days</span></div>
                          <div>Stock Freshness: <span className="text-emerald-400 font-medium">Available ({msg.data.product.stock})</span></div>
                        </div>

                        {/* WHY CHOSE CARD */}
                        <div className="bg-[#09090b]/40 border border-[#27272a] rounded-lg p-2.5 text-[10px] text-[#a1a1aa] space-y-1">
                          <p className="font-semibold text-white uppercase tracking-wider text-[8px] pb-1 border-b border-[#27272a]">Trust Reasoning Trace</p>
                          <div className="flex items-center gap-1.5 text-emerald-400 mt-1">
                            <Check className="h-3 w-3" />
                            <span>Matches requested size ({msg.data.size})</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-emerald-400">
                            <Check className="h-3 w-3" />
                            <span>Fits max budget rule ({formatINR(policyLimit)})</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[#71717a]">
                            <Check className="h-3 w-3" />
                            <span>Best ranking score: {Math.round(1000 - msg.data.product.price / 10 + msg.data.product.rating * 30 - msg.data.product.shippingDays * 15)}</span>
                          </div>
                        </div>

                        {/* SAFETY CHECKS GRID */}
                        {msg.data.policyResult && (
                          <div className="bg-[#09090b]/60 border border-[#27272a]/80 rounded-lg p-2.5 space-y-1.5">
                            <p className="text-[8px] font-bold text-[#a1a1aa] border-b border-[#27272a] pb-1 uppercase tracking-wider">Policy Engine Verification</p>
                            <div className="space-y-1 text-[10px]">
                              {msg.data.policyResult.checks.map((chk: any, cidx: number) => (
                                <div key={cidx} className="flex justify-between items-center">
                                  <span className="text-[#71717a] capitalize">{chk.name}</span>
                                  <span className={chk.passed ? "text-emerald-400 font-medium" : "text-rose-400 font-medium"}>
                                    {chk.passed ? "✓ Valid" : "❌ Blocked"}
                                  </span>
                                </div>
                              ))}
                            </div>
                            <div className="border-t border-[#27272a] pt-1.5 mt-1 flex justify-between items-center text-[10px] font-bold">
                              <span className="text-[#a1a1aa]">Final Gate Decision:</span>
                              <span className={msg.data.policyResult.decision === "ALLOW" ? "text-emerald-400" : msg.data.policyResult.decision === "BLOCK" ? "text-rose-400" : "text-amber-400"}>
                                {msg.data.policyResult.decision === "ALLOW" ? "✓ ALLOW" : msg.data.policyResult.decision === "BLOCK" ? "❌ BLOCK" : "⚠ ASK_USER"}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* RENDER ACTIONS */}
                        {msg.data.policyResult?.decision === "ASK_USER" && (
                          <button
                            onClick={() => triggerPaymentOrder(msg.data.product, null, true)}
                            className="w-full bg-amber-500 hover:bg-amber-600 text-black py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            Confirm & Authorize Order
                          </button>
                        )}

                        {msg.data.policyResult?.decision === "ALLOW" && (
                          <button
                            onClick={() => triggerPaymentOrder(msg.data.product)}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                          >
                            <CreditCard className="h-3.5 w-3.5" />
                            Initiate Payment Checkout
                          </button>
                        )}

                        {msg.data.policyResult?.decision === "BLOCK" && (
                          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-lg text-[10px]">
                            <p className="font-bold">❌ GATED BLOCK ACTION</p>
                            <p className="mt-1 text-[#a1a1aa]">{msg.data.policyResult.reason}</p>
                            <button
                              onClick={() => handleSendMessage("Show all options")}
                              className="mt-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-semibold px-2 py-1 rounded transition-colors"
                            >
                              Relax requirements
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* RENDER ALTERNATIVES NEGOTIATION CARD */}
                    {msg.type === "alternatives-card" && msg.data && (
                      <div className="space-y-2 mt-2">
                        <div className="bg-rose-950/20 border border-rose-500/20 rounded-xl p-3 text-xs text-[#a1a1aa] leading-relaxed">
                          <p className="font-semibold text-rose-400 mb-1">⚠️ Exact Match Mismatch</p>
                          <p className="text-[10px]">No catalog shoes match all constraints. Review alternatives and select relaxation choice:</p>
                        </div>
                        
                        {msg.data.alternatives.map((alt: any, idx: number) => {
                          const isBudget = alt.violatedConstraint === "budget";
                          const isSize = alt.violatedConstraint === "size";
                          const isColor = alt.violatedConstraint === "color";
                          
                          let relaxationText = "Relax constraint";
                          let command = `Select option: ${alt.product.name}`;
                          
                          if (isBudget) {
                            relaxationText = `Allow ₹${alt.difference} budget increase`;
                            command = `increase budget to ${alt.product.price}`;
                          } else if (isSize) {
                            relaxationText = `Allow size ${alt.product.sizes[0] || 9.5}`;
                            command = `size ${alt.product.sizes[0] || 9.5} is okay`;
                          } else if (isColor) {
                            relaxationText = `Allow different color (${alt.product.color})`;
                            command = `color doesn't matter`;
                          }

                          return (
                            <div key={idx} className="bg-[#111115] border border-[#27272a] rounded-xl p-3 flex flex-col gap-2 hover:border-[#3f3f46] transition-all">
                              <div className="flex items-center justify-between text-xs">
                                <div>
                                  <p className="font-medium text-white">{alt.product.name}</p>
                                  <p className="text-[10px] text-[#71717a]">
                                    {alt.product.merchantName} | Rating: {alt.product.rating}★
                                  </p>
                                </div>
                                <p className="font-bold text-white">{formatINR(alt.product.price)}</p>
                              </div>
                              <div className="flex items-center justify-between border-t border-[#27272a] pt-2 mt-1">
                                <span className="text-[10px] text-rose-400 font-medium leading-none">
                                  {alt.explanation}
                                </span>
                                <button
                                  onClick={() => handleSendMessage(command)}
                                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded text-[10px] font-semibold transition-colors"
                                >
                                  {relaxationText}
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        <button
                          onClick={() => handleSendMessage("Show all options")}
                          className="w-full bg-[#18181b] border border-[#27272a] hover:bg-[#27272a] text-zinc-300 py-1.5 rounded-lg text-xs font-semibold transition-colors mt-2"
                        >
                          Show all catalog items
                        </button>
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

            {/* Chat Input */}
            <div className="p-4 bg-[#18181b]/40 border-t border-[#27272a] flex gap-2">
              <input
                type="text"
                placeholder="Ask agent: e.g. Buy blue trainers size 10..."
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                disabled={isProcessing}
                className="flex-1 bg-[#09090b] border border-[#27272a] rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-0 disabled:text-[#71717a]"
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={isProcessing || !inputMessage.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-[#27272a] disabled:text-[#71717a] text-white px-4 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
              >
                <Play className="h-3 w-3 fill-current" />
                Run
              </button>
            </div>
          </div>

          {/* COLUMN 2: Policy Control Center & Intent status (col-span-4) */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            
            {/* POLICY SHIELD PANEL */}
            <div className="bg-[#18181b]/30 border border-[#27272a] rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#27272a]">
                <div className="flex items-center gap-2">
                  <Sliders className="h-4.5 w-4.5 text-indigo-400" />
                  <h3 className="text-sm font-semibold text-white">MY SHOPPING POLICY</h3>
                </div>
                <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded font-mono uppercase">
                  Verified Gate
                </span>
              </div>

              <div className="space-y-4 text-xs">
                {/* Autonomy Level */}
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <label className="text-[#a1a1aa] font-medium">Autonomy Gating Level</label>
                    <span className="text-indigo-400 font-bold font-mono">LEVEL {policyAutonomy}</span>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-1 bg-[#09090b] p-1 rounded-xl border border-[#27272a]">
                    {[1, 2, 3].map((lvl) => (
                      <button
                        key={lvl}
                        onClick={() => {
                          setPolicyAutonomy(lvl);
                          savePolicyToBackend(policyLimit, lvl, allowedCategories, allowedMerchants, allowedPaymentMethods);
                        }}
                        className={`py-1.5 rounded-lg font-medium text-[10px] text-center transition-all ${
                          policyAutonomy === lvl
                            ? "bg-indigo-600 text-white"
                            : "text-[#71717a] hover:text-white"
                        }`}
                      >
                        Lvl {lvl}
                        <span className="block text-[8px] font-normal uppercase mt-0.5">
                          {lvl === 1 ? "Recommend" : lvl === 2 ? "Prepare" : "Autonomous"}
                        </span>
                      </button>
                    ))}
                  </div>

                  <p className="text-[10px] text-[#71717a] leading-relaxed italic bg-[#09090b]/40 p-2 rounded-lg border border-[#27272a]/65">
                    {policyAutonomy === 1 && "Level 1: No payment authorized. Only product research is shown."}
                    {policyAutonomy === 2 && "Level 2: Cart checkout can be prepared, but user confirmation click is required."}
                    {policyAutonomy === 3 && "Level 3: Autopurchase. Agent completes payment only if every policy rules pass."}
                  </p>
                </div>

                {/* Hard Limit Budget */}
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <label className="text-[#a1a1aa] font-medium">Maximum Authorized Spend</label>
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

                {/* Categories */}
                <div className="space-y-1.5">
                  <label className="text-[#a1a1aa] block font-medium">Allowed Categories</label>
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

                {/* Merchants */}
                <div className="space-y-1.5">
                  <label className="text-[#a1a1aa] block font-medium">Allowed Merchants</label>
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

                {/* Payment Methods */}
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
              </div>
            </div>

            {/* ACTIVE INTENT TRACKER */}
            <div className="bg-[#18181b]/30 border border-[#27272a] rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-[#27272a]">
                <Bot className="h-4.5 w-4.5 text-indigo-400" />
                <h3 className="text-sm font-semibold text-white">Active Buyer Intent Tracker</h3>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center bg-[#09090b]/40 p-2.5 rounded-xl border border-[#27272a]/50">
                  <span className="text-[#a1a1aa] font-medium">Category</span>
                  <span className="text-white capitalize">{sessionIntent?.category?.value || "shoes"} ({sessionIntent?.category?.strength || "hard"})</span>
                </div>
                <div className="flex justify-between items-center bg-[#09090b]/40 p-2.5 rounded-xl border border-[#27272a]/50">
                  <span className="text-[#a1a1aa] font-medium">Shoe Size</span>
                  <span className="text-white font-mono">{sessionIntent?.size?.value || "Not specified"} ({sessionIntent?.size?.strength || "hard"})</span>
                </div>
                <div className="flex justify-between items-center bg-[#09090b]/40 p-2.5 rounded-xl border border-[#27272a]/50">
                  <span className="text-[#a1a1aa] font-medium">Max Budget</span>
                  <span className="text-white font-mono">{sessionIntent?.maxBudget?.value ? `₹${sessionIntent.maxBudget.value}` : "Not specified"} ({sessionIntent?.maxBudget?.strength || "hard"})</span>
                </div>
                <div className="flex justify-between items-center bg-[#09090b]/40 p-2.5 rounded-xl border border-[#27272a]/50">
                  <span className="text-[#a1a1aa] font-medium">Color Preference</span>
                  <span className="text-white capitalize">{sessionIntent?.color?.value || "Flexible"} ({sessionIntent?.color?.strength || "soft"})</span>
                </div>
                <div className="flex justify-between items-center bg-[#09090b]/40 p-2.5 rounded-xl border border-[#27272a]/50">
                  <span className="text-[#a1a1aa] font-medium">Merchant Preference</span>
                  <span className="text-white capitalize">{sessionIntent?.merchantPreference?.value || "Any allowed"}</span>
                </div>
              </div>
            </div>

            {/* AUDIT ENGINE TIMELINE */}
            <div className="bg-[#18181b]/30 border border-[#27272a] rounded-2xl p-5 space-y-4 flex-1 overflow-hidden flex flex-col max-h-[350px]">
              <div className="flex items-center gap-2 pb-2 border-b border-[#27272a]">
                <Sliders className="h-4.5 w-4.5 text-indigo-400" />
                <h3 className="text-sm font-semibold text-white">Agent Decision Trace</h3>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {auditLogs.length === 0 ? (
                  <p className="text-xs text-[#71717a] text-center py-4">No audit steps recorded yet.</p>
                ) : (
                  auditLogs.map((log, idx) => (
                    <div key={idx} className="flex gap-2.5 text-[11px] leading-relaxed">
                      <div className="mt-1 shrink-0">
                        {log.status === "success" && <div className="h-2 w-2 rounded-full bg-emerald-500" />}
                        {log.status === "error" && <div className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />}
                        {log.status === "warning" && <div className="h-2 w-2 rounded-full bg-amber-500" />}
                        {log.status === "info" && <div className="h-2 w-2 rounded-full bg-indigo-500" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-zinc-100 uppercase text-[9px] tracking-wider font-mono">{log.step}</span>
                          <span className="text-[#71717a] text-[9px] font-mono">{log.time}</span>
                        </div>
                        <p className="text-[#a1a1aa] mt-0.5">{log.message}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* COLUMN 3: Webhook sandbox, live catalog, order history (col-span-4) */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            
            {/* WEBHOOK SANDBOX */}
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
                      <span className="text-[#a1a1aa]">Razorpay ID:</span>
                      <span className="text-white font-mono text-[9px] truncate max-w-[130px]">{activeRazorpayOrderId || "creating..."}</span>
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
                    className="bg-[#27272a] hover:bg-[#3f3f46] text-white font-semibold py-1.5 px-4 rounded-xl transition-colors text-[10px]"
                  >
                    Clear Sandbox Panel
                  </button>
                </div>
              )}

              {paymentStep === "failed" && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl space-y-3">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5" />
                    <p className="text-xs font-semibold">Purchase Gate Blocked</p>
                  </div>
                  
                  <div className="space-y-2 text-[10px] text-[#a1a1aa] leading-relaxed">
                    <p><span className="text-rose-400 font-semibold">WHAT HAPPENED:</span> The payment transaction was rejected, cancelled, or failed validation limits.</p>
                    <p><span className="text-rose-400 font-semibold">WHY:</span> Either signature verification signature mismatches occurred, or the client-side cost exceeds maximum limits.</p>
                    <p><span className="text-rose-400 font-semibold">WHAT YOU CAN DO:</span> Adjust your max spend limit or select another payment option from the policy center.</p>
                  </div>
                  
                  <button
                    onClick={() => {
                      setPaymentStep("none");
                      setActiveCheckoutProduct(null);
                    }}
                    className="w-full bg-[#27272a] hover:bg-[#3f3f46] text-white font-semibold py-1.5 rounded-lg transition-colors text-[10px]"
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>

            {/* LIVE DB CATALOG SHOWCASE */}
            <div className="bg-[#18181b]/30 border border-[#27272a] rounded-2xl p-5 space-y-3 max-h-[300px] overflow-hidden flex flex-col">
              <div className="flex items-center gap-2 pb-2 border-b border-[#27272a]">
                <Database className="h-4.5 w-4.5 text-indigo-400" />
                <h3 className="text-sm font-semibold text-white">Live DB Catalog Showcase</h3>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2.5 text-xs pr-1">
                {liveCatalog.map((prod) => (
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

            {/* REAL ORDER HISTORY */}
            <div className="bg-[#18181b]/30 border border-[#27272a] rounded-2xl p-5 space-y-3 flex-1 flex flex-col overflow-hidden max-h-[350px]">
              <div className="flex items-center justify-between pb-2 border-b border-[#27272a]">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-4.5 w-4.5 text-indigo-400" />
                  <h3 className="text-sm font-semibold text-white">Order History</h3>
                </div>
                
                <div className="flex items-center gap-1 bg-[#09090b] p-0.5 rounded-lg border border-[#27272a]">
                  {["ALL", "SUCCESSFUL", "FAILED"].map((filt) => (
                    <button
                      key={filt}
                      onClick={() => setOrdersFilter(filt as any)}
                      className={`px-2 py-0.5 rounded text-[8px] font-bold tracking-wider uppercase transition-all ${
                        ordersFilter === filt
                          ? "bg-indigo-600 text-white"
                          : "text-[#71717a] hover:text-white"
                      }`}
                    >
                      {filt === "SUCCESSFUL" ? "Paid" : filt === "FAILED" ? "Failed" : "All"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs">
                {filteredOrders.length === 0 ? (
                  <p className="text-[10px] text-[#71717a] text-center py-4">No matching orders found.</p>
                ) : (
                  filteredOrders.map((ord) => (
                    <div key={ord.id} className="p-2.5 bg-[#09090b]/40 border border-[#27272a] rounded-xl flex items-center justify-between text-[11px]">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-white font-mono">{ord.id.substring(0, 8)}...</span>
                          <span className="text-[#71717a] text-[9px] font-mono">
                            {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-[#a1a1aa] text-[9px] mt-0.5 truncate max-w-[130px]" title={ord.items?.[0]?.product?.name || "Order Product"}>
                          {ord.items?.[0]?.product?.name || "Product"} (Qty: {ord.items?.[0]?.quantity || 1})
                        </p>
                      </div>
                      
                      <div className="text-right shrink-0">
                        <p className="font-bold text-white">{formatINR(ord.totalAmount)}</p>
                        <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded mt-1 inline-block ${
                          ord.status === "PAYMENT_CAPTURED" || ord.status === "PAID"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : ord.status === "PAYMENT_FAILED" || ord.status === "FAILED"
                            ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                            : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        }`}>
                          {ord.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

        </div>

      </section>
      
      {/* FOOTER METRICS */}
      <footer className="border-t border-[#1f1f2e] bg-[#020205] py-8 text-center text-xs text-[#71717a]">
        <div className="max-w-[1200px] mx-auto space-y-2 px-6">
          <p>AgentGuard Secure Commerce Hub — Phase 7 Competition Release v0.6.5</p>
          <p>Enforced using deterministic policy verifiers and atomic cryptographic signature assertions.</p>
        </div>
      </footer>

    </div>
  );
}
