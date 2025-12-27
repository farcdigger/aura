'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import ThemeToggle from '@/components/ThemeToggle';

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('overview');

  const sections = [
    { id: 'overview', title: 'Overview' },
    { id: 'nft', title: 'NFT Minting' },
    { id: 'x402', title: 'x402 Payments' },
    { id: 'deep-research', title: 'Deep Research' },
    { id: 'tech-stack', title: 'Technology Stack' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-50 dark:from-slate-950 dark:via-gray-950 dark:to-slate-950">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/40 dark:bg-black/40 backdrop-blur-2xl border-b border-gray-200/30 dark:border-gray-800/30">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <Link href="/" className="flex items-center gap-3 flex-shrink-0 group">
              <img 
                src="/frora-logo.png" 
                alt="XFRORA Logo" 
                className="w-10 h-10 rounded-full object-cover transition-opacity duration-300 group-hover:opacity-80"
              />
              <span className="text-xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">XFRORA</span>
            </Link>
            
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                Home
              </Link>
              <ThemeToggle />
              <ConnectButton />
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="pt-32 pb-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          {/* Header */}
          <div className="mb-16">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-3">
              Documentation
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Technical infrastructure, products, and technologies powering the xFrora platform
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="sticky top-32 space-y-1">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      activeSection === section.id
                        ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-900'
                    }`}
                  >
                    {section.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="lg:col-span-3">
              <div className="prose prose-gray dark:prose-invert max-w-none">
                {activeSection === 'overview' && <OverviewSection />}
                {activeSection === 'nft' && <NFTSection />}
                {activeSection === 'x402' && <X402Section />}
                {activeSection === 'deep-research' && <DeepResearchSection />}
                {activeSection === 'tech-stack' && <TechStackSection />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewSection() {
  return (
    <div>
      <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        Platform Overview
      </h2>
      
      <p className="text-gray-600 dark:text-gray-400 text-base leading-relaxed mb-8">
        xFrora is a Web3 platform that combines blockchain technology with AI-powered analytics. 
        We provide unique NFTs for our users while offering powerful analysis tools to help them make informed 
        decisions in the DeFi ecosystem.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        <div className="border border-gray-200 dark:border-gray-800 p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">NFT Minting</h3>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            Unique AI-generated NFTs based on your X (Twitter) profile. One NFT per user, minted on Base network.
          </p>
        </div>

        <div className="border border-gray-200 dark:border-gray-800 p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Deep Research</h3>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            AI-powered deep analysis for Solana tokens. Whale tracking, liquidity analysis, and security scores.
          </p>
        </div>

        <div className="border border-gray-200 dark:border-gray-800 p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">x402 Payments</h3>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            Modern payment infrastructure based on Coinbase CDP. Fast and secure payments with USDC on Base network.
          </p>
        </div>

        <div className="border border-gray-200 dark:border-gray-800 p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">AI Chat Assistant</h3>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            Token-based AI chat assistant powered by GPT-4o. Smart answers for blockchain and DeFi questions.
          </p>
        </div>
      </div>

      <div className="border-l-2 border-gray-900 dark:border-gray-100 pl-6 mb-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Key Features</h3>
        <ul className="space-y-2 text-gray-600 dark:text-gray-400">
          <li>User-friendly interface and seamless onboarding process</li>
          <li>Secure and transparent smart contract infrastructure</li>
          <li>AI-powered analysis and insights</li>
          <li>Exclusive benefits and discounts for NFT holders</li>
        </ul>
      </div>
    </div>
  );
}

function NFTSection() {
  return (
    <div>
      <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        NFT Minting System
      </h2>

      <p className="text-gray-600 dark:text-gray-400 text-base leading-relaxed mb-8">
        The xFrora NFT collection consists of unique digital artworks generated by artificial intelligence 
        using your X (Twitter) profile information. Each NFT is a one-of-a-kind piece representing its owner's 
        social identity.
      </p>

      <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        Technical Specifications
      </h3>

      <div className="border border-gray-200 dark:border-gray-800 p-6 rounded-lg mb-8">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            <tr>
              <td className="py-3 font-medium text-gray-900 dark:text-gray-100">Standard</td>
              <td className="py-3 text-gray-600 dark:text-gray-400">ERC-721</td>
            </tr>
            <tr>
              <td className="py-3 font-medium text-gray-900 dark:text-gray-100">Network</td>
              <td className="py-3 text-gray-600 dark:text-gray-400">Base Mainnet (Chain ID: 8453)</td>
            </tr>
            <tr>
              <td className="py-3 font-medium text-gray-900 dark:text-gray-100">Max Supply</td>
              <td className="py-3 text-gray-600 dark:text-gray-400">5,555 NFTs</td>
            </tr>
            <tr>
              <td className="py-3 font-medium text-gray-900 dark:text-gray-100">Price</td>
              <td className="py-3 text-gray-600 dark:text-gray-400">5 USDC</td>
            </tr>
            <tr>
              <td className="py-3 font-medium text-gray-900 dark:text-gray-100">Contract</td>
              <td className="py-3 text-gray-600 dark:text-gray-400 font-mono text-xs">0x7De68EB999A314A0f986D417adcbcE515E476396</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        Minting Process
      </h3>

      <ol className="space-y-4 mb-8">
        <li className="border-l-2 border-gray-300 dark:border-gray-700 pl-4">
          <div className="font-medium text-gray-900 dark:text-gray-100 mb-1">Connect with X</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Secure connection to your Twitter account via OAuth 2.0</div>
        </li>
        <li className="border-l-2 border-gray-300 dark:border-gray-700 pl-4">
          <div className="font-medium text-gray-900 dark:text-gray-100 mb-1">AI Image Generation</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Unique NFT artwork created for your profile using Daydreams AI</div>
        </li>
        <li className="border-l-2 border-gray-300 dark:border-gray-700 pl-4">
          <div className="font-medium text-gray-900 dark:text-gray-100 mb-1">x402 Payment</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Pay 5 USDC on Base network via Coinbase CDP</div>
        </li>
        <li className="border-l-2 border-gray-300 dark:border-gray-700 pl-4">
          <div className="font-medium text-gray-900 dark:text-gray-100 mb-1">Smart Contract Minting</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">NFT is minted on the Base network smart contract</div>
        </li>
        <li className="border-l-2 border-gray-300 dark:border-gray-700 pl-4">
          <div className="font-medium text-gray-900 dark:text-gray-100 mb-1">IPFS Upload</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Metadata and image uploaded to IPFS for decentralized storage</div>
        </li>
      </ol>

      <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        Key Features
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="border border-gray-200 dark:border-gray-800 p-4 rounded-lg">
          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Uniqueness</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Each X user can only mint 1 NFT. X User ID-based verification system.
          </p>
        </div>
        
        <div className="border border-gray-200 dark:border-gray-800 p-4 rounded-lg">
          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Security</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            EIP-712 signed transactions with replay attack protection and nonce tracking.
          </p>
        </div>
        
        <div className="border border-gray-200 dark:border-gray-800 p-4 rounded-lg">
          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">AI Generation</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Custom design based on your profile via Daydreams AI. Decentralized storage on IPFS.
          </p>
        </div>
        
        <div className="border border-gray-200 dark:border-gray-800 p-4 rounded-lg">
          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">NFT Holder Benefits</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            87% discount on Deep Research analysis (1.50 → 0.20 USDC).
          </p>
        </div>
      </div>

      <div className="border border-gray-200 dark:border-gray-800 p-6 rounded-lg">
        <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Smart Contract Libraries</h4>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Built with OpenZeppelin standard libraries for security and reliability:
        </p>
        <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
          <li>ERC721URIStorage - Metadata management</li>
          <li>Ownable - Access control</li>
          <li>EIP712 - Signature verification</li>
          <li>ReentrancyGuard - Security</li>
        </ul>
      </div>
    </div>
  );
}

function X402Section() {
  return (
    <div>
      <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        x402 Payment Protocol
      </h2>

      <p className="text-gray-600 dark:text-gray-400 text-base leading-relaxed mb-8">
        x402 is a payment protocol that integrates blockchain payments with API calls using the HTTP 402 
        (Payment Required) status code. We process USDC payments using the Coinbase Commerce Developer Platform (CDP) 
        infrastructure on Base network.
      </p>

      <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        System Architecture
      </h3>

      <div className="border border-gray-200 dark:border-gray-800 p-6 rounded-lg mb-8 overflow-x-auto">
        <pre className="text-xs text-gray-700 dark:text-gray-300">
{`┌─────────────────────────────────────────────┐
│              Frontend                       │
│  • x402-client.ts                           │
│  • EIP-712 signature generation             │
└─────────────────┬───────────────────────────┘
                  │
                  │ HTTP + x402-Payment Header
                  │
┌─────────────────▼───────────────────────────┐
│              Backend API                    │
│  • Payment verification                     │
│  • CDP Facilitator settlement               │
│  • USDC transfer confirmation               │
└─────────────────┬───────────────────────────┘
                  │
                  │ Settlement Request
                  │
┌─────────────────▼───────────────────────────┐
│         Coinbase CDP Facilitator            │
│  • USDC transfer execution                  │
│  • Base Network (Chain ID: 8453)            │
└─────────────────────────────────────────────┘`}
        </pre>
      </div>

      <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        Payment Flow
      </h3>

      <ol className="space-y-4 mb-8">
        <li className="border-l-2 border-gray-300 dark:border-gray-700 pl-4">
          <div className="font-medium text-gray-900 dark:text-gray-100 mb-1">1. Initial Request</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Frontend sends GET request to protected endpoint. Backend returns 402 Payment Required with payment details.</div>
        </li>
        <li className="border-l-2 border-gray-300 dark:border-gray-700 pl-4">
          <div className="font-medium text-gray-900 dark:text-gray-100 mb-1">2. Wallet Signature</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">User signs payment commitment with their wallet using EIP-712 standard. This single signature authorizes the USDC transfer.</div>
        </li>
        <li className="border-l-2 border-gray-300 dark:border-gray-700 pl-4">
          <div className="font-medium text-gray-900 dark:text-gray-100 mb-1">3. Payment Execution</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Frontend sends POST request with x402-payment header containing the signed commitment. Backend verifies signature and calls CDP Facilitator API.</div>
        </li>
        <li className="border-l-2 border-gray-300 dark:border-gray-700 pl-4">
          <div className="font-medium text-gray-900 dark:text-gray-100 mb-1">4. On-chain Transfer</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">CDP Facilitator executes USDC transfer on Base network. Transaction is confirmed on-chain.</div>
        </li>
        <li className="border-l-2 border-gray-300 dark:border-gray-700 pl-4">
          <div className="font-medium text-gray-900 dark:text-gray-100 mb-1">5. Service Delivery</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">After successful payment, API returns the requested content (NFT mint, analysis result, chat credits).</div>
        </li>
      </ol>

      <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        Use Cases
      </h3>

      <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left font-medium text-gray-900 dark:text-gray-100">Service</th>
              <th className="px-6 py-3 text-left font-medium text-gray-900 dark:text-gray-100">Price</th>
              <th className="px-6 py-3 text-left font-medium text-gray-900 dark:text-gray-100">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            <tr>
              <td className="px-6 py-4 text-gray-900 dark:text-gray-100">NFT Minting</td>
              <td className="px-6 py-4 text-gray-600 dark:text-gray-400">5 USDC</td>
              <td className="px-6 py-4 text-gray-600 dark:text-gray-400">AI-generated unique NFT on Base network</td>
            </tr>
            <tr>
              <td className="px-6 py-4 text-gray-900 dark:text-gray-100">Deep Research</td>
              <td className="px-6 py-4 text-gray-600 dark:text-gray-400">0.20 - 1.50 USDC</td>
              <td className="px-6 py-4 text-gray-600 dark:text-gray-400">Token analysis (87% discount for NFT holders)</td>
            </tr>
            <tr>
              <td className="px-6 py-4 text-gray-900 dark:text-gray-100">AI Chat Credits</td>
              <td className="px-6 py-4 text-gray-600 dark:text-gray-400">0.01 - 2 USDC</td>
              <td className="px-6 py-4 text-gray-600 dark:text-gray-400">Token purchase for AI chat assistant</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="border-l-2 border-gray-900 dark:border-gray-100 pl-6">
        <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Technical Advantages</h4>
        <ul className="space-y-2 text-gray-600 dark:text-gray-400 text-sm">
          <li>Standard HTTP protocol - no special wallet library required</li>
          <li>Low cost - minimal gas fees on Base L2</li>
          <li>Fast settlement - instant transfer via CDP Facilitator</li>
          <li>Secure - EIP-712 signed commitment with replay attack protection</li>
        </ul>
      </div>
    </div>
  );
}

function DeepResearchSection() {
  return (
    <div>
      <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        Deep Research - AI Token Analysis
      </h2>

      <p className="text-gray-600 dark:text-gray-400 text-base leading-relaxed mb-8">
        Deep Research generates comprehensive AI-powered analysis reports for tokens in the Solana ecosystem. 
        By processing on-chain data, it provides critical information such as whale movements, liquidity status, 
        security scores, and manipulation detection.
      </p>

      <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        Analysis Components
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="border border-gray-200 dark:border-gray-800 p-6 rounded-lg">
          <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Whale Tracking</h4>
          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li>Large wallet movement tracking</li>
            <li>Accumulation and selling patterns</li>
            <li>Whale position changes</li>
            <li>Smart money flow analysis</li>
          </ul>
        </div>

        <div className="border border-gray-200 dark:border-gray-800 p-6 rounded-lg">
          <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Security Score</h4>
          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li>Diamond hands percentage</li>
            <li>Re-entry rate analysis</li>
            <li>Early buyer holding rate</li>
            <li>Liquidity health check</li>
          </ul>
        </div>

        <div className="border border-gray-200 dark:border-gray-800 p-6 rounded-lg">
          <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Liquidity Analysis</h4>
          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li>Pool health metrics</li>
            <li>TVL and market cap ratios</li>
            <li>Liquidity depth analysis</li>
            <li>Volume/liquidity ratio</li>
          </ul>
        </div>

        <div className="border border-gray-200 dark:border-gray-800 p-6 rounded-lg">
          <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Manipulation Detection</h4>
          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li>Wash trading detection</li>
            <li>Bot activity analysis</li>
            <li>Suspicious transaction patterns</li>
            <li>Pump & dump signals</li>
          </ul>
        </div>
      </div>

      <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        Data Sources
      </h3>

      <div className="space-y-4 mb-8">
        <div className="border border-gray-200 dark:border-gray-800 p-4 rounded-lg">
          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Birdeye API</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            10,000+ swap transaction data. Real-time price and trading volume information.
          </p>
        </div>

        <div className="border border-gray-200 dark:border-gray-800 p-4 rounded-lg">
          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Claude AI</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Deep analysis via Daydreams integration. Pattern recognition and insight generation.
          </p>
        </div>

        <div className="border border-gray-200 dark:border-gray-800 p-4 rounded-lg">
          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Supabase + Redis</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Analysis result storage and asynchronous processing with BullMQ queue.
          </p>
        </div>
      </div>

      <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        Pricing
      </h3>

      <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left font-medium text-gray-900 dark:text-gray-100">User Type</th>
              <th className="px-6 py-3 text-left font-medium text-gray-900 dark:text-gray-100">Price</th>
              <th className="px-6 py-3 text-left font-medium text-gray-900 dark:text-gray-100">Discount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            <tr>
              <td className="px-6 py-4 text-gray-900 dark:text-gray-100">NFT Holders</td>
              <td className="px-6 py-4 text-gray-600 dark:text-gray-400">0.20 USDC</td>
              <td className="px-6 py-4 text-gray-600 dark:text-gray-400">87% off</td>
            </tr>
            <tr>
              <td className="px-6 py-4 text-gray-900 dark:text-gray-100">Standard Users</td>
              <td className="px-6 py-4 text-gray-600 dark:text-gray-400">1.50 USDC</td>
              <td className="px-6 py-4 text-gray-600 dark:text-gray-400">-</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="border border-gray-200 dark:border-gray-800 p-6 rounded-lg">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          NFT ownership is automatically verified via smart contract. If you have an xFrora NFT in your wallet, 
          the 87% discount is automatically applied.
        </p>
      </div>
    </div>
  );
}

function TechStackSection() {
  return (
    <div>
      <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        Technology Stack
      </h2>

      <p className="text-gray-600 dark:text-gray-400 text-base leading-relaxed mb-8">
        xFrora combines modern web3 technologies and AI tools to provide a powerful, scalable, and user-friendly platform.
      </p>

      <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        Frontend
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <TechItem title="Next.js 14" description="App Router, Server Components" />
        <TechItem title="TypeScript" description="Type-safe development" />
        <TechItem title="Tailwind CSS" description="Utility-first CSS" />
        <TechItem title="RainbowKit" description="Wallet management" />
        <TechItem title="wagmi + viem" description="Ethereum interaction" />
        <TechItem title="Framer Motion" description="Animations" />
      </div>

      <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        Backend & Infrastructure
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <TechItem title="Next.js API Routes" description="Serverless endpoints" />
        <TechItem title="Supabase" description="PostgreSQL database" />
        <TechItem title="Redis + BullMQ" description="Job queue" />
        <TechItem title="Vercel" description="Edge deployment" />
        <TechItem title="OAuth 2.0" description="X authentication" />
        <TechItem title="IPFS" description="Decentralized storage" />
      </div>

      <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        Blockchain
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <TechItem title="Base Network" description="Ethereum L2 (OP Stack)" />
        <TechItem title="ethers.js" description="Ethereum library" />
        <TechItem title="OpenZeppelin" description="Smart contract libraries" />
        <TechItem title="Foundry" description="Contract development" />
        <TechItem title="Solana Web3.js" description="Solana integration" />
        <TechItem title="EIP-712" description="Structured data signing" />
      </div>

      <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        AI & Analytics
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <TechItem title="Claude AI" description="Daydreams integration" />
        <TechItem title="Daydreams AI" description="Image generation API" />
        <TechItem title="GPT-4o" description="Chat assistant" />
        <TechItem title="Birdeye API" description="Solana DEX data" />
        <TechItem title="DexScreener" description="Multi-chain analytics" />
        <TechItem title="The Graph" description="Data indexing" />
      </div>

      <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        Payment Infrastructure
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <TechItem title="Coinbase CDP" description="USDC facilitator" />
        <TechItem title="USDC on Base" description="Stablecoin payments" />
        <TechItem title="x402 Protocol" description="HTTP 402 standard" />
        <TechItem title="EIP-712" description="Payment signatures" />
      </div>

      <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        Project Structure
      </h3>

      <div className="border border-gray-200 dark:border-gray-800 p-6 rounded-lg">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Monorepo architecture with workspace-based modular structure:
        </p>
        <div className="space-y-3">
          <div>
            <div className="font-medium text-gray-900 dark:text-gray-100 text-sm mb-1">apps/web</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Next.js frontend application, API routes, and UI components</div>
          </div>
          <div>
            <div className="font-medium text-gray-900 dark:text-gray-100 text-sm mb-1">packages/contracts</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Solidity smart contracts and deployment scripts</div>
          </div>
          <div>
            <div className="font-medium text-gray-900 dark:text-gray-100 text-sm mb-1">packages/shared</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Shared types, utilities, and configurations</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TechItem({ title, description }: { title: string; description: string }) {
  return (
    <div className="border border-gray-200 dark:border-gray-800 p-4 rounded-lg">
      <div className="font-medium text-gray-900 dark:text-gray-100 text-sm mb-1">{title}</div>
      <div className="text-xs text-gray-600 dark:text-gray-400">{description}</div>
    </div>
  );
}
