"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ethers } from "ethers";
import type { GenerateResponse, MintPermitResponse } from "@/lib/types";

function HomePageContent() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<"connect" | "generate" | "pay" | "mint">("connect");
  const [xUser, setXUser] = useState<{ x_user_id: string; username: string; profile_image_url: string; bio?: string } | null>(null);
  const [generated, setGenerated] = useState<GenerateResponse | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Handle OAuth callback
  useEffect(() => {
    const xUserId = searchParams?.get("x_user_id");
    const username = searchParams?.get("username");
    const profileImageUrl = searchParams?.get("profile_image_url");
    const bio = searchParams?.get("bio");
    const errorParam = searchParams?.get("error");

    if (errorParam) {
      setError(decodeURIComponent(errorParam));
    } else if (xUserId && username) {
      setXUser({
        x_user_id: xUserId,
        username,
        profile_image_url: profileImageUrl || "",
        bio: bio || undefined,
      });
      // X connected - move to generate step (wallet not needed yet)
      setStep("generate");
    }
  }, [searchParams]);

  // Check for existing X session and wallet connection on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        // Check for existing X session
        const sessionResponse = await fetch("/api/auth/x/session");
        const sessionData = await sessionResponse.json();
        
        if (sessionData.authenticated && sessionData.user) {
          setXUser(sessionData.user);
          console.log("✅ Restored X session:", sessionData.user.username);
          // X connected - move to generate step (wallet not needed yet)
          setStep("generate");
        }
      } catch (error) {
        console.log("No X session found");
      }
    };

    const checkWalletConnection = async () => {
      if (typeof window.ethereum !== "undefined") {
        try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
          const address = await accounts[0].getAddress();
          setWallet(address);
          // Wallet connected - step will be set by X connection logic
        }
        } catch (error) {
          // Wallet not connected, that's fine
          console.log("No wallet connected");
        }
      }
    };

    checkSession();
    checkWalletConnection();
  }, []);

  const checkXOAuthConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch("/api/auth/x/debug");
      const data = await response.json();
      
      let message = `${data.status}\n\n`;
      message += `Konfigürasyon:\n`;
      message += `- Client ID: ${data.config.hasClientId ? "✅" : "❌"}\n`;
      message += `- Client Secret: ${data.config.hasClientSecret ? "✅" : "❌"}\n`;
      message += `- Callback URL: ${data.config.hasCallbackUrl ? "✅" : "❌"}\n`;
      message += `- Callback URL: ${data.config.callbackUrl}\n`;
      message += `- Callback Path: ${data.config.callbackPath}\n`;
      
      if (data.issues && data.issues.length > 0) {
        message += `\nSorunlar:\n${data.issues.join("\n")}\n`;
      }
      
      message += `\nÖneriler:\n${data.recommendations.join("\n")}`;
      
      setError(message);
    } catch (err) {
      setError("Debug bilgisi alınamadı: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const connectX = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get OAuth URL from backend (more secure - client ID not exposed)
      const response = await fetch("/api/auth/x/authorize");
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to initiate X OAuth" }));
        
        // Show detailed error message
        const errorMessage = errorData.error || "X OAuth not configured";
        const errorDetails = errorData.details || {};
        
        let fullError = errorMessage;
        if (errorData.details) {
          fullError += "\n\nKonfigürasyon durumu:\n";
          if (errorData.details.hasClientId !== undefined) {
            fullError += `- Client ID: ${errorData.details.hasClientId ? "✅" : "❌"}\n`;
          }
          if (errorData.details.hasClientSecret !== undefined) {
            fullError += `- Client Secret: ${errorData.details.hasClientSecret ? "✅" : "❌"}\n`;
          }
          if (errorData.details.hasCallbackUrl !== undefined) {
            fullError += `- Callback URL: ${errorData.details.hasCallbackUrl ? "✅" : "❌"}\n`;
          }
          if (errorData.details.callbackUrl) {
            fullError += `- Callback URL değeri: ${errorData.details.callbackUrl}\n`;
          }
          fullError += `\n💡 İpucu: "Check Config" butonuna tıklayarak detaylı kontrol yapabilirsin.`;
        }
        
        throw new Error(fullError);
      }
      
      const data = await response.json();
      const { authUrl, state } = data;
      
      if (!authUrl) {
        throw new Error("OAuth URL alınamadı");
      }
      
      // Validate OAuth URL before redirect
      try {
        const url = new URL(authUrl);
        if (url.hostname !== "twitter.com" && url.hostname !== "x.com") {
          throw new Error(`Invalid OAuth URL hostname: ${url.hostname}`);
        }
        console.log("🔗 Valid OAuth URL:", {
          hostname: url.hostname,
          pathname: url.pathname,
          hasState: !!state,
          paramsCount: url.searchParams.toString().split("&").length,
        });
      } catch (urlError) {
        console.error("❌ Invalid OAuth URL:", urlError);
        throw new Error(`Invalid OAuth URL: ${authUrl.substring(0, 50)}...`);
      }
      
      // PKCE verifier is stored server-side (keyed by state)
      // No need to store in client
      console.log("🔗 Redirecting to X OAuth:", authUrl.substring(0, 100) + "...");
      
      // Use window.location.replace to prevent back button issues
      window.location.replace(authUrl);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to connect X";
      console.error("❌ X OAuth connection error:", errorMessage);
      setError(errorMessage);
      setLoading(false);
    }
  };

  const connectWallet = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (typeof window.ethereum !== "undefined") {
        // Request account access
        await window.ethereum.request({ method: "eth_requestAccounts" });
        
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        
        setWallet(address);
        
        // Clear any previous errors
        setError(null);
      } else {
        setError("Please install MetaMask or another Web3 wallet");
      }
    } catch (err) {
      console.error("Wallet connection error:", err);
      if (err instanceof Error) {
        if (err.message.includes("User rejected")) {
          setError("Wallet connection was cancelled");
        } else {
          setError(err.message);
        }
      } else {
        setError("Failed to connect wallet");
      }
    } finally {
      setLoading(false);
    }
  };

  const generateNFT = async () => {
    if (!xUser) {
      setError("X account not connected");
      return;
    }
    
    // Save userId for mint step
    setCurrentUserId(xUser.x_user_id);
    
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          x_user_id: xUser.x_user_id,
          profile_image_url: xUser.profile_image_url,
          username: xUser.username,
          bio: xUser.bio,
        }),
      });
      
      if (!response.ok) {
        // Handle 402 Payment Required error specifically
        if (response.status === 402) {
          try {
            const paymentData = await response.json();
            const errorMessage = paymentData.message || paymentData.error || "Payment required for image generation";
            
            // Show payment required message to user
            setError(`${errorMessage}\n\nImage generation requires payment via x402 protocol. Please ensure your wallet has sufficient balance or contact support.`);
            
            // TODO: Implement x402 payment flow here
            // For now, we'll just show the error message
            console.log("Payment required:", paymentData);
            return;
          } catch {
            setError("Payment required for image generation. Please ensure your wallet has sufficient balance.");
            return;
          }
        }
        
        // Handle other errors
        let errorMessage = "Generation failed";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If response is not JSON (e.g., HTML error page)
          const text = await response.text();
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
          console.error("Non-JSON response:", text.substring(0, 200));
        }
        throw new Error(errorMessage);
      }
      
      const data: GenerateResponse = await response.json();
      setGenerated(data);
      // Image generated - now move to wallet connection (pay step)
      setStep("pay");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  const requestMintPermit = async () => {
    if (!wallet) return;
    
    // Get x_user_id from saved state
    const userId = currentUserId;
    
    if (!userId) {
      setError("User ID not found. Please generate NFT first.");
      return;
    }
    
    try {
      setLoading(true);
      
      // First request - should return 402
      const response = await fetch("/api/mint-permit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet,
          x_user_id: userId,
        }),
      });
      
      console.log("Mint permit response status:", response.status);
      
      if (response.status === 200) {
        // Direct permit (mock mode - no x402 payment)
        const permitData: MintPermitResponse = await response.json();
        console.log("Permit data received:", permitData);
        await mintNFT(permitData);
      } else if (response.status === 402) {
        const paymentRequest = await response.json();
        console.log("402 Payment request:", paymentRequest);
        
        // Handle x402 payment (simplified - use x402 SDK in production)
        // For now, show payment instructions
        alert(`Please pay ${paymentRequest.accepts[0].amount} ${paymentRequest.accepts[0].asset} to ${paymentRequest.accepts[0].recipient}`);
        
        // After payment, retry with X-PAYMENT header
        // TODO: Implement actual x402 payment flow
        const paymentHeader = JSON.stringify({
          paymentId: "mock-payment-id",
          amount: paymentRequest.accepts[0].amount,
          asset: paymentRequest.accepts[0].asset,
          network: paymentRequest.accepts[0].network,
          payer: wallet,
          recipient: paymentRequest.accepts[0].recipient,
        });
        
        console.log("Sending mock payment:", paymentHeader);
        
        const mintResponse = await fetch("/api/mint-permit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-PAYMENT": paymentHeader,
          },
          body: JSON.stringify({
            wallet,
            x_user_id: userId,
          }),
        });
        
        console.log("Second mint response status:", mintResponse.status);
        
        if (!mintResponse.ok) {
          const errorData = await mintResponse.json();
          console.error("Mint permit failed:", errorData);
          throw new Error(`Mint permit failed: ${errorData.error || 'Unknown error'}`);
        }
        
        const permitData: MintPermitResponse = await mintResponse.json();
        console.log("Permit data received:", permitData);
        await mintNFT(permitData);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error("Unexpected response:", response.status, errorData);
        throw new Error(`Unexpected response status: ${response.status} - ${errorData.error || 'Unknown error'}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mint permit failed");
    } finally {
      setLoading(false);
    }
  };

  const mintNFT = async (permit: MintPermitResponse) => {
    if (!wallet || typeof window.ethereum === "undefined") return;
    
    try {
      setLoading(true);
      
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      // Contract ABI (simplified)
      const contractABI = [
        "function mintWithSig((address to, address payer, uint256 xUserId, string tokenURI, uint256 nonce, uint256 deadline) auth, bytes signature) external",
      ];
      
      const contract = new ethers.Contract(
        process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "",
        contractABI,
        signer
      );
      
      const tx = await contract.mintWithSig(permit.auth, permit.signature);
      await tx.wait();
      
      setStep("mint");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Minting failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white">
      <div className="container mx-auto px-4 py-16">
        <h1 className="text-5xl font-bold text-center mb-8">Aura Creatures</h1>
        <p className="text-xl text-center mb-12 text-gray-300">
          Connect your X profile, generate your unique AI creature, and mint on Base
        </p>
        
        <div className="max-w-2xl mx-auto">
          {error && (
            <div className="bg-red-500 text-white p-4 rounded-lg mb-6">
              {error}
            </div>
          )}
          
          {step === "connect" && (
            <div className="bg-white/10 backdrop-blur-lg rounded-lg p-8 text-center">
              <h2 className="text-2xl font-bold mb-4">Step 1: Connect X</h2>
              <p className="mb-6 text-gray-300">Connect your X account to generate your unique AI creature</p>
              
              {/* Status indicator */}
              {xUser && (
                <div className="mb-6 bg-green-500/20 border border-green-500/50 rounded-lg p-3 text-sm">
                  ✅ X Account: @{xUser.username}
                </div>
              )}
              
              <div className="space-y-4">
                <button
                  onClick={connectX}
                  disabled={loading || !!xUser}
                  className={`${
                    xUser 
                      ? "bg-gray-600 cursor-not-allowed" 
                      : "bg-blue-500 hover:bg-blue-600"
                  } text-white font-bold py-3 px-6 rounded-lg w-full`}
                >
                  {xUser ? "✅ X Account Connected" : "Connect X Account"}
                </button>
                <button
                  onClick={checkXOAuthConfig}
                  disabled={loading}
                  className="bg-gray-600 hover:bg-gray-700 disabled:bg-gray-800 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg w-full"
                  title="Check X OAuth Configuration"
                >
                  🔍 Check Config
                </button>
              </div>
            </div>
          )}
          
          {step === "generate" && (
            <div className="bg-white/10 backdrop-blur-lg rounded-lg p-8">
              <h2 className="text-2xl font-bold mb-4 text-center">Step 2: Generate</h2>
              
              {xUser && (
                <div className="mb-6 p-4 bg-green-500/20 border border-green-500/50 rounded-lg">
                  <p className="text-sm">
                    <strong>X Account:</strong> @{xUser.username}
                  </p>
                  <p className="text-sm text-gray-300 mt-1">
                    Profile Image: {xUser.profile_image_url}
                  </p>
                </div>
              )}
              
              <button
                onClick={generateNFT}
                disabled={loading || !xUser}
                className="bg-green-500 hover:bg-green-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg w-full"
              >
                {loading ? "Generating..." : "Generate NFT"}
              </button>
              
              {loading && (
                <div className="mt-4 text-center">
                  <p className="text-sm text-gray-300">
                    🤖 AI is generating your unique NFT based on the profile image...
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    This may take 10-30 seconds
                  </p>
                </div>
              )}
            </div>
          )}
          
          {step === "pay" && generated && (
            <div className="bg-white/10 backdrop-blur-lg rounded-lg p-8">
              <h2 className="text-2xl font-bold mb-4 text-center">Step 3: Connect Wallet & Mint</h2>
              
              {/* Show wallet connection button if not connected */}
              {!wallet && (
                <div className="mb-6 p-4 bg-purple-500/20 border border-purple-500/50 rounded-lg">
                  <p className="text-sm mb-3">Connect your wallet to mint your NFT</p>
                  <button
                    onClick={connectWallet}
                    disabled={loading}
                    className="bg-purple-500 hover:bg-purple-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg w-full"
                  >
                    {loading ? "Connecting..." : "Connect Wallet"}
                  </button>
                </div>
              )}
              
              {wallet && (
                <div className="mb-6 bg-green-500/20 border border-green-500/50 rounded-lg p-3 text-sm">
                  ✅ Wallet Connected: {wallet.substring(0, 6)}...{wallet.substring(wallet.length - 4)}
                </div>
              )}
              
              <div className="mb-6">
                {/* Show preview image if available */}
                {generated.preview && (
                  <div className="mb-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={generated.preview} 
                      alt="Generated NFT" 
                      className="w-full rounded-lg border-2 border-white/20" 
                    />
                  </div>
                )}
                
                {/* Fallback to IPFS URL if preview not available */}
                {!generated.preview && generated.imageUrl && (
                  <div className="mb-4">
                    {generated.imageUrl.startsWith("ipfs://mock_") ? (
                      <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-8 text-center">
                        <p className="text-yellow-300 mb-2">⚠️ Mock Mode - Image Not Pinned to IPFS</p>
                        <p className="text-sm text-gray-300">
                          In test mode, images are not actually uploaded to IPFS.
                          <br />
                          <strong>Image URL:</strong> {generated.imageUrl}
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                          src={generated.imageUrl.replace("ipfs://", "https://ipfs.io/ipfs/")} 
                          alt="Generated NFT" 
                          className="w-full rounded-lg border-2 border-white/20" 
                        />
                      </>
                    )}
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                  {Object.entries(generated.traits).map(([key, value]) => (
                    <div key={key} className="bg-white/5 p-3 rounded">
                      <div className="font-semibold capitalize">{key}</div>
                      <div className="text-gray-300">{value}</div>
                    </div>
                  ))}
                </div>
                
                <div className="p-3 bg-blue-500/20 border border-blue-500/50 rounded-lg text-xs">
                  <p><strong>Seed:</strong> {generated.seed}</p>
                  <p className="mt-1"><strong>Metadata:</strong> {generated.metadataUrl}</p>
                </div>
              </div>
              <button
                onClick={requestMintPermit}
                disabled={loading || !wallet}
                className="bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg w-full"
              >
                {loading ? "Processing..." : !wallet ? "Connect Wallet to Mint" : "Mint NFT"}
              </button>
            </div>
          )}
          
          {step === "mint" && (
            <div className="bg-white/10 backdrop-blur-lg rounded-lg p-8 text-center">
              <h2 className="text-2xl font-bold mb-4">Success!</h2>
              <p className="text-lg text-gray-300">Your NFT has been minted successfully!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    }>
      <HomePageContent />
    </Suspense>
  );
}

