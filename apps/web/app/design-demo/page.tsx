"use client";

import { useState } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

/**
 * Design Demo Page - Profesyonel, Soft & Bulutsu Tasarım
 * Ciddi, yenilikçi ama çocukça değil
 */
export default function DesignDemoPage() {
  const [inputValue, setInputValue] = useState("");
  const [selectedCard, setSelectedCard] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-50 dark:from-slate-950 dark:via-gray-950 dark:to-slate-950">
      {/* Navigation - Minimal & Professional */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/40 dark:bg-black/40 backdrop-blur-2xl border-b border-gray-200/30 dark:border-gray-800/30">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="relative">
                <img 
                  src="/frora-logo.png" 
                  alt="XFRORA Logo" 
                  className="w-10 h-10 rounded-full object-cover transition-opacity duration-300 group-hover:opacity-80"
                />
              </div>
              <span className="text-xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">
                XFRORA
              </span>
            </Link>
            
            <div className="flex items-center gap-4">
              <ThemeToggle />
              <Link
                href="/"
                className="px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors duration-200"
              >
                ← Ana Sayfa
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="pt-20">
        {/* Hero Section - Soft & Professional */}
        <section className="relative overflow-hidden py-24 md:py-32">
          {/* Bulutsu Arka Plan */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-20 left-10 w-72 h-72 bg-gray-200/30 dark:bg-gray-800/20 rounded-full blur-3xl" />
            <div className="absolute bottom-20 right-10 w-96 h-96 bg-slate-200/30 dark:bg-slate-800/20 rounded-full blur-3xl" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gray-300/20 dark:bg-gray-700/10 rounded-full blur-3xl" />
          </div>

          <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-20">
              <div className="inline-block mb-8">
                <span className="px-4 py-1.5 bg-white/30 dark:bg-black/30 backdrop-blur-md border border-gray-300/30 dark:border-gray-700/30 rounded-full text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Professional Design System
                </span>
              </div>
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-light text-gray-900 dark:text-gray-50 mb-6 leading-tight tracking-tight">
                <span className="block font-normal">Sofistike &</span>
                <span className="block font-light text-gray-700 dark:text-gray-300">Profesyonel</span>
              </h1>
              <p className="text-lg md:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed font-light">
                Ciddi, yenilikçi ve minimal. Her detay profesyonelce düşünülmüş.
                <br />
                <span className="text-gray-500 dark:text-gray-500 text-base">Soft ve bulutsu bir görünüm.</span>
              </p>
            </div>

            {/* Hero Cards - Soft Design */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
              {/* Left Card */}
              <div className="bg-white/50 dark:bg-gray-900/50 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/50 rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-500">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-gray-100/50 dark:bg-gray-800/50 flex items-center justify-center">
                    <svg className="w-6 h-6 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-medium text-gray-900 dark:text-gray-100 mb-1">Modern & Hızlı</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Optimize edilmiş performans</p>
                  </div>
                </div>
                <button className="px-6 py-3 bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-gray-300/30 dark:border-gray-700/30 rounded-xl text-gray-900 dark:text-gray-100 font-medium hover:bg-white/50 dark:hover:bg-black/50 transition-all duration-300 shadow-sm hover:shadow-md">
                  Keşfet
                </button>
              </div>

              {/* Right Card */}
              <div className="bg-white/50 dark:bg-gray-900/50 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/50 rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-500">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-gray-100/50 dark:bg-gray-800/50 flex items-center justify-center">
                    <svg className="w-6 h-6 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-medium text-gray-900 dark:text-gray-100 mb-1">Karakteristik</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Kendine özgü tasarım</p>
                  </div>
                </div>
                <button className="px-6 py-3 bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-gray-300/30 dark:border-gray-700/30 rounded-xl text-gray-900 dark:text-gray-100 font-medium hover:bg-white/50 dark:hover:bg-black/50 transition-all duration-300 shadow-sm hover:shadow-md">
                  İncele
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Buttons Section - Glassmorphism (Su Damlacığı) */}
        <section className="py-20 relative">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-light text-gray-900 dark:text-gray-50 mb-4 tracking-tight">
                Button Styles
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto font-light">
                Saydam, su damlacığı gibi butonlar
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {/* Primary - Glassmorphism */}
              <div className="bg-white/30 dark:bg-gray-900/30 backdrop-blur-xl border border-gray-200/30 dark:border-gray-800/30 rounded-2xl p-8 shadow-lg">
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Primary</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Ana aksiyonlar için</p>
                </div>
                <div className="space-y-4">
                  <button className="w-full px-6 py-3.5 bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-gray-300/40 dark:border-gray-700/40 rounded-xl text-gray-900 dark:text-gray-100 font-medium hover:bg-white/50 dark:hover:bg-black/50 hover:border-gray-400/50 dark:hover:border-gray-600/50 transition-all duration-300 shadow-sm hover:shadow-md">
                    Primary Button
                  </button>
                  <button className="w-full px-6 py-3.5 bg-white/20 dark:bg-black/20 backdrop-blur-xl border border-gray-300/20 dark:border-gray-700/20 rounded-xl text-gray-600 dark:text-gray-400 font-medium cursor-not-allowed opacity-50">
                    Disabled
                  </button>
                </div>
              </div>

              {/* Secondary - Glassmorphism */}
              <div className="bg-white/30 dark:bg-gray-900/30 backdrop-blur-xl border border-gray-200/30 dark:border-gray-800/30 rounded-2xl p-8 shadow-lg">
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Secondary</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">İkincil aksiyonlar için</p>
                </div>
                <div className="space-y-4">
                  <button className="w-full px-6 py-3.5 bg-white/30 dark:bg-black/30 backdrop-blur-xl border-2 border-gray-300/50 dark:border-gray-700/50 rounded-xl text-gray-900 dark:text-gray-100 font-medium hover:bg-white/40 dark:hover:bg-black/40 hover:border-gray-400/60 dark:hover:border-gray-600/60 transition-all duration-300">
                    Secondary Button
                  </button>
                  <button className="w-full px-6 py-3.5 bg-white/20 dark:bg-black/20 backdrop-blur-xl border-2 border-gray-300/20 dark:border-gray-700/20 rounded-xl text-gray-600 dark:text-gray-400 font-medium cursor-not-allowed opacity-50">
                    Disabled
                  </button>
                </div>
              </div>

              {/* Ghost - Glassmorphism */}
              <div className="bg-white/30 dark:bg-gray-900/30 backdrop-blur-xl border border-gray-200/30 dark:border-gray-800/30 rounded-2xl p-8 shadow-lg">
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Ghost</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Minimal aksiyonlar için</p>
                </div>
                <div className="space-y-4">
                  <button className="w-full px-6 py-3.5 bg-white/20 dark:bg-black/20 backdrop-blur-xl border border-gray-300/30 dark:border-gray-700/30 rounded-xl text-gray-900 dark:text-gray-100 font-medium hover:bg-white/30 dark:hover:bg-black/30 transition-all duration-300">
                    Ghost Button
                  </button>
                  <button className="w-full px-6 py-3.5 bg-white/10 dark:bg-black/10 backdrop-blur-xl border border-gray-300/20 dark:border-gray-700/20 rounded-xl text-gray-600 dark:text-gray-400 font-medium cursor-not-allowed opacity-50">
                    Disabled
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Cards Section - Soft Design */}
        <section className="py-20 relative">
          {/* Bulutsu Arka Plan */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-0 right-0 w-96 h-96 bg-gray-200/20 dark:bg-gray-800/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-slate-200/20 dark:bg-slate-800/10 rounded-full blur-3xl" />
          </div>

          <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-light text-gray-900 dark:text-gray-50 mb-4 tracking-tight">
                Card Styles
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto font-light">
                Soft ve profesyonel card tasarımları
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Standard Card */}
              <div className="bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/50 rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-500">
                <div className="w-14 h-14 rounded-xl bg-gray-100/50 dark:bg-gray-800/50 flex items-center justify-center mb-6">
                  <svg className="w-7 h-7 text-gray-700 dark:text-gray-300" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </div>
                <h3 className="text-xl font-medium text-gray-900 dark:text-gray-100 mb-3">
                  Standard Card
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed text-sm">
                  Temel card stili - genel kullanım için optimize edilmiş.
                </p>
                <button className="w-full px-6 py-3 bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-gray-300/40 dark:border-gray-700/40 rounded-xl text-gray-900 dark:text-gray-100 font-medium hover:bg-white/50 dark:hover:bg-black/50 transition-all duration-300 shadow-sm hover:shadow-md">
                  Action
                </button>
              </div>

              {/* Elevated Card */}
              <div className="bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl border-2 border-gray-300/50 dark:border-gray-700/50 rounded-2xl p-8 shadow-xl hover:shadow-2xl transition-all duration-500">
                <div className="w-14 h-14 rounded-xl bg-gray-100/50 dark:bg-gray-800/50 flex items-center justify-center mb-6">
                  <svg className="w-7 h-7 text-gray-700 dark:text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="6" width="18" height="14" rx="2" />
                    <path d="M3 10h18" />
                    <circle cx="17" cy="14" r="1" fill="currentColor" />
                  </svg>
                </div>
                <h3 className="text-xl font-medium text-gray-900 dark:text-gray-100 mb-3">
                  Elevated Card
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed text-sm">
                  Önemli içerikler için - daha belirgin görünüm.
                </p>
                <button className="w-full px-6 py-3 bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-gray-300/40 dark:border-gray-700/40 rounded-xl text-gray-900 dark:text-gray-100 font-medium hover:bg-white/50 dark:hover:bg-black/50 transition-all duration-300 shadow-sm hover:shadow-md">
                  Action
                </button>
              </div>

              {/* Glass Card */}
              <div className="bg-white/40 dark:bg-gray-900/40 backdrop-blur-2xl border border-gray-200/40 dark:border-gray-800/40 rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-500">
                <div className="w-14 h-14 rounded-xl bg-gray-100/50 dark:bg-gray-800/50 flex items-center justify-center mb-6">
                  <svg className="w-7 h-7 text-gray-700 dark:text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                </div>
                <h3 className="text-xl font-medium text-gray-900 dark:text-gray-100 mb-3">
                  Glass Card
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed text-sm">
                  Hero sections için - glassmorphism efekti.
                </p>
                <button className="w-full px-6 py-3 bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-gray-300/40 dark:border-gray-700/40 rounded-xl text-gray-900 dark:text-gray-100 font-medium hover:bg-white/50 dark:hover:bg-black/50 transition-all duration-300 shadow-sm hover:shadow-md">
                  Action
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Step Cards - Professional */}
        <section className="py-20 relative">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-light text-gray-900 dark:text-gray-50 mb-4 tracking-tight">
                Step Cards
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto font-light">
                Ana sayfa için profesyonel step card tasarımı
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {[
                { icon: "x", title: "Connect Your Profile", status: "idle" },
                { icon: "wallet", title: "Connect Wallet", status: "connected" },
                { icon: "nft", title: "Mint NFT", status: "completed" },
              ].map((step, idx) => (
                <div
                  key={idx}
                  className={`bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl border-2 rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-500 cursor-pointer ${
                    selectedCard === idx ? "border-gray-400 dark:border-gray-600" : ""
                  } ${
                    step.status === "connected"
                      ? "border-green-300/50 dark:border-green-700/50 bg-green-50/30 dark:bg-green-900/10"
                      : step.status === "completed"
                      ? "border-blue-300/50 dark:border-blue-700/50 bg-blue-50/30 dark:bg-blue-900/10"
                      : "border-gray-200/50 dark:border-gray-800/50"
                  }`}
                  onClick={() => setSelectedCard(idx)}
                >
                  {/* Icon */}
                  <div className="w-16 h-16 rounded-xl bg-gray-100/50 dark:bg-gray-800/50 flex items-center justify-center mb-6">
                    {step.icon === "x" && (
                      <svg className="w-8 h-8 text-gray-700 dark:text-gray-300" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                    )}
                    {step.icon === "wallet" && (
                      <svg className="w-8 h-8 text-gray-700 dark:text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="6" width="18" height="14" rx="2" />
                        <path d="M3 10h18" />
                        <circle cx="17" cy="14" r="1" fill="currentColor" />
                      </svg>
                    )}
                    {step.icon === "nft" && (
                      <svg className="w-8 h-8 text-gray-700 dark:text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                    )}
                  </div>

                  <h3 className="text-xl font-medium text-gray-900 dark:text-gray-100 mb-4">
                    {step.title}
                  </h3>

                  {step.status === "connected" && (
                    <div className="mb-6 flex justify-start">
                      <div className="inline-flex items-center gap-2 bg-green-100/50 dark:bg-green-900/30 border border-green-300/50 dark:border-green-700/50 text-green-700 dark:text-green-300 px-3 py-1.5 rounded-lg text-xs font-medium">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                        <span>Connected</span>
                      </div>
                    </div>
                  )}
                  {step.status === "completed" && (
                    <div className="mb-6 flex justify-start">
                      <div className="inline-flex items-center gap-2 bg-blue-100/50 dark:bg-blue-900/30 border border-blue-300/50 dark:border-blue-700/50 text-blue-700 dark:text-blue-300 px-3 py-1.5 rounded-lg text-xs font-medium">
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                        <span>Completed</span>
                      </div>
                    </div>
                  )}

                  <button className={`w-full px-6 py-3.5 font-medium rounded-xl transition-all duration-300 ${
                    step.status === "idle"
                      ? "bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-gray-300/40 dark:border-gray-700/40 text-gray-900 dark:text-gray-100 hover:bg-white/50 dark:hover:bg-black/50 shadow-sm hover:shadow-md"
                      : "bg-white/30 dark:bg-black/30 backdrop-blur-xl border border-gray-300/30 dark:border-gray-700/30 text-gray-900 dark:text-gray-100 hover:bg-white/40 dark:hover:bg-black/40"
                  }`}>
                    {step.status === "idle" ? "Get Started" : step.status === "connected" ? "Continue" : "View"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Input Fields - Soft */}
        <section className="py-20 relative">
          {/* Bulutsu Arka Plan */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-gray-200/15 dark:bg-gray-800/10 rounded-full blur-3xl" />
          </div>

          <div className="relative max-w-3xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-light text-gray-900 dark:text-gray-50 mb-4 tracking-tight">
                Input Fields
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto font-light">
                Soft ve kullanıcı dostu form elementleri
              </p>
            </div>

            <div className="bg-white/50 dark:bg-gray-900/50 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/50 rounded-2xl p-10 shadow-lg">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Text Input
                  </label>
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Enter text..."
                    className="w-full px-5 py-3.5 bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm border border-gray-300/50 dark:border-gray-700/50 rounded-xl text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:border-gray-400 dark:focus:border-gray-600 focus:bg-white/80 dark:focus:bg-gray-900/80 transition-all duration-200 shadow-sm focus:shadow-md"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Textarea
                  </label>
                  <textarea
                    rows={5}
                    placeholder="Enter longer text..."
                    className="w-full px-5 py-3.5 bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm border border-gray-300/50 dark:border-gray-700/50 rounded-xl text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:border-gray-400 dark:focus:border-gray-600 focus:bg-white/80 dark:focus:bg-gray-900/80 transition-all duration-200 resize-none shadow-sm focus:shadow-md"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Select
                  </label>
                  <select className="w-full px-5 py-3.5 bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm border border-gray-300/50 dark:border-gray-700/50 rounded-xl text-gray-900 dark:text-gray-100 focus:outline-none focus:border-gray-400 dark:focus:border-gray-600 focus:bg-white/80 dark:focus:bg-gray-900/80 transition-all duration-200 shadow-sm focus:shadow-md cursor-pointer">
                    <option>Option 1</option>
                    <option>Option 2</option>
                    <option>Option 3</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Stats Grid - Soft */}
        <section className="py-20 relative">
          <div className="max-w-5xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-light text-gray-900 dark:text-gray-50 mb-4 tracking-tight">
                Stats Grid
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto font-light">
                Hero section için soft istatistik kartları
              </p>
            </div>

            <div className="grid grid-cols-3 gap-6">
              {[
                { label: "Minted", value: "1,234" },
                { label: "Remaining", value: "4,321" },
                { label: "Total Supply", value: "5,555" },
              ].map((stat, idx) => (
                <div key={idx} className="bg-white/50 dark:bg-gray-900/50 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/50 rounded-2xl p-8 text-center shadow-lg hover:shadow-xl transition-all duration-500">
                  <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3 font-medium">
                    {stat.label}
                  </p>
                  <p className="text-3xl md:text-4xl font-light text-gray-900 dark:text-gray-50">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Progress Bar - Soft */}
        <section className="py-20 relative">
          {/* Bulutsu Arka Plan */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-slate-200/15 dark:bg-slate-800/10 rounded-full blur-3xl" />
          </div>

          <div className="relative max-w-3xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-light text-gray-900 dark:text-gray-50 mb-4 tracking-tight">
                Progress Bar
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto font-light">
                Mint progress için soft progress bar
              </p>
            </div>

            <div className="bg-white/50 dark:bg-gray-900/50 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/50 rounded-2xl p-10 shadow-lg">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-base font-medium text-gray-900 dark:text-gray-100">Mint Progress</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">22.2%</p>
                </div>
                <div className="relative h-3 bg-gray-200/50 dark:bg-gray-800/50 rounded-full overflow-hidden shadow-inner">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-gray-700 via-gray-600 to-gray-700 dark:from-gray-300 dark:via-gray-400 dark:to-gray-300 transition-all duration-1000 ease-out rounded-full"
                    style={{ width: "22.2%" }}
                  />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  1,234 of 5,555 xFrora NFTs minted
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Badges & Status - Soft */}
        <section className="py-20 relative">
          <div className="max-w-5xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-light text-gray-900 dark:text-gray-50 mb-4 tracking-tight">
                Badges & Status
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto font-light">
                Durum göstergeleri için soft badge'ler
              </p>
            </div>

            <div className="bg-white/50 dark:bg-gray-900/50 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/50 rounded-2xl p-10 shadow-lg">
              <div className="flex flex-wrap gap-4 justify-center">
                <div className="inline-flex items-center gap-2 bg-green-100/50 dark:bg-green-900/30 border border-green-300/50 dark:border-green-700/50 text-green-700 dark:text-green-300 px-4 py-2 rounded-lg text-sm font-medium">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  <span>Connected</span>
                </div>
                <div className="inline-flex items-center gap-2 bg-blue-100/50 dark:bg-blue-900/30 border border-blue-300/50 dark:border-blue-700/50 text-blue-700 dark:text-blue-300 px-4 py-2 rounded-lg text-sm font-medium">
                  <div className="w-2 h-2 bg-blue-500 rounded-full" />
                  <span>Completed</span>
                </div>
                <div className="inline-flex items-center gap-2 bg-yellow-100/50 dark:bg-yellow-900/30 border border-yellow-300/50 dark:border-yellow-700/50 text-yellow-700 dark:text-yellow-300 px-4 py-2 rounded-lg text-sm font-medium">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                  <span>Pending</span>
                </div>
                <div className="inline-flex items-center gap-2 bg-red-100/50 dark:bg-red-900/30 border border-red-300/50 dark:border-red-700/50 text-red-700 dark:text-red-300 px-4 py-2 rounded-lg text-sm font-medium">
                  <div className="w-2 h-2 bg-red-500 rounded-full" />
                  <span>Error</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Call to Action - Professional */}
        <section className="py-32 relative overflow-hidden">
          {/* Bulutsu Arka Plan */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gray-300/20 dark:bg-gray-700/10 rounded-full blur-3xl" />
          </div>
          
          <div className="relative max-w-4xl mx-auto px-6 lg:px-8 text-center">
            <div className="bg-white/50 dark:bg-gray-900/50 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/50 rounded-2xl p-16 shadow-xl">
              <div className="inline-block mb-6">
                <span className="px-4 py-1.5 bg-white/30 dark:bg-black/30 backdrop-blur-md border border-gray-300/30 dark:border-gray-700/30 rounded-full text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Professional Design
                </span>
              </div>
              <h2 className="text-4xl md:text-5xl font-light text-gray-900 dark:text-gray-50 mb-6 leading-tight">
                Beğendiniz mi?
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed font-light">
                Bu soft ve profesyonel tasarım sistemi tüm siteye uygulanabilir. 
                <br />
                <span className="text-gray-500 dark:text-gray-500">Beğenirseniz, adım adım tüm sayfalara uygulayacağız.</span>
              </p>
              <div className="flex gap-4 justify-center">
                <Link 
                  href="/" 
                  className="px-8 py-4 bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-gray-300/40 dark:border-gray-700/40 rounded-xl text-gray-900 dark:text-gray-100 font-medium hover:bg-white/50 dark:hover:bg-black/50 transition-all duration-300 shadow-sm hover:shadow-md"
                >
                  Ana Sayfaya Dön
                </Link>
                <button className="px-8 py-4 bg-white/30 dark:bg-black/30 backdrop-blur-xl border-2 border-gray-300/50 dark:border-gray-700/50 rounded-xl text-gray-900 dark:text-gray-100 font-medium hover:bg-white/40 dark:hover:bg-black/40 transition-all duration-300">
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
