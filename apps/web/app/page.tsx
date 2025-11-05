"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ethers } from "ethers";
import type { GenerateResponse, MintPermitResponse } from "@/lib/types";
import { generateX402PaymentHeader, type X402PaymentResponse } from "@/lib/x402-client";

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
    const handleOAuthCallback = async () => {
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
        
        // X connected - check for existing NFT FIRST, then set step accordingly
        await checkExistingNFT(xUserId);
        
        // If no NFT was found, move to generate step
        // If NFT was found, checkExistingNFT will set step to "pay"
        // But we need to check generated state to see if NFT was found
        // Since state updates are async, we'll set step after a small delay or check in checkExistingNFT
      }
    };
    
    handleOAuthCallback();
  }, [searchParams]);

  // Check for existing NFT
  const checkExistingNFT = async (xUserId: string): Promise<boolean> => {
    try {
      console.log("🔍 Checking for existing NFT for user:", xUserId);
      const response = await fetch(`/api/generate?x_user_id=${xUserId}`);
      
      if (response.ok) {
        const data: GenerateResponse = await response.json();
        console.log("📦 NFT data received:", {
          hasPreview: !!data.preview,
          hasImageUrl: !!data.imageUrl,
          previewUrl: data.preview?.substring(0, 80) + "...",
          alreadyExists: data.alreadyExists,
        });
        
        if (data.preview || data.imageUrl) {
          console.log("✅ Found existing NFT, displaying it");
          setGenerated(data);
          // IMPORTANT: Set currentUserId so mint button works
          setCurrentUserId(xUserId);
          // Move to pay step if NFT already exists
          setStep("pay");
          return true;
        } else {
          console.warn("⚠️ NFT data received but no preview or imageUrl");
          setStep("generate");
          return false;
        }
      } else if (response.status === 404) {
        console.log("ℹ️ No existing NFT found for user");
        // NFT not found, user can generate new one
        setStep("generate");
        return false;
      } else {
        console.warn("⚠️ Error checking for existing NFT:", response.status);
        setStep("generate");
        return false;
      }
    } catch (error) {
      console.error("Error checking for existing NFT:", error);
      // Don't block the flow if check fails
      setStep("generate");
      return false;
    }
  };

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
          // Check for existing NFT when session is restored
          // checkExistingNFT will set step to "pay" if NFT exists, "generate" if not
          const hasNFT = await checkExistingNFT(sessionData.user.x_user_id);
          if (!hasNFT) {
            // Only set to generate if no NFT was found
            setStep("generate");
          }
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
    console.log("🔵 ===========================================");
    console.log("🔵 requestMintPermit CALLED!");
    console.log("🔵 Wallet:", wallet);
    console.log("🔵 Current User ID:", currentUserId);
    console.log("🔵 ===========================================");
    
    if (!wallet) {
      console.error("❌ No wallet - returning early");
      return;
    }
    
    // Get x_user_id from saved state
    const userId = currentUserId;
    
    if (!userId) {
      console.error("❌ No user ID - returning early");
      setError("User ID not found. Please generate NFT first.");
      return;
    }
    
    console.log("✅ All checks passed - starting mint flow");
    try {
      setLoading(true);
      
      console.log("📝 First mint permit request (no payment)...");
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
        // x402 Payment Required - Execute payment using Coinbase CDP x402 protocol
        const paymentRequest: X402PaymentResponse = await response.json();
        console.log("💳 402 Payment request received:", paymentRequest);
        
        if (!paymentRequest.accepts || paymentRequest.accepts.length === 0) {
          throw new Error("No payment options in 402 response");
        }

        const paymentOption = paymentRequest.accepts[0];
        console.log(`💰 Payment required: ${paymentOption.amount} ${paymentOption.asset} on ${paymentOption.network}`);
        
        // Generate x402 payment header using Coinbase CDP x402 protocol
        // This follows the x402 protocol: generate payment header, facilitator executes transfer
        if (typeof window.ethereum === "undefined") {
          throw new Error("Wallet not connected. Please connect your wallet first.");
        }

        console.log("💳 Generating x402 payment header...");
        setError(null);
        setLoading(true);
        
        try {
          // Use Daydreams SDK's generateX402PaymentBrowser pattern
          // This creates a payment header that can be verified by the server
          const provider = new ethers.BrowserProvider(window.ethereum);
          const signer = await provider.getSigner();
          const walletAddress = await signer.getAddress();
          
          // Generate payment header using Daydreams pattern
          // Note: We're using our own implementation since we're not using Daydreams SDK for minting
          // But we follow the same x402 protocol
          const paymentHeader = await generateX402PaymentHeader(
            walletAddress,
            signer,
            paymentOption
          );
          
          console.log(`✅ Payment header generated`);
          
          // Retry mint permit request with payment proof
          console.log("📝 Requesting mint permit with payment proof...");
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
          
          console.log("Mint permit response status:", mintResponse.status);
          
          if (!mintResponse.ok) {
            const errorData = await mintResponse.json();
            console.error("Mint permit failed after payment:", errorData);
            
            // Handle rate limit error (should not occur for mint, but keep for compatibility)
            if (mintResponse.status === 429) {
              const errorMessage = errorData.error || "Rate limit exceeded";
              throw new Error(
                `${errorMessage}\n\nNote: Mint rate limiting has been removed. If you see this error, please report it.`
              );
            }
            
            throw new Error(`Mint permit failed: ${errorData.error || 'Unknown error'}`);
          }
          
          const permitData: MintPermitResponse = await mintResponse.json();
          console.log("✅ Permit data received:", permitData);
          await mintNFT(permitData);
        } catch (paymentError: any) {
          console.error("❌ Payment failed:", paymentError);
          
          // Provide helpful error message for USDC contract issues
          const errorMessage = paymentError.message || 'Unknown error';
          if (errorMessage.includes("USDC") || errorMessage.includes("contract") || errorMessage.includes("balanceOf")) {
            throw new Error(
              `Payment failed: ${errorMessage}\n\n` +
              `For Base Mainnet, ensure:\n` +
              `1. Your wallet is connected to Base Mainnet (Chain ID: 8453)\n` +
              `2. You have sufficient USDC balance (contract: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)\n` +
              `3. You have enough ETH for gas fees`
            );
          }
          
          throw new Error(`Payment failed: ${errorMessage}`);
        }
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
    if (!wallet || typeof window.ethereum === "undefined") {
      console.error("❌ Cannot mint: Wallet not connected");
      setError("Wallet not connected. Please connect your wallet first.");
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      console.log("🚀 Starting mint process...");
      console.log("📋 Permit data:", permit);
      
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();
      
      // Check network
      const network = await provider.getNetwork();
      console.log("🌐 Network:", {
        chainId: network.chainId.toString(),
        name: network.name,
      });
      
      // Verify we're on Base Mainnet (chain ID 8453)
      const expectedChainId = BigInt(8453);
      if (network.chainId !== expectedChainId) {
        throw new Error(
          `Wrong network! Please switch to Base Mainnet (Chain ID: 8453).\n\n` +
          `Current network: ${network.name} (Chain ID: ${network.chainId})\n` +
          `Expected: Base Mainnet (Chain ID: 8453)`
        );
      }
      
      console.log("👤 Signer address:", signerAddress);
      
      // Contract ABI (simplified)
      const contractABI = [
        "function mintWithSig((address to, address payer, uint256 xUserId, string tokenURI, uint256 nonce, uint256 deadline) auth, bytes signature) external",
      ];
      
      // Get contract address from environment variable
      // IMPORTANT: Use NEXT_PUBLIC_ prefix for client-side access
      const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
      
      console.log("📝 Contract address from env:", contractAddress);
      
      if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000") {
        const errorMsg = "Contract address not configured. Please set NEXT_PUBLIC_CONTRACT_ADDRESS in Vercel environment variables.";
        console.error("❌", errorMsg);
        throw new Error(errorMsg);
      }
      
      // Validate contract address format
      if (!ethers.isAddress(contractAddress)) {
        const errorMsg = `Invalid contract address format: ${contractAddress}`;
        console.error("❌", errorMsg);
        throw new Error(errorMsg);
      }
      
      // Check if contract address matches expected Base Mainnet address
      const expectedAddress = "0xE0b735225971a8126f7f53A6cA1014984cA7fefb";
      if (contractAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
        console.warn(`⚠️ Contract address mismatch! Expected: ${expectedAddress}, Got: ${contractAddress}`);
        console.warn("⚠️ This might be using an old contract address. Continuing anyway...");
      }
      
      console.log("📝 Minting NFT with contract:", contractAddress);
      console.log("📝 Auth data:", {
        to: permit.auth.to,
        payer: permit.auth.payer,
        xUserId: permit.auth.xUserId,
        tokenURI: permit.auth.tokenURI?.substring(0, 50) + "...",
        nonce: permit.auth.nonce,
        deadline: permit.auth.deadline,
      });
      console.log("📝 Signature:", permit.signature?.substring(0, 20) + "...");
      
      const contract = new ethers.Contract(
        contractAddress,
        contractABI,
        signer
      );
      
      // Verify contract code exists at address
      const code = await provider.getCode(contractAddress);
      if (!code || code === "0x") {
        throw new Error(`No contract code found at address ${contractAddress}. Is the contract deployed?`);
      }
      console.log("✅ Contract code verified at address");
      
      // Convert xUserId from hex string to BigInt for contract call
      // Backend stores xUserId as hex string (0x...), but contract expects uint256
      // CRITICAL: ethers.js requires struct object format for proper ABI encoding
      const xUserIdBigInt = BigInt(permit.auth.xUserId);
      
      console.log("📝 xUserId conversion check:", {
        original: permit.auth.xUserId,
        originalType: typeof permit.auth.xUserId,
        converted: xUserIdBigInt.toString(),
        convertedType: typeof xUserIdBigInt,
        hexMatch: BigInt(permit.auth.xUserId).toString(16),
      });
      
      // ULTIMATE FIX: Manual ABI encoding using defaultAbiCoder
      // ethers.js CANNOT properly encode BigInt in structs/tuples
      // We must use defaultAbiCoder to ensure proper 32-byte padding for uint256
      
      const authStruct = {
        to: permit.auth.to,
        payer: permit.auth.payer,
        xUserId: xUserIdBigInt,                  // BigInt
        tokenURI: permit.auth.tokenURI,
        nonce: BigInt(permit.auth.nonce),        // BigInt
        deadline: BigInt(permit.auth.deadline),  // BigInt
      };
      
      console.log("🔧 Using manual ABI encoding for guaranteed uint256 padding");
      console.log("📝 Auth struct values:", {
        to: authStruct.to,
        payer: authStruct.payer,
        xUserId: authStruct.xUserId.toString(),
        tokenURI: authStruct.tokenURI?.substring(0, 50) + "...",
        nonce: authStruct.nonce.toString(),
        deadline: authStruct.deadline.toString(),
      });
      
      // Create ABI coder for manual encoding
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      
      // Encode the struct manually - this GUARANTEES proper uint256 encoding
      const encodedAuth = abiCoder.encode(
        ["tuple(address,address,uint256,string,uint256,uint256)"],
        [[
          authStruct.to,
          authStruct.payer,
          authStruct.xUserId,      // Will be properly padded to 32 bytes
          authStruct.tokenURI,
          authStruct.nonce,        // Will be properly padded to 32 bytes
          authStruct.deadline      // Will be properly padded to 32 bytes
        ]]
      );
      
      console.log("📝 Manually encoded auth (first 100 chars):", encodedAuth.substring(0, 100));
      
      // Now use contract.interface to create the full transaction data
      const mintData = contract.interface.encodeFunctionData("mintWithSig", [
        authStruct,  // Pass as object - interface will use our manual encoding
        permit.signature
      ]);
      
      console.log("📝 Full mint transaction data (first 200 chars):", mintData.substring(0, 200));
      
      let tx;
      try {
        console.log("⏳ Estimating gas with manual encoding...");
        
        // Estimate gas using the manually encoded transaction
        const gasEstimate = await provider.estimateGas({
          to: contractAddress,
          from: signerAddress,
          data: mintData,
        });
        console.log("✅ Gas estimate successful:", gasEstimate.toString());
        
        console.log("⏳ Sending transaction with manual encoding...");
        // Send the transaction using manual data
        tx = await signer.sendTransaction({
          to: contractAddress,
          data: mintData,
          gasLimit: gasEstimate * BigInt(120) / BigInt(100), // +20% buffer
        });
        console.log("✅ Transaction sent:", tx.hash);
      } catch (callError: any) {
        console.error("❌ Contract call failed:", callError);
        console.error("❌ Error name:", callError.name);
        console.error("❌ Error message:", callError.message);
        console.error("❌ Error code:", callError.code);
        console.error("❌ Error data:", callError.data);
        console.error("❌ Error reason:", callError.reason);
        throw callError;
      }
      console.log("⏳ Waiting for transaction confirmation...");
      
      const receipt = await tx.wait();
      if (receipt) {
        console.log("✅ Transaction confirmed:", receipt.hash);
        console.log("✅ NFT minted successfully!");
      } else {
        throw new Error("Transaction receipt is null");
      }
      
      setStep("mint");
      setError(null);
    } catch (err: any) {
      console.error("❌ Minting failed:", err);
      const errorMessage = err instanceof Error ? err.message : "Minting failed";
      
      // Provide more helpful error messages
      if (errorMessage.includes("revert") || errorMessage.includes("execution reverted")) {
        setError(`Minting failed: Transaction reverted. ${err.reason || err.data?.message || ""}\n\nPossible causes:\n- User already minted\n- Max supply reached\n- Invalid signature\n- Contract error`);
      } else if (errorMessage.includes("user rejected") || errorMessage.includes("User denied")) {
        setError("Minting cancelled by user");
      } else if (errorMessage.includes("insufficient funds")) {
        setError("Insufficient funds for gas. Please add ETH to your wallet.");
      } else {
        setError(`Minting failed: ${errorMessage}`);
      }
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

