"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { isMessagingEnabled, checkMessagingPermissions } from "@/lib/feature-flags";
import { env } from "@/env.mjs";

export default function DebugMessagingPage() {
  const { address, isConnected } = useAccount();
  const [debugInfo, setDebugInfo] = useState<any>({});

  useEffect(() => {
    const info = {
      // Environment variables
      NODE_ENV: process.env.NODE_ENV,
      DEVELOPER_WALLET_ADDRESS: env.DEVELOPER_WALLET_ADDRESS,
      ENABLE_MESSAGING_FEATURE: env.ENABLE_MESSAGING_FEATURE,
      
      // Wallet info
      connectedWallet: address,
      isConnected,
      
      // Feature flag results
      isMessagingEnabled: isMessagingEnabled(address),
      permissions: checkMessagingPermissions(address),
      
      // Address comparison
      addressMatch: address?.toLowerCase() === env.DEVELOPER_WALLET_ADDRESS?.toLowerCase(),
      
      // Raw comparison
      walletLower: address?.toLowerCase(),
      devWalletLower: env.DEVELOPER_WALLET_ADDRESS?.toLowerCase(),
    };
    
    setDebugInfo(info);
    console.log("🔍 Debug Info:", info);
  }, [address]);

  return (
    <div className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-black dark:text-white">
          Messaging Debug Page
        </h1>
        
        <div className="mb-6">
          <ConnectButton />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Environment Variables */}
          <div className="p-6 border border-gray-200 dark:border-gray-800">
            <h2 className="text-xl font-bold mb-4 text-black dark:text-white">
              Environment Variables
            </h2>
            <div className="space-y-2 text-sm">
              <div>
                <strong>NODE_ENV:</strong> {debugInfo.NODE_ENV || "undefined"}
              </div>
              <div>
                <strong>DEVELOPER_WALLET_ADDRESS:</strong> 
                <br />
                <code className="bg-gray-100 dark:bg-gray-800 p-1 rounded text-xs">
                  {debugInfo.DEVELOPER_WALLET_ADDRESS || "undefined"}
                </code>
              </div>
              <div>
                <strong>ENABLE_MESSAGING_FEATURE:</strong> {debugInfo.ENABLE_MESSAGING_FEATURE || "undefined"}
              </div>
            </div>
          </div>

          {/* Wallet Info */}
          <div className="p-6 border border-gray-200 dark:border-gray-800">
            <h2 className="text-xl font-bold mb-4 text-black dark:text-white">
              Wallet Info
            </h2>
            <div className="space-y-2 text-sm">
              <div>
                <strong>Connected:</strong> {debugInfo.isConnected ? "✅ Yes" : "❌ No"}
              </div>
              <div>
                <strong>Address:</strong>
                <br />
                <code className="bg-gray-100 dark:bg-gray-800 p-1 rounded text-xs">
                  {debugInfo.connectedWallet || "Not connected"}
                </code>
              </div>
            </div>
          </div>

          {/* Feature Flag Results */}
          <div className="p-6 border border-gray-200 dark:border-gray-800">
            <h2 className="text-xl font-bold mb-4 text-black dark:text-white">
              Feature Flag Results
            </h2>
            <div className="space-y-2 text-sm">
              <div>
                <strong>isMessagingEnabled:</strong> {debugInfo.isMessagingEnabled ? "✅ True" : "❌ False"}
              </div>
              <div>
                <strong>Has Access:</strong> {debugInfo.permissions?.hasAccess ? "✅ Yes" : "❌ No"}
              </div>
              <div>
                <strong>Reason:</strong> {debugInfo.permissions?.reason || "N/A"}
              </div>
            </div>
          </div>

          {/* Address Comparison */}
          <div className="p-6 border border-gray-200 dark:border-gray-800">
            <h2 className="text-xl font-bold mb-4 text-black dark:text-white">
              Address Comparison
            </h2>
            <div className="space-y-2 text-sm">
              <div>
                <strong>Addresses Match:</strong> {debugInfo.addressMatch ? "✅ Yes" : "❌ No"}
              </div>
              <div>
                <strong>Wallet (lowercase):</strong>
                <br />
                <code className="bg-gray-100 dark:bg-gray-800 p-1 rounded text-xs">
                  {debugInfo.walletLower || "N/A"}
                </code>
              </div>
              <div>
                <strong>Dev Wallet (lowercase):</strong>
                <br />
                <code className="bg-gray-100 dark:bg-gray-800 p-1 rounded text-xs">
                  {debugInfo.devWalletLower || "N/A"}
                </code>
              </div>
            </div>
          </div>
        </div>

        {/* Test Button */}
        <div className="mt-8 p-6 border border-gray-200 dark:border-gray-800">
          <h2 className="text-xl font-bold mb-4 text-black dark:text-white">
            Manual Test
          </h2>
          <button
            onClick={() => {
              const result = isMessagingEnabled(address);
              alert(`isMessagingEnabled result: ${result}`);
            }}
            className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white font-semibold hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors"
          >
            Test isMessagingEnabled()
          </button>
        </div>

        {/* Raw JSON */}
        <div className="mt-8 p-6 border border-gray-200 dark:border-gray-800">
          <h2 className="text-xl font-bold mb-4 text-black dark:text-white">
            Raw Debug Data
          </h2>
          <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded text-xs overflow-auto">
            {JSON.stringify(debugInfo, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
