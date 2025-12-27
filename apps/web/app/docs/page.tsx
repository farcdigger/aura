'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import ThemeToggle from '@/components/ThemeToggle';

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('overview');

  const sections = [
    { id: 'overview', title: 'Overview', icon: '📖' },
    { id: 'nft', title: 'NFT Minting', icon: '🎨' },
    { id: 'x402', title: 'x402 Payments', icon: '💳' },
    { id: 'deep-research', title: 'Deep Research', icon: '🔬' },
    { id: 'tech-stack', title: 'Technology', icon: '⚙️' },
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
      <div className="pt-24 pb-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="text-5xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              Documentation
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
              Technical infrastructure, products, and technologies powering the xFrora platform
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="sticky top-24 space-y-2">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 flex items-center gap-3 ${
                      activeSection === section.id
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25'
                        : 'bg-white/60 dark:bg-gray-900/60 text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-900'
                    }`}
                  >
                    <span className="text-2xl">{section.icon}</span>
                    <span className="font-medium">{section.title}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="lg:col-span-3">
              <div className="bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm rounded-2xl border border-gray-200/50 dark:border-gray-800/50 p-8 shadow-xl">
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
    <div className="prose prose-lg dark:prose-invert max-w-none">
      <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        🌟 xFrora Platform
      </h2>
      
      <p className="text-gray-600 dark:text-gray-400 text-lg leading-relaxed mb-6">
        xFrora is an innovative Web3 platform that combines blockchain technology with AI-powered analytics. 
        We provide unique NFTs for our users while offering powerful analysis tools to help them make informed 
        decisions in the DeFi ecosystem.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-8">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 p-6 rounded-xl border border-blue-200 dark:border-blue-800">
          <div className="text-3xl mb-3">🎨</div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">NFT Minting</h3>
          <p className="text-gray-600 dark:text-gray-400">
            Unique AI-generated NFTs based on your X (Twitter) profile. One NFT per user, minted on Base network.
          </p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 p-6 rounded-xl border border-purple-200 dark:border-purple-800">
          <div className="text-3xl mb-3">🔬</div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Deep Research</h3>
          <p className="text-gray-600 dark:text-gray-400">
            AI-powered deep analysis for Solana tokens. Whale tracking, liquidity analysis, and security scores.
          </p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 p-6 rounded-xl border border-green-200 dark:border-green-800">
          <div className="text-3xl mb-3">💳</div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">x402 Payments</h3>
          <p className="text-gray-600 dark:text-gray-400">
            Modern payment infrastructure based on Coinbase CDP. Fast and secure payments with USDC.
          </p>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950/30 dark:to-red-950/30 p-6 rounded-xl border border-orange-200 dark:border-orange-800">
          <div className="text-3xl mb-3">💬</div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">AI Chat Assistant</h3>
          <p className="text-gray-600 dark:text-gray-400">
            Token-based AI chat assistant. Smart answers and analysis for blockchain and DeFi questions.
          </p>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-950/30 border-l-4 border-blue-600 p-6 rounded-r-lg my-8">
        <h3 className="text-lg font-bold text-blue-900 dark:text-blue-100 mb-2">💡 Why xFrora?</h3>
        <ul className="space-y-2 text-gray-700 dark:text-gray-300">
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-1">✓</span>
            <span>User-friendly interface and seamless onboarding process</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-1">✓</span>
            <span>Secure and transparent smart contract infrastructure</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-1">✓</span>
            <span>AI-powered analysis and insights</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-1">✓</span>
            <span>Exclusive benefits and discounts for NFT holders</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

function NFTSection() {
  return (
    <div className="prose prose-lg dark:prose-invert max-w-none">
      <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        🎨 NFT Minting System
      </h2>

      <p className="text-gray-600 dark:text-gray-400 text-lg leading-relaxed mb-6">
        The xFrora NFT collection consists of unique digital artworks generated by artificial intelligence 
        using your X (Twitter) profile information. Each NFT is a one-of-a-kind piece representing its owner's 
        social identity.
      </p>

      <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        🔧 Technical Infrastructure
      </h3>

      <div className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-xl border border-gray-200 dark:border-gray-800 mb-6">
        <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Smart Contract Specifications</h4>
        <ul className="space-y-2 text-gray-700 dark:text-gray-300">
          <li><strong>Standard:</strong> ERC-721 (NFT Standard)</li>
          <li><strong>Network:</strong> Base Mainnet (Ethereum L2 - Chain ID: 8453)</li>
          <li><strong>Max Supply:</strong> 5,555 NFTs</li>
          <li><strong>Minting Price:</strong> 5 USDC</li>
          <li><strong>Contract:</strong> <code className="text-sm bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded">0x7De68EB999A314A0f986D417adcbcE515E476396</code></li>
        </ul>
      </div>

      <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        ⚡ Minting Process
      </h3>

      <p className="text-gray-600 dark:text-gray-400 mb-4">
        After payment via the x402 protocol, our backend server mints the NFT on the Base network smart contract.
      </p>

      <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 p-6 rounded-xl border border-purple-200 dark:border-purple-800 mb-6">
        <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">📝 Minting Steps</h4>
        <ol className="space-y-3 text-gray-700 dark:text-gray-300">
          <li><strong>1. Connect with X:</strong> Secure connection to your Twitter account via OAuth 2.0</li>
          <li><strong>2. AI Image Generation:</strong> Unique NFT artwork created for your profile (Daydreams API)</li>
          <li><strong>3. x402 Payment:</strong> Pay 5 USDC on Base network (Coinbase CDP)</li>
          <li><strong>4. Mint Permit:</strong> Backend creates EIP-712 signed mint permit</li>
          <li><strong>5. Contract Mint:</strong> NFT is minted on the Base network smart contract</li>
          <li><strong>6. IPFS Upload:</strong> Metadata and image uploaded to IPFS (decentralized storage)</li>
        </ol>
      </div>

      <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        🎯 NFT Features
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-800">
          <h5 className="font-bold text-gray-900 dark:text-gray-100 mb-2">✨ Uniqueness</h5>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Each X user can only mint 1 NFT. X User ID-based verification system.
          </p>
        </div>
        
        <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-800">
          <h5 className="font-bold text-gray-900 dark:text-gray-100 mb-2">🔐 Security</h5>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            EIP-712 signed mint permit system. Replay attack protection and nonce tracking.
          </p>
        </div>
        
        <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-800">
          <h5 className="font-bold text-gray-900 dark:text-gray-100 mb-2">🎨 AI Generation</h5>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Custom design based on your profile via Daydreams AI Router. Decentralized storage on IPFS.
          </p>
        </div>
        
        <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-800">
          <h5 className="font-bold text-gray-900 dark:text-gray-100 mb-2">💎 Exclusive Benefits</h5>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            87% discount on Deep Research analysis (1.50 → 0.20 USDC) and access to premium features.
          </p>
        </div>
      </div>

      <div className="bg-yellow-50 dark:bg-yellow-950/20 border-l-4 border-yellow-600 p-6 rounded-r-lg">
        <h4 className="text-lg font-bold text-yellow-900 dark:text-yellow-100 mb-2">🔗 Smart Contract</h4>
        <p className="text-gray-700 dark:text-gray-300 mb-2">
          Our contract uses OpenZeppelin libraries and is fully open source:
        </p>
        <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <li>• ERC721URIStorage - Metadata management</li>
          <li>• Ownable - Access control</li>
          <li>• EIP712 - Signature verification</li>
          <li>• ReentrancyGuard - Security</li>
        </ul>
      </div>
    </div>
  );
}

function X402Section() {
  return (
    <div className="prose prose-lg dark:prose-invert max-w-none">
      <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        💳 x402 Payment Protocol
      </h2>

      <p className="text-gray-600 dark:text-gray-400 text-lg leading-relaxed mb-6">
        x402 is a modern payment protocol that integrates blockchain payments with API calls using the HTTP 402 
        (Payment Required) status code. We process USDC payments using the Coinbase Commerce Developer Platform (CDP) 
        infrastructure.
      </p>

      <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        🏗️ Architecture
      </h3>

      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 p-6 rounded-xl border border-blue-200 dark:border-blue-800 mb-6">
        <pre className="text-sm text-gray-700 dark:text-gray-300 overflow-x-auto">
{`┌─────────────────────────────────────────────┐
│           Frontend (Next.js)                │
│  • x402-client.ts (Payment commitment)      │
│  • EIP-712 signature generation             │
└─────────────────┬───────────────────────────┘
                  │ HTTP + x402-Payment Header
                  ▼
┌─────────────────────────────────────────────┐
│      Backend API (/api/mint-permit-v2)      │
│  • Payment verification                     │
│  • CDP Facilitator settlement               │
│  • USDC transfer confirmation               │
└─────────────────┬───────────────────────────┘
                  │ Settlement Request
                  ▼
┌─────────────────────────────────────────────┐
│       Coinbase CDP Facilitator              │
│  • USDC transfer execution                  │
│  • On-chain transaction                     │
│  • Base Network (Chain ID: 8453)            │
└─────────────────────────────────────────────┘`}
        </pre>
      </div>

      <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        🔄 Payment Flow
      </h3>

      <div className="space-y-4 mb-6">
        <div className="flex gap-4">
          <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
            1
          </div>
          <div>
            <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-1">GET Request - Payment Required</h4>
            <p className="text-gray-600 dark:text-gray-400">
              Frontend sends request to protected endpoint. Backend returns <code>402 Payment Required</code> with 
              payment options.
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
            2
          </div>
          <div>
            <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-1">EIP-712 Signing</h4>
            <p className="text-gray-600 dark:text-gray-400">
              User signs payment commitment with their wallet. USDC amount and recipient address included in signature.
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
            3
          </div>
          <div>
            <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-1">POST Request + x402-Payment Header</h4>
            <p className="text-gray-600 dark:text-gray-400">
              Signed commitment sent in <code>x402-payment</code> header. Backend verifies signature and payment details.
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
            4
          </div>
          <div>
            <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-1">CDP Settlement</h4>
            <p className="text-gray-600 dark:text-gray-400">
              Backend calls CDP Facilitator API to execute USDC transfer. On-chain transaction completed on Base network.
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
            5
          </div>
          <div>
            <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-1">Success Response</h4>
            <p className="text-gray-600 dark:text-gray-400">
              After successful payment, API returns the requested content (mint permit, analysis result, etc.).
            </p>
          </div>
        </div>
      </div>

      <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        💰 Use Cases
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-900 p-5 rounded-lg border border-gray-200 dark:border-gray-800">
          <div className="text-3xl mb-3">🎨</div>
          <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-2">NFT Minting</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">5 USDC</p>
          <p className="text-xs text-gray-500 dark:text-gray-500">
            AI-generated unique NFT creation and minting on Base network
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 p-5 rounded-lg border border-gray-200 dark:border-gray-800">
          <div className="text-3xl mb-3">🔬</div>
          <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-2">Deep Research</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">0.20 - 1.50 USDC</p>
          <p className="text-xs text-gray-500 dark:text-gray-500">
            Solana token analysis (87% discount for NFT holders)
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 p-5 rounded-lg border border-gray-200 dark:border-gray-800">
          <div className="text-3xl mb-3">💬</div>
          <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-2">AI Chat Credits</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">0.01 - 2 USDC</p>
          <p className="text-xs text-gray-500 dark:text-gray-500">
            Purchase tokens to use AI chat assistant
          </p>
        </div>
      </div>

      <div className="bg-green-50 dark:bg-green-950/20 border-l-4 border-green-600 p-6 rounded-r-lg">
        <h4 className="text-lg font-bold text-green-900 dark:text-green-100 mb-2">✅ x402 Advantages</h4>
        <ul className="space-y-2 text-gray-700 dark:text-gray-300">
          <li className="flex items-start gap-2">
            <span className="text-green-600 mt-1">✓</span>
            <span><strong>Standard HTTP:</strong> No special wallet library required</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-600 mt-1">✓</span>
            <span><strong>Low Cost:</strong> Minimal gas fees on Base L2</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-600 mt-1">✓</span>
            <span><strong>Fast Settlement:</strong> Instant transfer via CDP Facilitator</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-600 mt-1">✓</span>
            <span><strong>Secure:</strong> EIP-712 signed commitment, replay attack protection</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

function DeepResearchSection() {
  return (
    <div className="prose prose-lg dark:prose-invert max-w-none">
      <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        🔬 Deep Research - AI-Powered Token Analysis
      </h2>

      <p className="text-gray-600 dark:text-gray-400 text-lg leading-relaxed mb-6">
        Deep Research generates comprehensive AI-powered analysis reports for tokens in the Solana ecosystem. 
        By processing on-chain data, it provides critical information such as whale movements, liquidity status, 
        security scores, and manipulation detection.
      </p>

      <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        📊 Analysis Components
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 p-6 rounded-xl border border-blue-200 dark:border-blue-800">
          <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
            <span>🐋</span> Whale Tracking
          </h4>
          <ul className="space-y-2 text-gray-700 dark:text-gray-300 text-sm">
            <li>• Large wallet movement tracking</li>
            <li>• Accumulation and selling patterns</li>
            <li>• Whale position changes</li>
            <li>• Smart money flow analysis</li>
          </ul>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 p-6 rounded-xl border border-purple-200 dark:border-purple-800">
          <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
            <span>🔒</span> Security Score
          </h4>
          <ul className="space-y-2 text-gray-700 dark:text-gray-300 text-sm">
            <li>• Diamond hands percentage</li>
            <li>• Re-entry rate analysis</li>
            <li>• Early buyer holding rate</li>
            <li>• Liquidity health check</li>
          </ul>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 p-6 rounded-xl border border-green-200 dark:border-green-800">
          <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
            <span>💧</span> Liquidity Analysis
          </h4>
          <ul className="space-y-2 text-gray-700 dark:text-gray-300 text-sm">
            <li>• Pool health metrics</li>
            <li>• TVL and market cap ratios</li>
            <li>• Liquidity depth analysis</li>
            <li>• Volume/liquidity ratio</li>
          </ul>
        </div>

        <div className="bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/30 p-6 rounded-xl border border-red-200 dark:border-red-800">
          <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
            <span>🚨</span> Manipulation Detection
          </h4>
          <ul className="space-y-2 text-gray-700 dark:text-gray-300 text-sm">
            <li>• Wash trading detection</li>
            <li>• Bot activity analysis</li>
            <li>• Suspicious transaction patterns</li>
            <li>• Pump & dump signals</li>
          </ul>
        </div>
      </div>

      <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        🏗️ Technical Infrastructure
      </h3>

      <div className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-xl border border-gray-200 dark:border-gray-800 mb-6">
        <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Data Sources</h4>
        
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-lg">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h5 className="font-bold text-gray-900 dark:text-gray-100">Birdeye API</h5>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                10,000+ swap transaction data. Real-time price and trading volume information.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="bg-purple-100 dark:bg-purple-900/50 p-2 rounded-lg">
              <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <h5 className="font-bold text-gray-900 dark:text-gray-100">Claude AI (Anthropic)</h5>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Deep analysis via Daydreams integration. Pattern recognition and insight generation.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="bg-green-100 dark:bg-green-900/50 p-2 rounded-lg">
              <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
            </div>
            <div>
              <h5 className="font-bold text-gray-900 dark:text-gray-100">Supabase + Redis</h5>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Analysis result storage and asynchronous processing with BullMQ queue.
              </p>
            </div>
          </div>
        </div>
      </div>

      <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        💎 Exclusive Pricing for NFT Holders
      </h3>

      <div className="bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/20 dark:to-amber-950/20 p-6 rounded-xl border border-yellow-200 dark:border-yellow-800 mb-6">
        <div className="flex items-start gap-4">
          <div className="text-4xl">🎁</div>
          <div className="flex-1">
            <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">Special Discount Benefit</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-900 p-5 rounded-lg border-2 border-green-500">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-gray-900 dark:text-gray-100">NFT Holders</span>
                  <span className="text-2xl font-bold text-green-600">$0.20</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">87% discount!</p>
                <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Automatically detected</span>
                </div>
              </div>
              
              <div className="bg-white dark:bg-gray-900 p-5 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-gray-900 dark:text-gray-100">Standard Users</span>
                  <span className="text-2xl font-bold text-gray-600">$1.50</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Regular price</p>
              </div>
            </div>

            <div className="mt-4 bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                <strong>💡 Note:</strong> NFT ownership is automatically verified via smart contract. 
                If you have an xFrora NFT in your wallet, the 87% discount is automatically applied (1.50 → 0.20 USDC).
              </p>
            </div>
          </div>
        </div>
      </div>

      <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        📈 Analysis Process
      </h3>

      <div className="space-y-3 mb-6">
        <div className="flex items-center gap-4 bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-800">
          <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">1</div>
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">Enter token mint address</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Any token on the Solana blockchain</p>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-800">
          <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">2</div>
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">NFT verification and pricing</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Discount automatically applied</p>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-800">
          <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">3</div>
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">Make payment via x402</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Fast and secure payment with USDC</p>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-800">
          <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">4</div>
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">Analysis starting</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Analyzing 10,000+ swap transactions (30-60 seconds)</p>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-800">
          <div className="flex-shrink-0 w-10 h-10 bg-green-600 text-white rounded-full flex items-center justify-center font-bold">5</div>
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">Detailed report ready!</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">AI-powered insights and recommendations</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TechStackSection() {
  return (
    <div className="prose prose-lg dark:prose-invert max-w-none">
      <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        ⚙️ Technology Stack
      </h2>

      <p className="text-gray-600 dark:text-gray-400 text-lg leading-relaxed mb-8">
        xFrora combines modern web3 technologies and AI tools to provide a powerful, 
        scalable, and user-friendly platform.
      </p>

      <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        🎨 Frontend Stack
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <TechCard
          icon="⚛️"
          title="Next.js 14"
          description="App Router, Server Components, and API Routes"
          bgColor="from-black to-gray-800"
        />
        <TechCard
          icon="🎨"
          title="Tailwind CSS"
          description="Utility-first CSS framework, responsive design"
          bgColor="from-cyan-500 to-blue-500"
        />
        <TechCard
          icon="🌈"
          title="RainbowKit"
          description="Modern wallet connection and management"
          bgColor="from-purple-500 to-pink-500"
        />
        <TechCard
          icon="📜"
          title="TypeScript"
          description="Type-safe code development"
          bgColor="from-blue-600 to-blue-800"
        />
        <TechCard
          icon="🔗"
          title="wagmi + viem"
          description="Ethereum interaction and React hooks"
          bgColor="from-green-600 to-emerald-600"
        />
        <TechCard
          icon="✨"
          title="Framer Motion"
          description="Smooth animations and transitions"
          bgColor="from-pink-500 to-rose-500"
        />
      </div>

      <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        🔧 Backend & Infrastructure
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <TechCard
          icon="🚀"
          title="Next.js API Routes"
          description="Serverless API endpoints"
          bgColor="from-gray-800 to-gray-900"
        />
        <TechCard
          icon="🐘"
          title="Supabase"
          description="PostgreSQL database and authentication"
          bgColor="from-green-500 to-emerald-600"
        />
        <TechCard
          icon="📮"
          title="Redis + BullMQ"
          description="Job queue and asynchronous processing"
          bgColor="from-red-500 to-red-700"
        />
        <TechCard
          icon="☁️"
          title="Vercel"
          description="Edge deployment and hosting"
          bgColor="from-black to-gray-700"
        />
        <TechCard
          icon="🔐"
          title="OAuth 2.0"
          description="X (Twitter) authentication"
          bgColor="from-blue-400 to-blue-600"
        />
        <TechCard
          icon="🌐"
          title="IPFS"
          description="Decentralized NFT metadata storage"
          bgColor="from-teal-500 to-cyan-600"
        />
      </div>

      <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        ⛓️ Blockchain & Smart Contracts
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <TechCard
          icon="🔵"
          title="Base Network"
          description="Ethereum L2 (OP Stack)"
          bgColor="from-blue-600 to-indigo-600"
        />
        <TechCard
          icon="🦊"
          title="ethers.js"
          description="Ethereum library and utilities"
          bgColor="from-orange-500 to-yellow-500"
        />
        <TechCard
          icon="🛡️"
          title="OpenZeppelin"
          description="Secure smart contract libraries"
          bgColor="from-blue-700 to-blue-900"
        />
        <TechCard
          icon="⚒️"
          title="Foundry"
          description="Smart contract development and testing"
          bgColor="from-gray-700 to-gray-900"
        />
        <TechCard
          icon="🟣"
          title="Solana Web3.js"
          description="Solana blockchain integration"
          bgColor="from-purple-500 to-purple-700"
        />
        <TechCard
          icon="💎"
          title="EIP-712"
          description="Typed structured data signing"
          bgColor="from-indigo-600 to-purple-600"
        />
      </div>

      <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        🤖 AI & Analytics
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <TechCard
          icon="🧠"
          title="Claude AI"
          description="Anthropic - Daydreams integration"
          bgColor="from-orange-400 to-red-500"
        />
        <TechCard
          icon="🖼️"
          title="Daydreams AI"
          description="AI image generation via Daydreams Router API"
          bgColor="from-green-400 to-cyan-500"
        />
        <TechCard
          icon="📊"
          title="Birdeye API"
          description="Solana DEX data and analytics"
          bgColor="from-yellow-400 to-orange-500"
        />
        <TechCard
          icon="🔍"
          title="DexScreener"
          description="Multi-chain DEX analytics"
          bgColor="from-purple-400 to-pink-500"
        />
        <TechCard
          icon="📈"
          title="The Graph"
          description="Blockchain data indexing"
          bgColor="from-purple-600 to-blue-600"
        />
        <TechCard
          icon="🤖"
          title="GPT-4o & GPT-4o-mini"
          description="OpenAI models for AI chat assistant"
          bgColor="from-green-500 to-teal-500"
        />
      </div>

      <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-8 mb-4">
        💳 Payment & x402
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <TechCard
          icon="🏦"
          title="Coinbase CDP"
          description="Commerce Developer Platform - USDC facilitator"
          bgColor="from-blue-600 to-blue-800"
        />
        <TechCard
          icon="💵"
          title="USDC on Base"
          description="Stablecoin payments (Circle)"
          bgColor="from-green-500 to-green-700"
        />
        <TechCard
          icon="🔄"
          title="x402 Protocol"
          description="HTTP 402 Payment Required standard"
          bgColor="from-purple-600 to-indigo-700"
        />
        <TechCard
          icon="📝"
          title="EIP-712 Signing"
          description="Structured data signing for payments"
          bgColor="from-orange-500 to-red-600"
        />
      </div>

      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 p-8 rounded-2xl border border-blue-200 dark:border-blue-800 mt-12">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
          <span className="text-3xl">🏗️</span>
          Monorepo Architecture
        </h3>
        <p className="text-gray-700 dark:text-gray-300 mb-4">
          Workspace-based modular structure for organized project management:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-900 p-4 rounded-lg">
            <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-2">📱 apps/web</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Next.js frontend application, API routes, and UI components
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 p-4 rounded-lg">
            <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-2">📦 packages/contracts</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Solidity smart contracts and deployment scripts
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 p-4 rounded-lg">
            <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-2">🔧 packages/shared</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Shared types, utilities, and configurations
            </p>
          </div>
        </div>
      </div>

      <div className="bg-yellow-50 dark:bg-yellow-950/20 border-l-4 border-yellow-600 p-6 rounded-r-lg mt-8">
        <h4 className="text-lg font-bold text-yellow-900 dark:text-yellow-100 mb-2">📚 Open Source Libraries</h4>
        <p className="text-gray-700 dark:text-gray-300 mb-3">
          xFrora leverages the power of the open source community:
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="bg-white dark:bg-gray-900 px-3 py-2 rounded font-mono text-gray-700 dark:text-gray-300">
            react ^18.2.0
          </div>
          <div className="bg-white dark:bg-gray-900 px-3 py-2 rounded font-mono text-gray-700 dark:text-gray-300">
            wagmi ^2.9.0
          </div>
          <div className="bg-white dark:bg-gray-900 px-3 py-2 rounded font-mono text-gray-700 dark:text-gray-300">
            viem ^2.13.0
          </div>
          <div className="bg-white dark:bg-gray-900 px-3 py-2 rounded font-mono text-gray-700 dark:text-gray-300">
            ethers ^6.13.0
          </div>
          <div className="bg-white dark:bg-gray-900 px-3 py-2 rounded font-mono text-gray-700 dark:text-gray-300">
            @supabase/supabase-js
          </div>
          <div className="bg-white dark:bg-gray-900 px-3 py-2 rounded font-mono text-gray-700 dark:text-gray-300">
            bullmq ^5.0.0
          </div>
          <div className="bg-white dark:bg-gray-900 px-3 py-2 rounded font-mono text-gray-700 dark:text-gray-300">
            ioredis ^5.4.0
          </div>
          <div className="bg-white dark:bg-gray-900 px-3 py-2 rounded font-mono text-gray-700 dark:text-gray-300">
            framer-motion
          </div>
        </div>
      </div>
    </div>
  );
}

function TechCard({ icon, title, description, bgColor }: { icon: string; title: string; description: string; bgColor: string }) {
  return (
    <div className="group bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800 hover:shadow-lg transition-all duration-300">
      <div className={`inline-flex p-3 rounded-lg bg-gradient-to-br ${bgColor} mb-3`}>
        <span className="text-2xl">{icon}</span>
      </div>
      <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-1.5">{title}</h4>
      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{description}</p>
    </div>
  );
}
