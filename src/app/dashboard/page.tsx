"use client";

import React, { useState } from "react";
import {
  BarChart3,
  ShoppingCart,
  ShieldCheck,
  ShieldAlert,
  ArrowLeft,
  Settings,
  Package,
  TrendingUp,
  Clock,
  Briefcase
} from "lucide-react";
import Link from "next/link";

// Mock Database Records
const MOCK_MERCHANTS = [
  { id: "merchant-1", name: "QuickStep Sports", category: "Shoes", products: 4 },
  { id: "merchant-2", name: "Urban Style Outfitters", category: "Clothing", products: 2 },
  { id: "merchant-3", name: "Apex Chrono", category: "Accessories", products: 1 },
];

const MOCK_ORDERS = [
  {
    id: "ord_internal_982",
    razorpayOrderId: "order_Hj231Salkd",
    merchant: "QuickStep Sports",
    product: "SwiftRun Blue Trainer",
    amount: 1899,
    status: "PAID",
    buyer: "Suresh Kumar",
    time: "2026-08-26 14:10:32"
  },
  {
    id: "ord_internal_441",
    razorpayOrderId: "order_Kj981Lskad",
    merchant: "Urban Style Outfitters",
    product: "Denim Trucker Jacket",
    amount: 1499,
    status: "PAID",
    buyer: "Amit Patel",
    time: "2026-08-26 13:42:15"
  },
  {
    id: "ord_internal_321",
    razorpayOrderId: "order_Pj823Maske",
    merchant: "QuickStep Sports",
    product: "TrailBlazer Red Hike",
    amount: 2499,
    status: "BLOCKED",
    buyer: "Rohan Sharma",
    time: "2026-08-26 12:15:04",
    reason: "Exceeded User Policy Budget (₹2,000)"
  },
  {
    id: "ord_internal_108",
    razorpayOrderId: "order_Tj298Kaskj",
    merchant: "Apex Chrono",
    product: "Legacy Quartz Watch",
    amount: 2999,
    status: "BLOCKED",
    buyer: "Priya Das",
    time: "2026-08-26 10:04:19",
    reason: "Category 'Accessories' not in Policy Whitelist"
  }
];

export default function MerchantDashboard() {
  const [selectedMerchant, setSelectedMerchant] = useState<string>("all");

  const totalRequests = 142;
  const successfulPurchases = 84;
  const blockedPurchases = 58;
  const decisionLatency = "1.8s";
  const constraintRate = "94.2%";

  const filteredOrders = selectedMerchant === "all"
    ? MOCK_ORDERS
    : MOCK_ORDERS.filter(o => o.merchant.toLowerCase().includes(selectedMerchant.toLowerCase()));

  return (
    <div className="min-h-screen bg-[#09090b] text-[#f4f4f5] font-sans antialiased">
      {/* Navbar */}
      <header className="border-b border-[#27272a] bg-[#09090b]/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="bg-[#18181b] hover:bg-[#27272a] p-2 rounded-xl text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight">AgentGuard Console</h1>
            <p className="text-xs text-[#a1a1aa]">Merchant & Admin Analytics Dashboard</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-[#a1a1aa]">Environment:</span>
          <span className="px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono font-semibold uppercase">
            Buildathon TEST Sandbox
          </span>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-6 space-y-6">
        
        {/* Core Metrics Widgets */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-[#18181b]/30 border border-[#27272a] p-5 rounded-2xl">
            <div className="flex justify-between items-center text-zinc-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Actions</span>
              <TrendingUp className="h-4 w-4 text-indigo-400" />
            </div>
            <h3 className="text-2xl font-bold mt-2 text-white">{totalRequests}</h3>
            <p className="text-[10px] text-[#71717a] mt-1">AI interactions parsed</p>
          </div>
          
          <div className="bg-[#18181b]/30 border border-[#27272a] p-5 rounded-2xl">
            <div className="flex justify-between items-center text-zinc-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Confirmed Payments</span>
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
            </div>
            <h3 className="text-2xl font-bold mt-2 text-emerald-400">{successfulPurchases}</h3>
            <p className="text-[10px] text-[#71717a] mt-1">Cleared webhook validation</p>
          </div>

          <div className="bg-[#18181b]/30 border border-[#27272a] p-5 rounded-2xl">
            <div className="flex justify-between items-center text-zinc-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Blocked Orders</span>
              <ShieldAlert className="h-4 w-4 text-rose-500" />
            </div>
            <h3 className="text-2xl font-bold mt-2 text-rose-500">{blockedPurchases}</h3>
            <p className="text-[10px] text-[#71717a] mt-1">Deterministic policy blocks</p>
          </div>

          <div className="bg-[#18181b]/30 border border-[#27272a] p-5 rounded-2xl">
            <div className="flex justify-between items-center text-zinc-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Decision Time</span>
              <Clock className="h-4 w-4 text-amber-400" />
            </div>
            <h3 className="text-2xl font-bold mt-2 text-white">{decisionLatency}</h3>
            <p className="text-[10px] text-[#71717a] mt-1">Avg agent reasoning speed</p>
          </div>

          <div className="bg-[#18181b]/30 border border-[#27272a] p-5 rounded-2xl">
            <div className="flex justify-between items-center text-zinc-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Satisfaction Rate</span>
              <Briefcase className="h-4 w-4 text-purple-400" />
            </div>
            <h3 className="text-2xl font-bold mt-2 text-purple-400">{constraintRate}</h3>
            <p className="text-[10px] text-[#71717a] mt-1">Constraint satisfaction check</p>
          </div>
        </div>

        {/* Triple Column Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Column 1: Simulated Merchant Overview */}
          <div className="bg-[#18181b]/30 border border-[#27272a] rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-[#27272a]">
              <Package className="h-4.5 w-4.5 text-indigo-400" />
              <h3 className="text-sm font-semibold text-white">Simulated Merchants</h3>
            </div>
            
            <div className="space-y-3">
              {MOCK_MERCHANTS.map((m) => (
                <div key={m.id} className="p-3 bg-[#09090b]/50 border border-[#27272a] rounded-xl flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-zinc-100 text-xs">{m.name}</h4>
                    <p className="text-[#a1a1aa] text-[10px] mt-0.5">Focus: {m.category}</p>
                  </div>
                  <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded">
                    {m.products} Products
                  </span>
                </div>
              ))}
            </div>

            <div className="bg-[#27272a]/20 border border-[#3f3f46]/30 rounded-xl p-4 text-[10px] text-[#a1a1aa] space-y-2 leading-relaxed">
              <p className="font-semibold text-white">Registry Synchronicity:</p>
              <p>Each merchant exposes structured, standardized catalogs conforming to standard commerce specifications.</p>
              <p>When the Buyer Agent initiates a search, the backend parses sizes and prices natively without LLM database access.</p>
            </div>
          </div>

          {/* Column 2 & 3: Master Orders Log (Span 2) */}
          <div className="lg:col-span-2 bg-[#18181b]/30 border border-[#27272a] rounded-2xl p-5 space-y-4 flex flex-col overflow-hidden h-[450px]">
            <div className="flex items-center justify-between pb-2 border-b border-[#27272a]">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4.5 w-4.5 text-indigo-400" />
                <h3 className="text-sm font-semibold text-white">System Transaction & Audit Sheets</h3>
              </div>

              {/* Filter */}
              <div className="flex gap-1.5 text-[10px]">
                <button
                  onClick={() => setSelectedMerchant("all")}
                  className={`px-2 py-1 rounded ${selectedMerchant === "all" ? "bg-indigo-600 text-white" : "bg-[#09090b] text-zinc-400 hover:text-white"}`}
                >
                  All
                </button>
                <button
                  onClick={() => setSelectedMerchant("QuickStep")}
                  className={`px-2 py-1 rounded ${selectedMerchant === "QuickStep" ? "bg-indigo-600 text-white" : "bg-[#09090b] text-zinc-400 hover:text-white"}`}
                >
                  QuickStep
                </button>
                <button
                  onClick={() => setSelectedMerchant("Urban")}
                  className={`px-2 py-1 rounded ${selectedMerchant === "Urban" ? "bg-indigo-600 text-white" : "bg-[#09090b] text-zinc-400 hover:text-white"}`}
                >
                  Urban Style
                </button>
              </div>
            </div>

            {/* Orders Table */}
            <div className="flex-1 overflow-y-auto pr-1">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#27272a] text-[#71717a] font-mono text-[10px]">
                    <th className="py-2.5">Order/RP ID</th>
                    <th>Merchant / Item</th>
                    <th>Buyer</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#27272a]/50">
                  {filteredOrders.map((ord) => (
                    <tr key={ord.id} className="hover:bg-[#18181b]/10 transition-colors">
                      <td className="py-3 font-mono text-[10px] pr-2">
                        <span className="text-white block font-semibold">{ord.id}</span>
                        <span className="text-[#71717a] text-[9px] block">{ord.razorpayOrderId}</span>
                      </td>
                      <td className="pr-2">
                        <span className="text-zinc-100 block font-medium">{ord.product}</span>
                        <span className="text-[#a1a1aa] text-[9px] block">{ord.merchant}</span>
                      </td>
                      <td className="text-[#a1a1aa] pr-2">{ord.buyer}</td>
                      <td className="font-semibold text-zinc-200">₹{ord.amount}</td>
                      <td className="pr-2">
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded font-mono uppercase block text-center max-w-[80px] ${
                            ord.status === "PAID"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                          }`}
                        >
                          {ord.status}
                        </span>
                        {ord.reason && (
                          <span className="text-[8px] text-rose-400 block mt-0.5 leading-tight max-w-[150px]">{ord.reason}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </main>

      <footer className="border-t border-[#27272a] bg-[#09090b] text-[#71717a] py-6 text-center text-xs mt-12">
        <p>© 2026 AgentGuard Console. Analytics derived directly from database logs.</p>
      </footer>
    </div>
  );
}
