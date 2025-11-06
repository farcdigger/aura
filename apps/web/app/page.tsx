"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ethers } from "ethers";
import type { GenerateResponse, MintPermitResponse } from "@/lib/types";
import { wrapFetchWithPayment } from "x402-fetch";
import { createWalletClient, custom } from "viem";
import { base } from "viem/chains";
import { env } from "@/env.mjs";
import Hero from "@/components/Hero";
import StepCard from "@/components/StepCard";
import PreviousCreations from "@/components/PreviousCreations";

function HomePageContent() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<"connect" | "generate" | "pay" | "mint">("connect");
  const [xUser, setXUser] = useState<{ x_user_id: string; username: string; profile_image_url: string; bio?: string } | null>(null);
  const [generated, setGenerated] = useState<GenerateResponse | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [mintedTokenId, setMintedTokenId] = useState<string | null>(null);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [alreadyMinted, setAlreadyMinted] = useState(false);

  // Load user from localStorage on mount
  useEffect(() => {
    const savedUser = localStorage.getItem("xUser");
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        console.log("🔄 Restoring user from localStorage:", user.username);
        setXUser(user);
        // Check their NFT status
        checkExistingNFT(user.x_user_id);
      } catch (e) {
        console.error("Failed to parse saved user:", e);
        localStorage.removeItem("xUser");
      }
    }
  }, []);

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
        const userData = {
          x_user_id: xUserId,
          username,
          profile_image_url: profileImageUrl || "",
          bio: bio || undefined,
        };
        
        setXUser(userData);
        
        // 💾 Save to localStorage for persistence
        localStorage.setItem("xUser", JSON.stringify(userData));
        console.log("💾 User saved to localStorage:", username);
        
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
      
      // First check if user already minted (check token_id in database)
      try {
        const mintStatusResponse = await fetch("/api/check-mint-status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ x_user_id: xUserId }),
        });
        
        if (mintStatusResponse.ok) {
          const mintStatus = await mintStatusResponse.json();
          console.log("🔍 Mint status:", mintStatus);
          
          // If database says minted (token_id > 0), show success screen
          if (mintStatus.hasMinted && mintStatus.tokenId > 0) {
            console.log("✅ User already minted (DB)! Token ID:", mintStatus.tokenId);
            setAlreadyMinted(true);
            setMintedTokenId(mintStatus.tokenId?.toString() || null);
            setGenerated({
              imageUrl: mintStatus.imageUri || "",
              metadataUrl: mintStatus.metadataUri || "",
              preview: mintStatus.imageUri || "",
              seed: "",
              traits: {
                description: "Already minted NFT",
                main_colors: [],
                style: "unique",
                accessory: "none"
              },
            });
            setCurrentUserId(xUserId);
            setStep("mint"); // Show success screen
            return true;
          }
          
          // If database says not minted, double-check with contract
          // (in case token_id wasn't updated in DB)
          console.log("🔍 Database token_id=0, checking contract...");
          if (typeof window.ethereum !== "undefined") {
            try {
              const provider = new ethers.BrowserProvider(window.ethereum);
              const contract = new ethers.Contract(
                env.NEXT_PUBLIC_CONTRACT_ADDRESS!,
                ["function usedXUserId(uint256) view returns (bool)"],
                provider
              );
              
              const hash = ethers.id(xUserId);
              const xUserIdBigInt = BigInt(hash);
              const isUsed = await contract.usedXUserId(xUserIdBigInt);
              
              console.log("🔍 Contract check result:", { isUsed });
              
              if (isUsed) {
                console.log("✅ User already minted (CONTRACT)!");
                setAlreadyMinted(true);
                setMintedTokenId(null); // token_id not available, will show without it
                setGenerated({
                  imageUrl: mintStatus.imageUri || "",
                  metadataUrl: mintStatus.metadataUri || "",
                  preview: mintStatus.imageUri || "",
                  seed: "",
                  traits: {
                    description: "Already minted NFT",
                    main_colors: [],
                    style: "unique",
                    accessory: "none"
                  },
                });
                setCurrentUserId(xUserId);
                setStep("mint"); // Show success screen
                return true;
              }
            } catch (contractError) {
              console.warn("⚠️ Contract check failed:", contractError);
            }
          }
        }
      } catch (mintCheckError) {
        console.warn("⚠️ Mint status check failed (non-critical):", mintCheckError);
        // Continue to metadata check
      }
      
      // Not minted yet - check for generated metadata
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
          console.log("✅ Found existing NFT metadata, can proceed to mint");
          setGenerated(data);
          setCurrentUserId(xUserId);
          // Move to pay step if NFT metadata exists but not minted yet
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

  // Check mint status when on pay step
  useEffect(() => {
    const checkMintStatus = async () => {
      if (step === "pay" && xUser && !alreadyMinted && wallet) {
        try {
          console.log("🔍 Checking mint status on pay step for user:", xUser.x_user_id);
          
          // Check database first
          const mintStatusResponse = await fetch("/api/check-mint-status", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ x_user_id: xUser.x_user_id }),
          });
          
          let mintStatus: any = null;
          if (mintStatusResponse.ok) {
            mintStatus = await mintStatusResponse.json();
            console.log("🔍 Mint status result (DB):", mintStatus);
            
            // If database says minted, show success
            if (mintStatus.hasMinted && mintStatus.tokenId > 0) {
              console.log("✅ User already minted (DB)! Redirecting to success...");
              setAlreadyMinted(true);
              setMintedTokenId(mintStatus.tokenId?.toString() || null);
              setStep("mint");
              return;
            }
          }
          
          // If database says not minted, double-check with contract
          // (in case token_id wasn't updated in DB)
          console.log("🔍 Database check passed, checking contract...");
          if (typeof window.ethereum !== "undefined") {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const contract = new ethers.Contract(
              env.NEXT_PUBLIC_CONTRACT_ADDRESS!,
              [
                "function usedXUserId(uint256) view returns (bool)",
              ],
              provider
            );
            
            // Convert x_user_id to uint256
            const hash = ethers.id(xUser.x_user_id);
            const xUserIdBigInt = BigInt(hash);
            
            const isUsed = await contract.usedXUserId(xUserIdBigInt);
            console.log("🔍 Contract check result:", { isUsed });
            
            if (isUsed) {
              console.log("✅ User already minted (CONTRACT)! Redirecting to success...");
              setAlreadyMinted(true);
              // Try to get token_id from database, if not available, show without it
              setMintedTokenId(mintStatus?.tokenId > 0 ? mintStatus.tokenId?.toString() : null);
              setStep("mint");
            }
          }
        } catch (error) {
          console.warn("⚠️ Mint status check failed (non-critical):", error);
        }
      }
    };
    
    checkMintStatus();
  }, [step, xUser, alreadyMinted, wallet]);

  const disconnectX = () => {
    // Clear X account connection
    setXUser(null);
    setGenerated(null);
    setCurrentUserId(null);
    setMintedTokenId(null);
    setTransactionHash(null);
    setError(null);
    setAlreadyMinted(false);
    setStep("connect");
    
    // 🗑️ Clear localStorage
    localStorage.removeItem("xUser");
    console.log("🗑️ User data cleared from localStorage");
    
    // Clear URL parameters
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("x_user_id");
      url.searchParams.delete("username");
      url.searchParams.delete("profile_image_url");
      url.searchParams.delete("bio");
      url.searchParams.delete("error");
      window.history.replaceState({}, "", url.toString());
    }
  };

  const resetToHome = () => {
    // Reset all state to initial values
    setXUser(null);
    setGenerated(null);
    setWallet(null);
    setCurrentUserId(null);
    setMintedTokenId(null);
    setTransactionHash(null);
    setError(null);
    setAlreadyMinted(false);
    setStep("connect");
    
    // 🗑️ Clear localStorage
    localStorage.removeItem("xUser");
    console.log("🗑️ User data cleared from localStorage");
    
    // Clear URL parameters
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("x_user_id");
      url.searchParams.delete("username");
      url.searchParams.delete("profile_image_url");
      url.searchParams.delete("bio");
      url.searchParams.delete("error");
      window.history.replaceState({}, "", url.toString());
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
    
    console.log("✅ All checks passed - starting mint flow with x402-fetch");
    try {
      setLoading(true);
      setError("Preparing payment... Please approve the USDC permit signature in your wallet.");
      
      // Check if wallet is available
        if (typeof window.ethereum === "undefined") {
          throw new Error("Wallet not connected. Please connect your wallet first.");
        }

      console.log("💳 Using x402-fetch to handle payment automatically...");
      console.log("   This will:");
      console.log("   1. Get 402 response from server");
      console.log("   2. Request USDC permit signature from your wallet");
      console.log("   3. Send permit to CDP facilitator");
      console.log("   4. Retry request with payment proof");
      
      // Get account address from MetaMask
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      const userAddress = accounts[0] as `0x${string}`;
      
      console.log(`Using wallet address: ${userAddress}`);
          
      // Create viem wallet client for x402-fetch
      const walletClient = createWalletClient({
        account: userAddress,
        chain: base,
        transport: custom(window.ethereum),
      });
          
      // Wrap fetch with x402 payment handling
      // maxValue: 100000 = 0.1 USDC (6 decimals)
      // @ts-ignore - viem version mismatch between dependencies
      const fetchWithPayment = wrapFetchWithPayment(fetch, walletClient, BigInt(100000));
      
      // x402-fetch automatically handles the entire payment flow
      // Server-side manual verification (EIP-2612 USDC Permit)
      const response = await fetchWithPayment("/api/mint-permit-v2", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              wallet,
              x_user_id: userId,
            }),
          });
          
      console.log("✅ Payment completed, parsing response...");
      
      // wrapFetchWithPayment returns the Response object after successful payment
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error("Mint permit failed:", errorData);
        throw new Error(errorData.error || errorData.message || 'Failed to get mint permit');
          }
          
      const permitData: MintPermitResponse = await response.json();
          console.log("✅ Permit data received:", permitData);
      
      // Now mint the NFT with the permit
          await mintNFT(permitData);
      
    } catch (err: any) {
      console.error("❌ Request mint permit error:", err);
          
      let errorMessage = err.message || "Payment failed";
      
      // Add helpful context for common errors
      if (errorMessage.includes("insufficient") || errorMessage.includes("balance")) {
        errorMessage += "\n\nPlease ensure you have at least 0.1 USDC and some ETH for gas on Base Mainnet.";
      } else if (errorMessage.includes("network") || errorMessage.includes("chain")) {
        errorMessage += "\n\nPlease make sure your wallet is connected to Base Mainnet (Chain ID: 8453).";
      } else if (errorMessage.includes("rejected") || errorMessage.includes("denied") || errorMessage.includes("user rejected")) {
        errorMessage = "Transaction was rejected. Please try again and approve the transaction.";
      } else if (errorMessage.includes("facilitator")) {
        errorMessage += "\n\nThere may be an issue with the payment processor. Please try again.";
      }
      
      setError(`Payment failed: ${errorMessage}`);
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
      const expectedAddress = "0x3ACA7E83B208E5243FE31eB3690c6781aB3010bb";
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
      
      // FINAL FIX: Use DECIMAL STRING representation (not hex!)
      // Backend signs with BigInt, frontend must send as BigInt-compatible format
      // ethers.js accepts decimal strings for uint256 and converts properly
      
      console.log("🔧 Final fix: Use decimal string representation for uint256");
      
      // Convert BigInt to DECIMAL string (not hex!)
      // This is what ethers.js expects for uint256 in structs
      const xUserIdDecimal = xUserIdBigInt.toString(10); // Decimal string
      const nonceDecimal = BigInt(permit.auth.nonce).toString(10);
      const deadlineDecimal = BigInt(permit.auth.deadline).toString(10);
      
      console.log("📝 Decimal uint256 values:", {
        xUserId: xUserIdDecimal,
        nonce: nonceDecimal,
        deadline: deadlineDecimal,
      });
      
      // Build auth struct with DECIMAL strings
      const authForContract = {
        to: permit.auth.to,
        payer: permit.auth.payer,
        xUserId: xUserIdDecimal,             // Decimal string (uint256)
        tokenURI: permit.auth.tokenURI,
        nonce: nonceDecimal,                 // Decimal string (uint256)
        deadline: deadlineDecimal,           // Decimal string (uint256)
      };
      
      console.log("📝 Auth struct for contract (decimal strings):", {
        to: authForContract.to,
        payer: authForContract.payer,
        xUserId: authForContract.xUserId,
        tokenURI: authForContract.tokenURI?.substring(0, 50) + "...",
        nonce: authForContract.nonce,
        deadline: authForContract.deadline,
      });
      
      // Use contract method directly - ethers.js handles decimal strings correctly
      console.log("📝 Calling contract.mintWithSig directly...");
      
      let tx;
      try {
        console.log("⏳ Estimating gas...");
        
        // Estimate gas using contract method directly
        let gasEstimate;
        try {
          gasEstimate = await contract.mintWithSig.estimateGas(
            authForContract,
            permit.signature
          );
          console.log("✅ Gas estimate successful:", gasEstimate.toString());
        } catch (gasError: any) {
          console.error("❌ Gas estimation failed:", gasError);
          console.error("❌ Gas error message:", gasError.message);
          console.error("❌ Gas error code:", gasError.code);
          console.error("❌ Gas error data:", gasError.data);
          
          // Try to decode the revert reason
          if (gasError.data) {
            try {
              const reason = contract.interface.parseError(gasError.data);
              console.error("❌ Revert reason:", reason);
            } catch (e) {
              console.error("❌ Could not decode revert reason");
            }
          }
          throw gasError;
        }
        
        console.log("⏳ Sending transaction...");
        // Call contract method with decimal string values
        tx = await contract.mintWithSig(
          authForContract,
          permit.signature,
          {
            gasLimit: (gasEstimate * BigInt(120)) / BigInt(100), // +20% buffer
          }
        );
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
        console.log("✅ Receipt:", receipt);
        console.log("📊 Receipt logs count:", receipt.logs?.length || 0);
        
        // Extract tokenId from Minted event
        // Event signature: Minted(address indexed to, address indexed payer, uint256 indexed tokenId, uint256 xUserId, string tokenURI)
        console.log("🔍 Searching for Minted event...");
        const mintedEvent = receipt.logs.find((log: any) => {
          try {
            const parsed = contract.interface.parseLog(log);
            console.log("📝 Parsed event:", parsed?.name);
            return parsed && parsed.name === "Minted";
          } catch (e) {
            // Ignore parse errors for non-contract events
            return false;
          }
        });
        
        if (mintedEvent) {
          console.log("✅ Minted event found!");
          const parsed = contract.interface.parseLog(mintedEvent);
          console.log("📦 Parsed event full:", parsed);
          console.log("📦 Parsed event args:", parsed?.args);
          
          // tokenId is indexed (3rd parameter), so it's in topics[2] or args[2]
          let tokenId = null;
          
          // Try multiple methods to extract tokenId
          if (parsed?.args?.tokenId !== undefined) {
            tokenId = parsed.args.tokenId.toString();
            console.log("✅ Token ID from args.tokenId:", tokenId);
          } else if (parsed?.args?.[2] !== undefined) {
            tokenId = parsed.args[2].toString();
            console.log("✅ Token ID from args[2]:", tokenId);
          } else if (mintedEvent.topics?.[3]) {
            // topics[0] = event signature, topics[1] = to, topics[2] = payer, topics[3] = tokenId
            tokenId = BigInt(mintedEvent.topics[3]).toString();
            console.log("✅ Token ID from topics[3]:", tokenId);
          }
          
          console.log("🔍 Final tokenId:", tokenId);
          console.log("🔍 Debug - xUser:", xUser ? `${xUser.username} (${xUser.x_user_id})` : "NULL");
          setMintedTokenId(tokenId || null);
          
          // 💾 Update token_id in database
          // Get x_user_id from localStorage (more reliable than state)
          const savedUser = localStorage.getItem("xUser");
          const userFromStorage = savedUser ? JSON.parse(savedUser) : null;
          const x_user_id = xUser?.x_user_id || userFromStorage?.x_user_id;
          
          if (tokenId && x_user_id) {
            try {
              console.log("💾 Updating token_id in database...");
              console.log("📤 Request body:", {
                x_user_id,
                token_id: tokenId,
                transaction_hash: receipt.hash
              });
              const updateResponse = await fetch("/api/update-token-id", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  x_user_id,
                  token_id: tokenId,
                  transaction_hash: receipt.hash,
                }),
              });
              
              if (updateResponse.ok) {
                const updateData = await updateResponse.json();
                console.log("✅ Token ID updated in database:", updateData);
              } else {
                const errorData = await updateResponse.json().catch(() => ({}));
                console.error("⚠️ Failed to update token_id in database:", errorData);
              }
            } catch (updateError) {
              console.error("⚠️ Database update error (non-critical):", updateError);
              // Non-critical error, continue with success
            }
          } else {
            console.error("❌ CRITICAL: Cannot update token_id in database!", {
              hasTokenId: !!tokenId,
              hasXUserId: !!x_user_id,
              xUserState: xUser ? `${xUser.username} (${xUser.x_user_id})` : "NULL",
              localStorage: userFromStorage ? `${userFromStorage.username} (${userFromStorage.x_user_id})` : "NULL",
              reason: !tokenId ? "tokenId is null/undefined" : "x_user_id is null/undefined"
            });
          }
        } else {
          console.error("❌ Minted event not found in transaction receipt!");
        }
        
        setTransactionHash(receipt.hash);
        console.log("✅ NFT minted successfully!");
        
        // 💾 Update localStorage to persist mint success
        if (xUser) {
          localStorage.setItem("xUser", JSON.stringify(xUser));
          console.log("💾 User data persisted to localStorage");
        }
      } else {
        throw new Error("Transaction receipt is null");
      }
      
      // Mark as minted so user can't mint again
      setAlreadyMinted(true);
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
    <div className="min-h-screen bg-gradient-to-br from-gray-100 via-purple-100 to-blue-100">
      {/* Navbar - Top */}
      <nav className="bg-white/70 backdrop-blur-md shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <img 
                src="/frora-logo.png" 
                alt="Frora Logo" 
                className="w-10 h-10 rounded-full object-cover"
              />
              <span className="text-xl font-bold text-gray-800">Frora</span>
          </div>
        
            {/* Right: User Info & Buttons */}
            <div className="flex items-center gap-3">
              {xUser ? (
                <div className="hidden md:flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-full text-sm">
                  <span className="text-gray-700">@{xUser.username}</span>
                </div>
              ) : (
                <button
                  onClick={connectX}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
                >
                  Connect X
                </button>
              )}
              
              {!wallet ? (
                <button
                  onClick={connectWallet}
                  className="px-4 py-2 text-sm bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors font-semibold"
                >
                  Connect Wallet
                </button>
              ) : (
                <div className="px-4 py-2 bg-teal-500 text-white rounded-lg text-sm font-semibold">
                  {wallet.substring(0, 6)}...{wallet.substring(wallet.length - 4)}
          </div>
        )}
      </div>
          </div>
        </div>
      </nav>
      
      <div className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <Hero xUser={xUser} />
        
        {/* Error Message */}
          {error && (
          <div className="max-w-4xl mx-auto mb-8">
            <div className="bg-red-50 border border-red-300 text-red-700 p-4 rounded-lg">
              <p className="text-sm font-medium">{error}</p>
            </div>
            </div>
          )}
          
        {/* 3-Card Layout - Always show all 3 steps */}
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {/* Card 1: Connect X Profile */}
            <StepCard
              icon="x"
              title="Connect Your Profile"
              status={xUser ? "connected" : "idle"}
              statusText={xUser ? `X Account: @${xUser.username}` : undefined}
              actionButton={
                !xUser ? (
                  <button
                    onClick={connectX}
                    disabled={loading}
                    className="btn-primary w-full"
                  >
                    {loading ? "Connecting..." : "Connect X Profile"}
                  </button>
                ) : (
                  <button
                    onClick={() => setStep("generate")}
                    className="btn-secondary w-full"
                  >
                    ✓ Connected
                  </button>
                )
              }
            />

            {/* Card 2: Connect Wallet */}
            <StepCard
              icon="wallet"
              title="Connect Wallet"
              status={wallet ? "connected" : "idle"}
              statusText={wallet ? `Wallet Connected: ${wallet.substring(0, 6)}...${wallet.substring(wallet.length - 4)}` : undefined}
              actionButton={
                !wallet ? (
                  <button
                    onClick={connectWallet}
                    disabled={loading || !xUser}
                    className="btn-primary w-full"
                  >
                    {loading ? "Connecting..." : "Connect Wallet"}
                  </button>
                ) : (
                  <button className="btn-secondary w-full" disabled>
                    ✓ Connected
                  </button>
                )
              }
            />

            {/* Card 3: Generate & Mint */}
            <StepCard
              icon="nft"
              title="Generat & Mint"
              status={generated ? "completed" : "idle"}
              statusText={generated ? "NFT Generated!" : undefined}
              actionButton={
                !generated ? (
                  <button
                    onClick={generateNFT}
                    disabled={loading || !xUser || !wallet}
                    className="btn-primary w-full"
                  >
                    {loading ? "Generating..." : "Generate AI Creature"}
                  </button>
                ) : alreadyMinted ? (
                  <button className="btn-secondary w-full" disabled>
                    ✓ Already Minted
                  </button>
                ) : (
                  <button
                    onClick={requestMintPermit}
                    disabled={loading}
                    className="btn-primary w-full"
                  >
                    {loading ? "Minting..." : "Mint on Base"}
                  </button>
                )
              }
            >
              {loading && !generated && (
                <div className="text-center text-sm text-gray-300 mt-2">
                  <div className="spinner mx-auto mb-2"></div>
                  <p>AI is creating your unique creature...</p>
                </div>
              )}
            </StepCard>
          </div>
        </div>
        
        {/* NFT Preview - Show after generation */}
        {generated && !alreadyMinted && (
          <div className="max-w-4xl mx-auto mb-12 animate-fade-in">
            <div className="card text-center">
              <h3 className="text-2xl font-bold mb-4 text-gray-800">Your Aura Creature</h3>
              {(generated.preview || generated.imageUrl) && (
                <div className="max-w-md mx-auto mb-6">
                  <img
                    src={(generated.imageUrl || generated.preview || "").replace("ipfs://", "https://gateway.pinata.cloud/ipfs/")}
                    alt="Generated NFT"
                    className="w-full rounded-lg shadow-2xl"
                    onError={(e) => {
                      console.error("Image load error:", e);
                      // Fallback to preview if imageUrl fails
                      if (generated.preview && e.currentTarget.src !== generated.preview) {
                        e.currentTarget.src = generated.preview;
                      }
                    }}
                  />
                </div>
              )}
              {generated.traits && (
                <div className="text-left max-w-md mx-auto bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <h4 className="font-semibold mb-2 text-purple-700">Traits:</h4>
                  <p className="text-sm text-gray-700">{generated.traits.description}</p>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Success Screen */}
        {step === "mint" && alreadyMinted && (
          <div className="max-w-2xl mx-auto animate-fade-in">
            <div className="card text-center">
              <div className="text-6xl mb-4">🎉</div>
              <h2 className="text-3xl font-bold mb-4 text-gray-800">Success!</h2>
              <p className="text-lg mb-6 text-gray-700">Your Aura Creature has been minted!</p>
              
              {mintedTokenId && (
                <div className="mb-6">
                  <p className="text-2xl font-bold text-purple-600">Token #{mintedTokenId}</p>
                </div>
              )}
              
              {(generated?.preview || generated?.imageUrl) && (
                <div className="max-w-sm mx-auto mb-6">
                  <img
                    src={(generated.imageUrl || generated.preview || "").replace("ipfs://", "https://gateway.pinata.cloud/ipfs/")}
                    alt="Minted NFT"
                    className="w-full rounded-lg shadow-2xl"
                    onError={(e) => {
                      console.error("Minted image load error:", e);
                      if (generated.preview && e.currentTarget.src !== generated.preview) {
                        e.currentTarget.src = generated.preview.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/");
                      }
                    }}
                  />
                </div>
              )}
              
              <div className="flex flex-col gap-3">
                {/* OpenSea Link - PRIMARY */}
                {mintedTokenId && env.NEXT_PUBLIC_CONTRACT_ADDRESS && (
                  <a
                    href={`https://opensea.io/assets/base/${env.NEXT_PUBLIC_CONTRACT_ADDRESS}/${mintedTokenId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary flex items-center justify-center gap-2"
                  >
                    <span className="text-xl">🌊</span>
                    View on OpenSea
                  </a>
                )}
                
                {/* BaseScan Link - SECONDARY */}
                {transactionHash && (
                  <a
                    href={`https://basescan.org/tx/${transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary flex items-center justify-center gap-2"
                  >
                    <span className="text-xl">🔍</span>
                    View Transaction
                  </a>
                )}
                
                {/* Back to Home */}
                <button
                  onClick={resetToHome}
                  className="btn-secondary"
                >
                  🏠 Back to Home
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Example Creations - Frora Examples */}
        <PreviousCreations />
        
        {/* OLD STEP-BASED UI - Hidden but kept for logic */}
        <div className="hidden">
          {step === "connect" && (
            <div className="bg-white/10 backdrop-blur-lg rounded-lg p-8 text-center">
              <h2 className="text-2xl font-bold mb-4">Step 1: Connect X</h2>
              <p className="mb-6 text-gray-300">Connect your X account to generate your unique AI creature</p>
              
              {/* Status indicator */}
              {xUser && (
                <div className="mb-6 bg-green-500/20 border border-green-500/50 rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span>✅ X Account: @{xUser.username}</span>
                    <button
                      onClick={disconnectX}
                      className="text-red-400 hover:text-red-300 text-xs underline ml-4"
                    >
                      Disconnect
                    </button>
                  </div>
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
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm">
                        <strong>X Account:</strong> @{xUser.username}
                      </p>
                      <p className="text-sm text-gray-300 mt-1">
                        Profile Image: {xUser.profile_image_url}
                      </p>
                    </div>
                    <button
                      onClick={disconnectX}
                      className="text-red-400 hover:text-red-300 text-xs underline ml-4"
                    >
                      Disconnect
                    </button>
                  </div>
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
              
              {/* Show X account info with disconnect option */}
              {xUser && (
                <div className="mb-6 p-4 bg-green-500/20 border border-green-500/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <p className="text-sm">
                      <strong>X Account:</strong> @{xUser.username}
                    </p>
                    <button
                      onClick={disconnectX}
                      className="text-red-400 hover:text-red-300 text-xs underline ml-4"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              )}
              
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
              {alreadyMinted ? (
                <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-6 text-center">
                  <p className="text-green-400 text-lg font-bold mb-2">✅ Already Minted!</p>
                  <p className="text-sm text-gray-300 mb-4">
                    You have already minted your NFT with this X profile.
                    <br />
                    Each X profile can only mint one NFT.
                  </p>
                  {mintedTokenId && (
                    <p className="text-xs text-gray-400">
                      Token ID: #{mintedTokenId}
                    </p>
                  )}
                </div>
              ) : (
              <button
                onClick={requestMintPermit}
                disabled={loading || !wallet}
                className="bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg w-full"
              >
                  {loading ? "Processing..." : !wallet ? "Connect Wallet to Mint" : "Mint NFT (0.1 USDC)"}
              </button>
              )}
            </div>
          )}
          
          {step === "mint" && generated && (
            <div className="bg-white/10 backdrop-blur-lg rounded-lg p-8">
              {/* Success Header */}
              <div className="text-center mb-6">
                <div className="text-6xl mb-4">🎉</div>
                <h2 className="text-3xl font-bold mb-2">Congratulations!</h2>
                <p className="text-lg text-gray-300">Your Aura Creature NFT has been minted successfully!</p>
              </div>
              
              {/* NFT Image */}
              <div className="mb-6">
                {generated.imageUrl ? (
                  <div className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={generated.imageUrl.replace("ipfs://", "https://ipfs.io/ipfs/")} 
                      alt="Your Minted NFT" 
                      className="w-full rounded-lg border-4 border-yellow-500/50 shadow-2xl" 
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                ) : null}
              </div>
              
              {/* Token Info */}
              <div className="bg-black/30 rounded-lg p-4 mb-6 space-y-3">
                {mintedTokenId && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Token ID:</span>
                    <span className="font-mono font-bold text-yellow-400">#{mintedTokenId}</span>
                  </div>
                )}
                {transactionHash && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Transaction:</span>
                    <a 
                      href={`https://basescan.org/tx/${transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-sm text-blue-400 hover:text-blue-300 underline truncate max-w-[200px]"
                    >
                      {transactionHash.slice(0, 10)}...{transactionHash.slice(-8)}
                    </a>
                  </div>
                )}
              </div>
              
              {/* Action Buttons */}
              <div className="space-y-3">
                {/* OpenSea Link */}
                <a
                  href={`https://opensea.io/assets/base/0x3ACA7E83B208E5243FE31eB3690c6781aB3010bb/${mintedTokenId || ""}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-lg text-center transition-colors"
                >
                  🌊 View on OpenSea
                </a>
                
                {/* BaseScan Link */}
                {transactionHash && (
                  <a
                    href={`https://basescan.org/tx/${transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-lg text-center transition-colors"
                  >
                    🔍 View Transaction
                  </a>
                )}
                
                {/* Create Another NFT Button (disconnects X to allow new account) */}
                <button
                  onClick={() => {
                    disconnectX();
                    setWallet(null);
                  }}
                  className="block w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg text-center transition-colors"
                >
                  ✨ Create Another NFT
                </button>
                
                {/* Return to Home Button */}
                <button
                  onClick={resetToHome}
                  className="block w-full bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 px-6 rounded-lg text-center transition-colors"
                >
                  🏠 Ana Sayfaya Dön
                </button>
              </div>
              
              {/* Share Message */}
              <div className="mt-6 text-center text-sm text-gray-400">
                <p>Share your Aura Creature with the world! 🚀</p>
              </div>
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

