"use client";

import { useState } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

/**
 * Design Demo Page - Sofistike ve Modern Tasarım Sistemi
 * Daha karakteristik, daha farklı, daha sofistike bir yaklaşım
 */
export default function DesignDemoPage() {
  const [inputValue, setInputValue] = useState("");
  const [selectedCard, setSelectedCard] = useState<number | null>(null);
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-black dark:to-gray-950">
      {/* Navigation - Ultra Modern */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/70 dark:bg-black/70 backdrop-blur-2xl border-b border-gray-200/50 dark:border-gray-800/50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <Link href="/" className="flex items-center gap-4 group">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full blur-md opacity-30 group-hover:opacity-50 transition-opacity" />
                <img 
                  src="/frora-logo.png" 
                  alt="XFRORA Logo" 
                  className="relative w-12 h-12 rounded-full object-cover ring-2 ring-gray-200 dark:ring-gray-800 transition-transform duration-300 group-hover:scale-110"
                />
              </div>
              <div>
                <span className="text-2xl font-black text-black dark:text-white uppercase tracking-tighter block">
                  XFRORA
                </span>
                <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                  Design System
                </span>
              </div>
            </Link>
            
            <div className="flex items-center gap-4">
              <ThemeToggle />
              <Link
                href="/"
                className="px-5 py-2.5 text-sm font-semibold text-black dark:text-white bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm border border-gray-200 dark:border-gray-800 rounded-xl hover:bg-white dark:hover:bg-gray-900 transition-all duration-300 hover:scale-105 hover:shadow-lg"
              >
                ← Ana Sayfa
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="pt-20">
        {/* Hero Section - Dramatic & Sophisticated */}
        <section className="relative overflow-hidden py-24 md:py-32 lg:py-40">
          {/* Background Elements */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/10 dark:bg-purple-400/5 rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-500/10 dark:bg-indigo-400/5 rounded-full blur-3xl" />
          </div>

          <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-16">
              <div className="inline-block mb-6">
                <span className="px-4 py-2 bg-black/5 dark:bg-white/5 backdrop-blur-sm border border-black/10 dark:border-white/10 rounded-full text-xs font-bold text-black dark:text-white uppercase tracking-widest">
                  Premium Design System
                </span>
              </div>
              <h1 className="text-6xl md:text-7xl lg:text-8xl font-black text-black dark:text-white mb-6 leading-[0.95] tracking-tight">
                <span className="block">Sofistike</span>
                <span className="block bg-gradient-to-r from-black via-gray-800 to-black dark:from-white dark:via-gray-200 dark:to-white bg-clip-text text-transparent">
                  Tasarım Dili
                </span>
              </h1>
              <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto leading-relaxed font-light">
                Modern, karakteristik ve profesyonel. Her detay düşünülmüş, her element anlamlı.
                <br />
                <span className="text-gray-500 dark:text-gray-500">Abartısız ama unutulmaz.</span>
              </p>
            </div>

            {/* Hero Cards - Asymmetric Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
              {/* Left Card - Elevated */}
              <div className="group relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl blur opacity-20 group-hover:opacity-30 transition-opacity" />
                <div className="relative bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/50 rounded-2xl p-8 shadow-2xl hover:shadow-3xl transition-all duration-500 hover:scale-[1.02]">
                  <div className="flex items-start gap-4 mb-6">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg">
                      <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-black dark:text-white mb-2">Modern & Hızlı</h3>
                      <p className="text-gray-600 dark:text-gray-400">GPU-accelerated animasyonlar ve optimize edilmiş performans</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button 
                      className="px-6 py-3 bg-black dark:bg-white text-white dark:text-black font-semibold rounded-xl hover:scale-105 active:scale-95 transition-transform duration-200 shadow-lg hover:shadow-xl"
                      onMouseEnter={() => setHoveredButton('primary')}
                      onMouseLeave={() => setHoveredButton(null)}
                    >
                      Keşfet
                    </button>
                    <button className="px-6 py-3 bg-white dark:bg-gray-900 text-black dark:text-white font-semibold rounded-xl border-2 border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 transition-all duration-200">
                      Daha Fazla
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Card - Glass */}
              <div className="group relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl blur opacity-20 group-hover:opacity-30 transition-opacity" />
                <div className="relative bg-white/60 dark:bg-gray-900/60 backdrop-blur-2xl border border-white/20 dark:border-white/10 rounded-2xl p-8 shadow-2xl hover:shadow-3xl transition-all duration-500 hover:scale-[1.02]">
                  <div className="flex items-start gap-4 mb-6">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                      <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-black dark:text-white mb-2">Karakteristik</h3>
                      <p className="text-gray-600 dark:text-gray-400">Kendine özgü tasarım dili ile farklılaş</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button className="px-6 py-3 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm text-black dark:text-white font-semibold rounded-xl border border-gray-200/50 dark:border-gray-800/50 hover:bg-white dark:hover:bg-gray-900 transition-all duration-200">
                      İncele
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Buttons Section - Sophisticated */}
        <section className="py-20 relative">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-5xl md:text-6xl font-black text-black dark:text-white mb-4 tracking-tight">
                Button Styles
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                Her durum için optimize edilmiş, her etkileşim için düşünülmüş
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {/* Primary */}
              <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/50 rounded-2xl p-8 shadow-xl">
                <div className="mb-6">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-black to-gray-800 dark:from-white dark:to-gray-200 flex items-center justify-center mb-4">
                    <span className="text-white dark:text-black font-bold text-xl">P</span>
                  </div>
                  <h3 className="text-xl font-bold text-black dark:text-white mb-2">Primary</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Ana aksiyonlar için</p>
                </div>
                <div className="space-y-4">
                  <button className="w-full px-6 py-3.5 bg-black dark:bg-white text-white dark:text-black font-semibold rounded-xl hover:scale-105 active:scale-95 transition-all duration-200 shadow-lg hover:shadow-xl">
                    Primary Button
                  </button>
                  <button className="w-full px-6 py-3.5 bg-black dark:bg-white text-white dark:text-black font-semibold rounded-xl opacity-50 cursor-not-allowed">
                    Disabled
                  </button>
                </div>
              </div>

              {/* Secondary */}
              <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/50 rounded-2xl p-8 shadow-xl">
                <div className="mb-6">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center mb-4 border-2 border-gray-200 dark:border-gray-800">
                    <span className="text-black dark:text-white font-bold text-xl">S</span>
                  </div>
                  <h3 className="text-xl font-bold text-black dark:text-white mb-2">Secondary</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">İkincil aksiyonlar için</p>
                </div>
                <div className="space-y-4">
                  <button className="w-full px-6 py-3.5 bg-white dark:bg-gray-900 text-black dark:text-white font-semibold rounded-xl border-2 border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 hover:scale-105 active:scale-95 transition-all duration-200">
                    Secondary Button
                  </button>
                  <button className="w-full px-6 py-3.5 bg-white dark:bg-gray-900 text-black dark:text-white font-semibold rounded-xl border-2 border-gray-300 dark:border-gray-700 opacity-50 cursor-not-allowed">
                    Disabled
                  </button>
                </div>
              </div>

              {/* Ghost */}
              <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/50 rounded-2xl p-8 shadow-xl">
                <div className="mb-6">
                  <div className="w-12 h-12 rounded-xl bg-transparent border-2 border-dashed border-gray-300 dark:border-gray-700 flex items-center justify-center mb-4">
                    <span className="text-gray-400 dark:text-gray-500 font-bold text-xl">G</span>
                  </div>
                  <h3 className="text-xl font-bold text-black dark:text-white mb-2">Ghost</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Minimal aksiyonlar için</p>
                </div>
                <div className="space-y-4">
                  <button className="w-full px-6 py-3.5 text-black dark:text-white font-semibold rounded-xl hover:bg-gray-100 dark:hover:bg-gray-900 transition-all duration-200">
                    Ghost Button
                  </button>
                  <button className="w-full px-6 py-3.5 text-black dark:text-white font-semibold rounded-xl opacity-50 cursor-not-allowed">
                    Disabled
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Cards Section - Modern Grid */}
        <section className="py-20 relative bg-gradient-to-b from-transparent to-gray-50/50 dark:to-gray-950/50">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-5xl md:text-6xl font-black text-black dark:text-white mb-4 tracking-tight">
                Card Styles
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                Farklı içerikler için farklı card stilleri
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Standard Card - Enhanced */}
              <div className="group relative">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-2xl blur opacity-0 group-hover:opacity-20 transition-opacity" />
                <div className="relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-500 hover:scale-[1.02] hover:-translate-y-1">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center mb-6 shadow-lg">
                    <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-black dark:text-white mb-3">
                    Standard Card
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                    Temel card stili - genel kullanım için optimize edilmiş, her durumda mükemmel görünüm.
                  </p>
                  <button className="w-full px-6 py-3 bg-black dark:bg-white text-white dark:text-black font-semibold rounded-xl hover:scale-105 active:scale-95 transition-transform duration-200">
                    Action
                  </button>
                </div>
              </div>

              {/* Elevated Card - Premium */}
              <div className="group relative">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl blur opacity-0 group-hover:opacity-20 transition-opacity" />
                <div className="relative bg-white dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-700 rounded-2xl p-8 shadow-2xl hover:shadow-3xl transition-all duration-500 hover:scale-[1.02] hover:-translate-y-1">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-6 shadow-xl">
                    <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="6" width="18" height="14" rx="2" />
                      <path d="M3 10h18" />
                      <circle cx="17" cy="14" r="1" fill="currentColor" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-black dark:text-white mb-3">
                    Elevated Card
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                    Önemli içerikler için - daha belirgin shadow ve border ile premium görünüm.
                  </p>
                  <button className="w-full px-6 py-3 bg-white dark:bg-gray-900 text-black dark:text-white font-semibold rounded-xl border-2 border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 transition-all duration-200">
                    Action
                  </button>
                </div>
              </div>

              {/* Glass Card - Ultra Modern */}
              <div className="group relative">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 via-indigo-500 to-purple-500 rounded-2xl blur opacity-0 group-hover:opacity-30 transition-opacity animate-pulse" />
                <div className="relative bg-white/60 dark:bg-gray-900/60 backdrop-blur-2xl border border-white/20 dark:border-white/10 rounded-2xl p-8 shadow-2xl hover:shadow-3xl transition-all duration-500 hover:scale-[1.02] hover:-translate-y-1">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 via-indigo-500 to-purple-600 flex items-center justify-center mb-6 shadow-xl">
                    <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
                      <path d="M21 15l-5-5L5 21" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-black dark:text-white mb-3">
                    Glass Card
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                    Hero sections için - glassmorphism efekti ile ultra modern görünüm.
                  </p>
                  <button className="w-full px-6 py-3 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm text-black dark:text-white font-semibold rounded-xl border border-gray-200/50 dark:border-gray-800/50 hover:bg-white dark:hover:bg-gray-900 transition-all duration-200">
                    Action
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Step Cards - Premium Design */}
        <section className="py-20 relative">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-5xl md:text-6xl font-black text-black dark:text-white mb-4 tracking-tight">
                Step Cards
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                Ana sayfa için premium step card tasarımı
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {[
                { icon: "x", title: "Connect Your Profile", status: "idle", color: "purple", gradient: "from-purple-500 to-indigo-600" },
                { icon: "wallet", title: "Connect Wallet", status: "connected", color: "teal", gradient: "from-teal-500 to-cyan-600" },
                { icon: "nft", title: "Mint NFT", status: "completed", color: "indigo", gradient: "from-indigo-500 to-purple-600" },
              ].map((step, idx) => (
                <div
                  key={idx}
                  className={`group relative transition-all duration-500 cursor-pointer ${
                    selectedCard === idx ? "scale-105" : "hover:scale-105"
                  }`}
                  onClick={() => setSelectedCard(idx)}
                >
                  {/* Glow Effect */}
                  <div className={`absolute -inset-1 bg-gradient-to-r ${step.gradient} rounded-2xl blur opacity-0 group-hover:opacity-30 transition-opacity ${
                    selectedCard === idx ? "opacity-40" : ""
                  }`} />
                  
                  <div className={`relative bg-white dark:bg-gray-900 border-2 rounded-2xl p-8 shadow-xl hover:shadow-2xl transition-all duration-500 ${
                    step.status === "connected"
                      ? "border-green-500/50 bg-green-50/30 dark:bg-green-900/10 dark:border-green-400/30"
                      : step.status === "completed"
                      ? "border-blue-500/50 bg-blue-50/30 dark:bg-blue-900/10 dark:border-blue-400/30"
                      : "border-gray-200 dark:border-gray-800"
                  }`}>
                    {/* Icon */}
                    <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${step.gradient} flex items-center justify-center mb-6 shadow-xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3`}>
                      {step.icon === "x" && (
                        <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                      )}
                      {step.icon === "wallet" && (
                        <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="6" width="18" height="14" rx="2" />
                          <path d="M3 10h18" />
                          <circle cx="17" cy="14" r="1" fill="currentColor" />
                        </svg>
                      )}
                      {step.icon === "nft" && (
                        <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
                          <path d="M21 15l-5-5L5 21" />
                        </svg>
                      )}
                    </div>

                    <h3 className="text-2xl font-bold text-black dark:text-white mb-4">
                      {step.title}
                    </h3>

                    {step.status === "connected" && (
                      <div className="mb-6 flex justify-start">
                        <div className="inline-flex items-center gap-2 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-2 rounded-xl text-sm font-semibold">
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                          <span>Connected</span>
                        </div>
                      </div>
                    )}
                    {step.status === "completed" && (
                      <div className="mb-6 flex justify-start">
                        <div className="inline-flex items-center gap-2 bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 px-4 py-2 rounded-xl text-sm font-semibold">
                          <div className="w-2 h-2 bg-blue-500 rounded-full" />
                          <span>Completed</span>
                        </div>
                      </div>
                    )}

                    <button className={`w-full px-6 py-3.5 font-semibold rounded-xl transition-all duration-200 ${
                      step.status === "idle"
                        ? "bg-black dark:bg-white text-white dark:text-black hover:scale-105 active:scale-95 shadow-lg"
                        : "bg-white dark:bg-gray-900 text-black dark:text-white border-2 border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600"
                    }`}>
                      {step.status === "idle" ? "Get Started" : step.status === "connected" ? "Continue" : "View"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Input Fields - Modern */}
        <section className="py-20 relative bg-gradient-to-b from-transparent to-gray-50/50 dark:to-gray-950/50">
          <div className="max-w-3xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-5xl md:text-6xl font-black text-black dark:text-white mb-4 tracking-tight">
                Input Fields
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                Modern ve kullanıcı dostu form elementleri
              </p>
            </div>

            <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/50 rounded-2xl p-10 shadow-2xl">
              <div className="space-y-8">
                <div>
                  <label className="block text-sm font-bold text-black dark:text-white mb-3 uppercase tracking-wide">
                    Text Input
                  </label>
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Enter text..."
                    className="w-full px-5 py-4 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-800 rounded-xl text-black dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:border-black dark:focus:border-white focus:ring-4 focus:ring-black/5 dark:focus:ring-white/5 transition-all duration-200 shadow-sm focus:shadow-lg"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-bold text-black dark:text-white mb-3 uppercase tracking-wide">
                    Textarea
                  </label>
                  <textarea
                    rows={5}
                    placeholder="Enter longer text..."
                    className="w-full px-5 py-4 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-800 rounded-xl text-black dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:border-black dark:focus:border-white focus:ring-4 focus:ring-black/5 dark:focus:ring-white/5 transition-all duration-200 resize-none shadow-sm focus:shadow-lg"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-bold text-black dark:text-white mb-3 uppercase tracking-wide">
                    Select
                  </label>
                  <select className="w-full px-5 py-4 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-800 rounded-xl text-black dark:text-white focus:outline-none focus:border-black dark:focus:border-white focus:ring-4 focus:ring-black/5 dark:focus:ring-white/5 transition-all duration-200 shadow-sm focus:shadow-lg cursor-pointer">
                    <option>Option 1</option>
                    <option>Option 2</option>
                    <option>Option 3</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Stats Grid - Premium */}
        <section className="py-20 relative">
          <div className="max-w-5xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-5xl md:text-6xl font-black text-black dark:text-white mb-4 tracking-tight">
                Stats Grid
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                Hero section için premium istatistik kartları
              </p>
            </div>

            <div className="grid grid-cols-3 gap-6">
              {[
                { label: "Minted", value: "1,234", change: "+12%" },
                { label: "Remaining", value: "4,321", change: "-5%" },
                { label: "Total Supply", value: "5,555", change: "Fixed" },
              ].map((stat, idx) => (
                <div key={idx} className="group relative">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-2xl blur opacity-0 group-hover:opacity-20 transition-opacity" />
                  <div className="relative bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/50 rounded-2xl p-8 text-center shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-105">
                    <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3 font-bold">
                      {stat.label}
                    </p>
                    <p className="text-4xl md:text-5xl font-black text-black dark:text-white mb-2">
                      {stat.value}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold">
                      {stat.change}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Progress Bar - Enhanced */}
        <section className="py-20 relative bg-gradient-to-b from-transparent to-gray-50/50 dark:to-gray-950/50">
          <div className="max-w-3xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-5xl md:text-6xl font-black text-black dark:text-white mb-4 tracking-tight">
                Progress Bar
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                Mint progress için premium progress bar
              </p>
            </div>

            <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/50 rounded-2xl p-10 shadow-2xl">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <p className="text-lg font-bold text-black dark:text-white">Mint Progress</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-semibold">22.2%</p>
                </div>
                <div className="relative h-4 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden shadow-inner">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-black via-gray-800 to-black dark:from-white dark:via-gray-200 dark:to-white transition-all duration-1000 ease-out rounded-full shadow-lg"
                    style={{ width: "22.2%" }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                  </div>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  1,234 of 5,555 xFrora NFTs minted
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Badges & Status - Premium */}
        <section className="py-20 relative">
          <div className="max-w-5xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-5xl md:text-6xl font-black text-black dark:text-white mb-4 tracking-tight">
                Badges & Status
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                Durum göstergeleri için premium badge'ler
              </p>
            </div>

            <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/50 rounded-2xl p-10 shadow-2xl">
              <div className="flex flex-wrap gap-4 justify-center">
                <div className="inline-flex items-center gap-3 bg-green-100 dark:bg-green-900/30 border-2 border-green-300 dark:border-green-800 text-green-700 dark:text-green-300 px-5 py-3 rounded-xl text-sm font-bold shadow-lg">
                  <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
                  <span>Connected</span>
                </div>
                <div className="inline-flex items-center gap-3 bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 px-5 py-3 rounded-xl text-sm font-bold shadow-lg">
                  <div className="w-2.5 h-2.5 bg-blue-500 rounded-full" />
                  <span>Completed</span>
                </div>
                <div className="inline-flex items-center gap-3 bg-yellow-100 dark:bg-yellow-900/30 border-2 border-yellow-300 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300 px-5 py-3 rounded-xl text-sm font-bold shadow-lg">
                  <div className="w-2.5 h-2.5 bg-yellow-500 rounded-full animate-pulse" />
                  <span>Pending</span>
                </div>
                <div className="inline-flex items-center gap-3 bg-red-100 dark:bg-red-900/30 border-2 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-5 py-3 rounded-xl text-sm font-bold shadow-lg">
                  <div className="w-2.5 h-2.5 bg-red-500 rounded-full" />
                  <span>Error</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Call to Action - Dramatic */}
        <section className="py-32 relative overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-gradient-to-br from-purple-500/20 to-indigo-500/20 rounded-full blur-3xl" />
          </div>
          
          <div className="relative max-w-4xl mx-auto px-6 lg:px-8 text-center">
            <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-2xl border border-gray-200/50 dark:border-gray-800/50 rounded-3xl p-16 shadow-2xl">
              <div className="inline-block mb-6">
                <span className="px-5 py-2.5 bg-black/5 dark:bg-white/5 backdrop-blur-sm border border-black/10 dark:border-white/10 rounded-full text-xs font-bold text-black dark:text-white uppercase tracking-widest">
                  Premium Design
                </span>
              </div>
              <h2 className="text-5xl md:text-6xl font-black text-black dark:text-white mb-6 leading-tight">
                Beğendiniz mi?
              </h2>
              <p className="text-xl text-gray-600 dark:text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
                Bu sofistike tasarım sistemi tüm siteye uygulanabilir. 
                <br />
                <span className="text-gray-500 dark:text-gray-500">Beğenirseniz, adım adım tüm sayfalara uygulayacağız.</span>
              </p>
              <div className="flex gap-4 justify-center">
                <Link 
                  href="/" 
                  className="px-8 py-4 bg-black dark:bg-white text-white dark:text-black font-bold rounded-xl hover:scale-105 active:scale-95 transition-all duration-200 shadow-xl hover:shadow-2xl"
                >
                  Ana Sayfaya Dön
                </Link>
                <button className="px-8 py-4 bg-white dark:bg-gray-900 text-black dark:text-white font-bold rounded-xl border-2 border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 transition-all duration-200 shadow-lg hover:shadow-xl">
                  Geri Bildirim Ver
                </button>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
