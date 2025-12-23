"use client";

import { useState } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

/**
 * Design Demo Page - Yeni tasarım sistemini test etmek için
 * Bu sayfa, yeni tasarım konseptinin tüm özelliklerini gösterir
 */
export default function DesignDemoPage() {
  const [inputValue, setInputValue] = useState("");
  const [selectedCard, setSelectedCard] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {/* Navigation - İyileştirilmiş */}
      <nav className="bg-white/80 dark:bg-black/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800 sticky top-0 z-50 transition-all duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="relative">
                <img 
                  src="/frora-logo.png" 
                  alt="XFRORA Logo" 
                  className="w-10 h-10 rounded-full object-cover transition-transform duration-200 group-hover:scale-110"
                />
              </div>
              <span className="text-xl font-bold text-black dark:text-white uppercase tracking-tight">
                XFRORA
              </span>
            </Link>
            
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <Link
                href="/"
                className="px-4 py-2 text-sm font-medium text-black dark:text-white hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg transition-all duration-200"
              >
                Ana Sayfaya Dön
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16 lg:py-20">
        
        {/* Hero Section - Yeni Tasarım */}
        <section className="mb-20 animate-fade-in">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-black dark:text-white mb-4 leading-tight">
              Yeni Tasarım Sistemi
              <br />
              <span className="bg-gradient-to-r from-black to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                Demo & Test
              </span>
            </h1>
            <p className="text-lg md:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Bu sayfa, xFrora için hazırlanan yeni profesyonel tasarım sisteminin tüm özelliklerini gösterir.
              Beğenirseniz, tüm siteye uygulanacak.
            </p>
          </div>

          {/* Hero Card Example */}
          <div className="card-elevated max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-2xl font-bold text-black dark:text-white mb-4">
                  Modern Hero Section
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Yeni tasarım sistemi ile daha profesyonel, daha temiz ve daha karakteristik bir görünüm.
                </p>
                <div className="flex gap-3">
                  <button className="btn-primary">Primary Button</button>
                  <button className="btn-secondary">Secondary</button>
                </div>
              </div>
              <div className="flex justify-center">
                <div className="relative w-48 h-48">
                  <div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-400 dark:from-gray-700 dark:to-gray-900 rounded-full blur-2xl opacity-50 animate-pulse" />
                  <div className="relative w-full h-full rounded-full bg-gradient-to-br from-gray-50 to-gray-200 dark:from-gray-900 dark:to-gray-800 border-4 border-black dark:border-white flex items-center justify-center overflow-hidden shadow-xl">
                    <img
                      src="/frora-logo.png"
                      alt="xFrora Logo"
                      className="w-3/4 h-3/4 object-cover rounded-full"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Buttons Section */}
        <section className="mb-20">
          <h2 className="text-3xl font-bold text-black dark:text-white mb-8">Button Styles</h2>
          <div className="card p-8">
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
                  Primary Buttons
                </h3>
                <div className="flex flex-wrap gap-4">
                  <button className="btn-primary">Primary Button</button>
                  <button className="btn-primary" disabled>Disabled</button>
                  <button className="btn-primary">Small</button>
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
                  Secondary Buttons
                </h3>
                <div className="flex flex-wrap gap-4">
                  <button className="btn-secondary">Secondary Button</button>
                  <button className="btn-secondary" disabled>Disabled</button>
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
                  Ghost Buttons
                </h3>
                <div className="flex flex-wrap gap-4">
                  <button className="btn-ghost">Ghost Button</button>
                  <button className="btn-ghost" disabled>Disabled</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Cards Section */}
        <section className="mb-20">
          <h2 className="text-3xl font-bold text-black dark:text-white mb-8">Card Styles</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Standard Card */}
            <div className="card">
              <div className="w-12 h-12 rounded-full bg-purple-600 dark:bg-purple-500 flex items-center justify-center mb-4 mx-auto">
                <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-center mb-2 text-black dark:text-white">
                Standard Card
              </h3>
              <p className="text-sm text-gray-600 text-center mb-4 dark:text-gray-400">
                Temel card stili - genel kullanım için
              </p>
              <button className="btn-primary w-full">Action</button>
            </div>

            {/* Elevated Card */}
            <div className="card-elevated">
              <div className="w-12 h-12 rounded-full bg-teal-500 dark:bg-teal-400 flex items-center justify-center mb-4 mx-auto">
                <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="6" width="18" height="14" rx="2" />
                  <path d="M3 10h18" />
                  <circle cx="17" cy="14" r="1" fill="currentColor" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-center mb-2 text-black dark:text-white">
                Elevated Card
              </h3>
              <p className="text-sm text-gray-600 text-center mb-4 dark:text-gray-400">
                Önemli içerikler için - daha belirgin shadow
              </p>
              <button className="btn-secondary w-full">Action</button>
            </div>

            {/* Glass Card */}
            <div className="card-glass">
              <div className="w-12 h-12 rounded-full bg-indigo-500 dark:bg-indigo-400 flex items-center justify-center mb-4 mx-auto">
                <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-center mb-2 text-black dark:text-white">
                Glass Card
              </h3>
              <p className="text-sm text-gray-600 text-center mb-4 dark:text-gray-400">
                Hero sections için - glassmorphism efekti
              </p>
              <button className="btn-ghost w-full">Action</button>
            </div>
          </div>
        </section>

        {/* Step Cards - Ana Sayfa Örneği */}
        <section className="mb-20">
          <h2 className="text-3xl font-bold text-black dark:text-white mb-8">Step Cards (Ana Sayfa Örneği)</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: "x", title: "Connect Your Profile", status: "idle", color: "purple" },
              { icon: "wallet", title: "Connect Wallet", status: "connected", color: "teal" },
              { icon: "nft", title: "Mint NFT", status: "completed", color: "indigo" },
            ].map((step, idx) => (
              <div
                key={idx}
                className={`card transition-all duration-300 hover:scale-[1.02] cursor-pointer ${
                  selectedCard === idx ? "ring-2 ring-black dark:ring-white" : ""
                } ${
                  step.status === "connected"
                    ? "border-green-500/30 bg-green-50/50 dark:bg-green-900/10 dark:border-green-400/20"
                    : step.status === "completed"
                    ? "border-blue-500/30 bg-blue-50/50 dark:bg-blue-900/10 dark:border-blue-400/20"
                    : "border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
                }`}
                onClick={() => setSelectedCard(idx)}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 transition-transform duration-200 hover:scale-110 ${
                  step.color === "purple" ? "bg-purple-600 dark:bg-purple-500" :
                  step.color === "teal" ? "bg-teal-500 dark:bg-teal-400" :
                  "bg-indigo-500 dark:bg-indigo-400"
                }`}>
                  {step.icon === "x" && (
                    <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  )}
                  {step.icon === "wallet" && (
                    <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="6" width="18" height="14" rx="2" />
                      <path d="M3 10h18" />
                      <circle cx="17" cy="14" r="1" fill="currentColor" />
                    </svg>
                  )}
                  {step.icon === "nft" && (
                    <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
                      <path d="M21 15l-5-5L5 21" />
                    </svg>
                  )}
                </div>
                <h3 className="text-xl font-bold text-center mb-2 text-black dark:text-white">
                  {step.title}
                </h3>
                {step.status === "connected" && (
                  <div className="mb-4 flex justify-center">
                    <div className="inline-flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-3 py-1.5 rounded-full text-xs font-medium">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                      <span>Connected</span>
                    </div>
                  </div>
                )}
                {step.status === "completed" && (
                  <div className="mb-4 flex justify-center">
                    <div className="inline-flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 px-3 py-1.5 rounded-full text-xs font-medium">
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                      <span>Completed</span>
                    </div>
                  </div>
                )}
                <button className="btn-primary w-full">
                  {step.status === "idle" ? "Get Started" : step.status === "connected" ? "Continue" : "View"}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Input Fields */}
        <section className="mb-20">
          <h2 className="text-3xl font-bold text-black dark:text-white mb-8">Input Fields</h2>
          <div className="card p-8 max-w-2xl mx-auto">
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-black dark:text-white mb-2">
                  Text Input
                </label>
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Enter text..."
                  className="w-full px-4 py-3 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-800 rounded-lg text-black dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:border-black dark:focus:border-white focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 transition-all duration-200"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-black dark:text-white mb-2">
                  Textarea
                </label>
                <textarea
                  rows={4}
                  placeholder="Enter longer text..."
                  className="w-full px-4 py-3 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-800 rounded-lg text-black dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:border-black dark:focus:border-white focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 transition-all duration-200 resize-none"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-black dark:text-white mb-2">
                  Select
                </label>
                <select className="w-full px-4 py-3 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-800 rounded-lg text-black dark:text-white focus:outline-none focus:border-black dark:focus:border-white focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 transition-all duration-200">
                  <option>Option 1</option>
                  <option>Option 2</option>
                  <option>Option 3</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* Stats Grid - Hero Örneği */}
        <section className="mb-20">
          <h2 className="text-3xl font-bold text-black dark:text-white mb-8">Stats Grid (Hero Örneği)</h2>
          <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto">
            {[
              { label: "Minted", value: "1,234" },
              { label: "Remaining", value: "4,321" },
              { label: "Total Supply", value: "5,555" },
            ].map((stat, idx) => (
              <div key={idx} className="card p-4 text-center">
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                  {stat.label}
                </p>
                <p className="text-2xl md:text-3xl font-bold text-black dark:text-white">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Progress Bar */}
        <section className="mb-20">
          <h2 className="text-3xl font-bold text-black dark:text-white mb-8">Progress Bar</h2>
          <div className="card p-8 max-w-2xl mx-auto">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-black dark:text-white">Mint Progress</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">22.2%</p>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-black via-gray-800 to-black dark:from-white dark:via-gray-200 dark:to-white transition-all duration-500 ease-out"
                  style={{ width: "22.2%" }}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                1,234 of 5,555 xFrora NFTs minted
              </p>
            </div>
          </div>
        </section>

        {/* Badges & Status */}
        <section className="mb-20">
          <h2 className="text-3xl font-bold text-black dark:text-white mb-8">Badges & Status</h2>
          <div className="card p-8">
            <div className="flex flex-wrap gap-4">
              <div className="inline-flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-3 py-1.5 rounded-full text-xs font-medium">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                <span>Connected</span>
              </div>
              <div className="inline-flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 px-3 py-1.5 rounded-full text-xs font-medium">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                <span>Completed</span>
              </div>
              <div className="inline-flex items-center gap-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300 px-3 py-1.5 rounded-full text-xs font-medium">
                <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full" />
                <span>Pending</span>
              </div>
              <div className="inline-flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-3 py-1.5 rounded-full text-xs font-medium">
                <div className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                <span>Error</span>
              </div>
            </div>
          </div>
        </section>

        {/* Call to Action */}
        <section className="mb-20">
          <div className="card-elevated p-12 text-center">
            <h2 className="text-3xl font-bold text-black dark:text-white mb-4">
              Beğendiniz mi?
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 max-w-2xl mx-auto">
              Bu tasarım sistemi tüm siteye uygulanabilir. Beğenirseniz, adım adım tüm sayfalara uygulayacağız.
            </p>
            <div className="flex gap-4 justify-center">
              <Link href="/" className="btn-primary">
                Ana Sayfaya Dön
              </Link>
              <button className="btn-secondary">
                Geri Bildirim Ver
              </button>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}

