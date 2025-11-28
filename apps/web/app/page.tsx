"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ethers } from "ethers";
import type { GenerateResponse, MintPermitResponse } from "@/lib/types";
import { wrapFetchWithPayment } from "x402-fetch";
import { env } from "@/env.mjs";
import Hero from "@/components/Hero";
import StepCard from "@/components/StepCard";
import PreviousCreations from "@/components/PreviousCreations";
import GenerationProgress from "@/components/GenerationProgress";
import ThemeToggle from "@/components/ThemeToggle";
import Chatbot from "@/components/Chatbot";
import PaymentModal from "@/components/PaymentModal";
import { useAccount, useWalletClient } from "wagmi";

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
  const [mintStats, setMintStats] = useState<{ minted: number; remaining: number; maxSupply: number } | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [paymentReady, setPaymentReady] = useState(false);
  const [chatbotOpen, setChatbotOpen] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null); // Credits
  const [points, setPoints] = useState<number>(0); // Points
  const [yamaAgentLoading, setYamaAgentLoading] = useState(false);
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const introVideoRef = useRef<HTMLVideoElement | null>(null);

  // Fetch token balance and points
  const fetchTokenBalanceAndPoints = async (walletAddress: string) => {
    try {
      const response = await fetch(`/api/chat/token-balance?wallet=${walletAddress}&t=${Date.now()}`, {
        cache: 'no-store',
      });
      
      if (response.ok) {
        const data = await response.json();
        setTokenBalance(data.balance || 0);
        setPoints(data.points || 0);
        console.log("✅ Header - Token balance loaded:", { balance: data.balance, points: data.points });
      } else {
        console.error("❌ Header - Token balance API error:", response.status);
      }
    } catch (error) {
      console.error("❌ Error fetching token balance:", error);
    }
  };

  useEffect(() => {
    setWallet(address ?? null);
    
    // Fetch token balance and points when wallet connects
    if (address && isConnected) {
      fetchTokenBalanceAndPoints(address);
    } else {
      setTokenBalance(null);
      setPoints(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, isConnected]);

  // Capture referral code from URL (?ref=...) - Store in BOTH localStorage AND cookie
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    // Check both searchParams and raw URL
    const refCode = searchParams?.get("ref");
    const urlParams = new URLSearchParams(window.location.search);
    const refFromUrl = urlParams.get("ref");
    
    const finalRefCode = refCode || refFromUrl;
    
    if (finalRefCode) {
      try {
        // Store in localStorage (for frontend use)
        const existingCode = localStorage.getItem("referralCode");
        if (existingCode !== finalRefCode) {
          localStorage.setItem("referralCode", finalRefCode);
          console.log("💾 Referral code stored in localStorage:", finalRefCode);
        }
        
        // Store in cookie (for backend API access during X auth)
        document.cookie = `referralCode=${finalRefCode}; path=/; max-age=${60 * 60 * 24 * 7}`; // 7 days
        console.log("🍪 Referral code stored in cookie:", finalRefCode);
      } catch (e) {
        console.error("Failed to store referral code:", e);
      }
    } else {
      // Check if we already have a code stored (don't lose it)
      const storedCode = localStorage.getItem("referralCode");
      if (storedCode) {
        console.log("ℹ️ Using previously stored referral code:", storedCode);
        // Ensure cookie is also set
        document.cookie = `referralCode=${storedCode}; path=/; max-age=${60 * 60 * 24 * 7}`;
      }
    }
  }, [searchParams]);
  
  // Also capture on initial mount (before any redirects)
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get("ref");
    
    if (refCode) {
      localStorage.setItem("referralCode", refCode);
      document.cookie = `referralCode=${refCode}; path=/; max-age=${60 * 60 * 24 * 7}`;
      console.log("💾 [MOUNT] Referral code captured (localStorage + cookie):", refCode);
    }
  }, []); // Empty deps - only run once on mount

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuOpen && !(event.target as Element).closest('.relative')) {
        setMenuOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  useEffect(() => {
    if (!introVideoRef.current) return;
    const video = introVideoRef.current;
    video.currentTime = 0;
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Autoplay might be blocked; keep poster frame
      });
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    const fetchStats = async () => {
      try {
        const response = await fetch("/api/contract-stats", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Failed to fetch stats: ${response.status}`);
        }
        const data = await response.json();
        if (ignore) return;
        const minted = Number(data.minted ?? data.totalMinted ?? 0);
        const remaining =
          data.remaining !== undefined
            ? Number(data.remaining)
            : Math.max(Number(data.maxSupply ?? 0) - minted, 0);
        const maxSupply = Number(data.maxSupply ?? minted + remaining);
        setMintStats({
          minted: Number.isNaN(minted) ? 0 : minted,
          remaining: Number.isNaN(remaining) ? 0 : remaining,
          maxSupply: Number.isNaN(maxSupply) ? 0 : maxSupply,
        });
      } catch (error) {
        console.error("Failed to load mint stats:", error);
        if (!ignore) {
          setMintStats(null);
        }
      } finally {
        if (!ignore) {
          setStatsLoading(false);
        }
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 30000);

    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, []);

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
      let pendingPayment = false;
      
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
            setPaymentReady(false);
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
          
          pendingPayment = !mintStatus.hasMinted && !!mintStatus.hasPaid;
          setPaymentReady(pendingPayment);

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
                setPaymentReady(false);
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
      const response = await fetch(`/api/generate?x_user_id=${xUserId}`, {
        cache: 'no-store',
      });
      
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
          if (pendingPayment) {
            console.log("🟢 Payment previously completed; prompting user to mint");
            setPaymentReady(true);
          }
          return true;
        } else {
          console.warn("⚠️ NFT data received but no preview or imageUrl");
          setPaymentReady(false);
          setStep("generate");
          return false;
        }
      } else if (response.status === 404) {
        console.log("ℹ️ No existing NFT found for user");
        // NFT not found, user can generate new one
        setPaymentReady(false);
        setStep("generate");
        return false;
      } else {
        console.warn("⚠️ Error checking for existing NFT:", response.status);
        setPaymentReady(false);
        setStep("generate");
        return false;
      }
    } catch (error) {
      console.error("Error checking for existing NFT:", error);
      // Don't block the flow if check fails
      setPaymentReady(false);
      setStep("generate");
      return false;
    }
  };

  // Check for existing X session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        // Check for existing X session
        const sessionResponse = await fetch("/api/auth/x/session", {
          cache: 'no-store',
        });
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

    checkSession();
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
              setPaymentReady(false);
              setAlreadyMinted(true);
              setMintedTokenId(mintStatus.tokenId?.toString() || null);
              setStep("mint");
              return;
            }

            if (!mintStatus.hasMinted && mintStatus.hasPaid) {
              console.log("🟢 Payment recorded in DB, awaiting mint confirmation");
              setPaymentReady(true);
            } else if (!mintStatus.hasMinted) {
              setPaymentReady(false);
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
              setPaymentReady(false);
              setAlreadyMinted(true);
              // Try to get token_id from database, if not available, show without it
              setMintedTokenId(mintStatus?.tokenId > 0 ? mintStatus.tokenId?.toString() : null);
              setStep("mint");
            }
          }
        } catch (error) {
          console.warn("⚠️ Mint status check failed (non-critical):", error);
          setPaymentReady(false);
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
    setPaymentReady(false);
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
    setPaymentReady(false);
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
      
      // Save wallet address to cookie for callback to use
      if (address) {
        document.cookie = `temp_wallet_address=${address}; path=/; max-age=3600; SameSite=Lax`;
        console.log("💾 Saved wallet address to cookie:", address.substring(0, 10) + "...");
      } else {
        console.log("⚠️ No wallet connected yet - will save address later");
      }
      
      // Get OAuth URL from backend (more secure - client ID not exposed)
      const response = await fetch("/api/auth/x/authorize", {
        cache: 'no-store',
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to initiate X OAuth" }));
        
        // Show detailed error message
        const errorMessage = errorData.error || "X OAuth not configured";
        const errorDetails = errorData.details || {};
        
        let fullError = errorMessage;
        if (errorData.details) {
          fullError += "\n\nConfiguration status:\n";
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
            fullError += `- Callback URL value: ${errorData.details.callbackUrl}\n`;
          }
        }
        
        throw new Error(fullError);
      }
      
      const data = await response.json();
      const { authUrl, state } = data;
      
      if (!authUrl) {
        throw new Error("Failed to obtain OAuth URL");
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
      setPaymentReady(false);
      
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
      console.log("✅ NFT Generated! Data:", {
        hasPreview: !!data.preview,
        hasImageUrl: !!data.imageUrl,
        preview: data.preview?.substring(0, 100),
        imageUrl: data.imageUrl?.substring(0, 100),
      });
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
      setError(
        paymentReady
          ? "Payment detected. Preparing your mint permit..."
          : "Preparing payment... Please approve the 5 USDC permit signature in your wallet."
      );

      let response: Response;

      if (paymentReady) {
        console.log("🟢 Payment already completed. Requesting mint permit without charging again...");
        response = await fetch("/api/mint-permit-v2", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            wallet,
            x_user_id: userId,
          }),
        });
      } else {
        if (!walletClient) {
          throw new Error("Wallet client not available. Please connect your wallet first.");
        }
        if (!walletClient.account) {
          throw new Error("Wallet account not found. Please reconnect your wallet.");
        }

        console.log("💳 Using x402-fetch to handle payment automatically...");
        console.log("   This will:");
        console.log("   1. Get 402 response from server");
        console.log("   2. Request USDC permit signature from your wallet");
        console.log("   3. Send permit to CDP facilitator");
        console.log("   4. Retry request with payment proof");
        
        const userAddress = walletClient.account.address;
        console.log(`Using wallet address: ${userAddress}`);
            
        // Wrap fetch with x402 payment handling
        // maxValue: 5_000_000 = 5 USDC (6 decimals)
        // @ts-ignore - viem version mismatch between dependencies
        const fetchWithPayment = wrapFetchWithPayment(fetch, walletClient, BigInt(5_000_000));
        
        // x402-fetch automatically handles the entire payment flow
        // Server-side manual verification (EIP-2612 USDC Permit)
        response = await fetchWithPayment("/api/mint-permit-v2", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            wallet,
            x_user_id: userId,
          }),
        });
      }

      console.log("✅ Mint permit response received, parsing...");

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        console.error("Mint permit failed:", errorData);

        if (paymentReady && response.status === 402) {
          setPaymentReady(false);
        }

        throw new Error(errorData.error || errorData.message || "Failed to get mint permit");
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
        errorMessage += "\n\nPlease ensure you have at least 5 USDC and some ETH for gas on Base Mainnet.";
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
      const expectedAddress = "0x7De68EB999A314A0f986D417adcbcE515E476396";
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

        // 🔗 REFERRAL TRACKING: Check pending_referrals table for this user's x_user_id
        try {
          if (xUser && xUser.x_user_id) {
            console.log("🔍 Checking for pending referral for x_user_id:", xUser.x_user_id);
            
            const trackResponse = await fetch("/api/referrals/track-by-x-user", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                x_user_id: xUser.x_user_id,
                wallet: wallet.toLowerCase(),
              }),
            });
            
            const trackResult = await trackResponse.json();
            console.log("✅ Referral tracking response:", trackResult);
            
            if (trackResponse.ok && trackResult.success) {
              console.log("🎉 Referral successfully tracked and rewarded!");
              // Clear localStorage and cookie
              localStorage.removeItem("referralCode");
              document.cookie = "referralCode=; path=/; max-age=0";
            } else {
              console.log("ℹ️ No pending referral found or already processed");
            }
          } else {
            console.log("ℹ️ No X user data available for referral tracking");
          }
        } catch (refError) {
          console.error("❌ Referral tracking error:", refError);
        }
        
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
      setPaymentReady(false);
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
    <div className="min-h-screen bg-white dark:bg-black">
      {/* Navbar - Top */}
      <nav className="bg-white dark:bg-black border-b border-gray-200 dark:border-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Logo */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <img 
                src="/frora-logo.png" 
                alt="XFRORA Logo" 
                className="w-10 h-10 rounded-full object-cover"
              />
              <span className="text-xl font-bold text-gray-800 uppercase dark:text-slate-100">XFRORA</span>
            </div>
            
            {/* Right: User Info & Buttons */}
            <div className="flex items-center gap-2 sm:gap-3 w-full md:w-auto justify-end">
              <ThemeToggle />
              <Link
                href="/yama-agent"
                onClick={() => setYamaAgentLoading(true)}
                className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-black/40 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors font-semibold disabled:opacity-50"
              >
                {yamaAgentLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Loading...
                  </>
                ) : (
                  'Yama Agent'
                )}
              </Link>
              
              {/* Credits & Points Display (only when wallet connected) */}
              {isConnected && address && (
                <div className="flex items-center gap-2">
                  {/* Credits */}
                  <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 border border-gray-200 dark:border-gray-800 rounded-full bg-white dark:bg-black">
                    <div className="w-1.5 h-1.5 bg-black dark:bg-white rounded-full"></div>
                    <span className="text-xs sm:text-sm font-semibold text-black dark:text-white whitespace-nowrap">
                      {tokenBalance !== null ? tokenBalance.toLocaleString('en-US') : '0'} credits
                    </span>
                  </div>
                  
                  {/* Points */}
                  <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 border border-yellow-400 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 rounded-full">
                    <div className="w-1.5 h-1.5 bg-black dark:bg-white rounded-full"></div>
                    <span className="text-xs sm:text-sm font-semibold text-black dark:text-white whitespace-nowrap">
                      {points.toLocaleString('en-US')} points
                    </span>
                  </div>
                </div>
              )}
              
              {/* Dropdown Menu */}
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors font-semibold"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                  <span>Menu</span>
                </button>

                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-black border border-gray-200 dark:border-gray-800 shadow-lg z-50">
                    <a
                      href="https://opensea.io/collection/xfrora"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors text-black dark:text-white"
                      onClick={() => setMenuOpen(false)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/opensea-icon.png" alt="OpenSea" className="w-5 h-5" />
                      <span>OpenSea</span>
                    </a>
                    
                    <a
                      href="https://x.com/XFroraNFT"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors text-black dark:text-white"
                      onClick={() => setMenuOpen(false)}
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                      <span>Follow on X</span>
                    </a>
                    
                    <Link
                      href="/social"
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors text-black dark:text-white"
                      onClick={() => setMenuOpen(false)}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      <span>Social</span>
                    </Link>
                    
                    <Link
                      href="/leaderboard"
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors text-black dark:text-white"
                      onClick={() => setMenuOpen(false)}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                      </svg>
                      <span>Leaderboard</span>
                    </Link>

                    <Link
                      href="/referrals"
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors text-black dark:text-white"
                      onClick={() => setMenuOpen(false)}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7H7m6 4H7m6 4H7m6-8h4m-4 4h4m-4 4h4M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" />
                      </svg>
                      <span>Referrals</span>
                    </Link>
                    
                    {isConnected && address && (
                      <button
                        onClick={() => {
                          setShowPaymentModal(true);
                          setMenuOpen(false);
                        }}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors text-black dark:text-white w-full text-left"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Credits</span>
                      </button>
                    )}
                    
                    <button
                      onClick={() => {
                        setChatbotOpen(true);
                        setMenuOpen(false);
                      }}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors text-black dark:text-white w-full text-left"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      <span>Chat</span>
                    </button>
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                {xUser && (
                  <div className="hidden md:flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-full text-sm dark:bg-slate-800 dark:text-slate-100">
                    <span className="text-gray-700 dark:text-slate-100">@{xUser.username}</span>
                  </div>
                )}

                <div className="flex">
                  <ConnectButton.Custom>
                    {({
                      account,
                      chain,
                      openAccountModal,
                      openChainModal,
                      openConnectModal,
                      mounted,
                    }: {
                      account?: any;
                      chain?: any;
                      openAccountModal: () => void;
                      openChainModal: () => void;
                      openConnectModal: () => void;
                      mounted: boolean;
                    }) => {
                      const ready = mounted;
                      const connected =
                        ready && account && chain && !chain.unsupported;

                      if (!connected) {
                        return (
                          <button
                            onClick={openConnectModal}
                            className="btn-primary px-4 py-2 text-sm"
                          >
                            Connect Wallet
                          </button>
                        );
                      }

                      if (chain.unsupported) {
                        return (
                          <button
                            onClick={openChainModal}
                            className="btn-primary px-4 py-2 text-sm"
                          >
                            Switch Network
                          </button>
                        );
                      }

                      return (
                        <button
                          onClick={openAccountModal}
                          className="btn-secondary px-4 py-2 text-sm"
                        >
                          {account?.displayName ?? "Wallet"}
                        </button>
                      );
                    }}
                  </ConnectButton.Custom>
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>
      
      <div className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <Hero xUser={xUser} mintStats={mintStats} loadingStats={statsLoading} />
        
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
                  <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setStep("generate")}
                    className="btn-secondary w-full"
                  >
                    ✓ Connected
                  </button>
                    <button
                      onClick={disconnectX}
                      className="px-4 py-2 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors w-full"
                    >
                      Disconnect
                    </button>
                  </div>
                )
              }
            />

            {/* Card 2: Connect Wallet */}
            <StepCard
              icon="wallet"
              title="Connect Wallet"
              status={isConnected ? "connected" : "idle"}
              statusText={isConnected && wallet ? `Wallet Connected: ${wallet.substring(0, 6)}...${wallet.substring(wallet.length - 4)}` : undefined}
              actionButton={
                <ConnectButton.Custom>
                  {({
                    account,
                    chain,
                    openAccountModal,
                    openChainModal,
                    openConnectModal,
                    authenticationStatus,
                    mounted,
                  }: {
                    account?: any;
                    chain?: any;
                    openAccountModal: () => void;
                    openChainModal: () => void;
                    openConnectModal: () => void;
                    authenticationStatus?: string;
                    mounted: boolean;
                  }) => {
                    const ready = mounted && authenticationStatus !== "loading";
                    const connected =
                      ready &&
                      account &&
                      chain &&
                      (!authenticationStatus || authenticationStatus === "authenticated");

                    if (!ready) {
                      return (
                        <button className="btn-secondary w-full" disabled>
                          Loading...
                        </button>
                      );
                    }

                    if (!connected) {
                      return (
                  <button
                          onClick={openConnectModal}
                    className="btn-primary w-full"
                          disabled={loading}
                  >
                    {loading ? "Connecting..." : "Connect Wallet"}
                  </button>
                      );
                    }

                    if (chain.unsupported) {
                      return (
                        <button
                          onClick={openChainModal}
                          className="btn-primary w-full"
                        >
                          Switch Network
                        </button>
                      );
                    }

                    return (
                      <button
                        onClick={openAccountModal}
                        className="btn-secondary w-full"
                      >
                    ✓ {account?.displayName ?? "Connected"}
                  </button>
                    );
                  }}
                </ConnectButton.Custom>
              }
            />

            {/* Card 3: Generate */}
            <StepCard
              icon="nft"
              title="Generate"
              status={generated ? "completed" : "idle"}
              statusText={generated ? "NFT Generated!" : undefined}
              actionButton={
                !generated ? (
                  <button
                    onClick={generateNFT}
                    disabled={loading || !xUser || !wallet}
                    className="btn-primary w-full"
                  >
                    {loading ? "Generating..." : "Generate xFrora NFT"}
                  </button>
                ) : (
                  <button className="btn-secondary w-full" disabled>
                    ✓ Generated
                  </button>
                )
              }
            >
              {loading && !generated && <GenerationProgress />}
            </StepCard>
          </div>
        </div>
        
        {/* NFT Preview - Show after generation */}
        {generated && !alreadyMinted && (
          <div className="max-w-4xl mx-auto mb-12 animate-fade-in">
            <div className="card text-center">
              <h3 className="text-2xl font-bold mb-4 text-gray-800">Your xFrora NFT</h3>
              
              {paymentReady && (
                <div className="mb-4 border border-yellow-400 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 px-4 py-2 text-sm text-black dark:text-white">
                  Payment received! Click &quot;Complete Mint&quot; to finish on-chain minting.
                </div>
              )}
              
              {/* NFT Image */}
              <div className="max-w-md mx-auto mb-6 relative overflow-hidden rounded-lg">
                {generated.preview || generated.imageUrl ? (
                  <>
                    <img
                      src={
                        generated.preview 
                          ? generated.preview.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/")
                          : generated.imageUrl 
                          ? generated.imageUrl.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/")
                          : ""
                      }
                      alt="Generated NFT"
                      className={`w-full rounded-lg shadow-2xl transition-all duration-700 ${
                        !alreadyMinted ? "blur-2xl brightness-75 scale-110" : "scale-100"
                      }`}
                      onError={(e) => {
                        console.error("Image load error:", e);
                        // Try alternative IPFS gateway
                        const currentSrc = e.currentTarget.src;
                        if (currentSrc.includes("gateway.pinata.cloud")) {
                          e.currentTarget.src = currentSrc.replace("gateway.pinata.cloud", "ipfs.io");
                        } else if (currentSrc.includes("ipfs.io")) {
                          e.currentTarget.src = currentSrc.replace("ipfs.io", "cloudflare-ipfs.com");
                        } else {
                          // Show placeholder if all gateways fail
                          e.currentTarget.style.display = "none";
                          const placeholder = e.currentTarget.parentElement?.querySelector(".image-placeholder");
                          if (placeholder) {
                            (placeholder as HTMLElement).style.display = "flex";
                          }
                        }
                      }}
                    />
                    
                    {!alreadyMinted && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/10">
                        <div className="bg-black/40 backdrop-blur-sm p-3 rounded-full border border-white/30 text-white mb-2 shadow-lg">
                          <span className="text-2xl">🔒</span>
                        </div>
                        <p className="text-white font-bold text-base drop-shadow-lg bg-black/30 px-3 py-1 rounded-full backdrop-blur-sm">
                          Mint to Reveal
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full aspect-square rounded-lg bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 flex items-center justify-center">
                    <span className="text-6xl">🎨</span>
                  </div>
                )}
                {/* Placeholder for error state */}
                <div className="image-placeholder hidden w-full aspect-square rounded-lg bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 items-center justify-center">
                  <span className="text-6xl">🎨</span>
                </div>
              </div>
              
              {/* Traits */}
              {generated.traits && (
                <div className="text-left max-w-md mx-auto border border-gray-200 dark:border-gray-800 p-4 mb-6">
                  <h4 className="font-semibold mb-2 text-black dark:text-white">Traits:</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{generated.traits.description}</p>
                </div>
              )}
              
              {/* Mint Button - Below Image */}
              <div className="mt-6">
                <button
                  onClick={requestMintPermit}
                  disabled={loading}
                  className="btn-primary w-full max-w-md mx-auto"
                >
                  {loading
                    ? "Minting..."
                    : paymentReady
                    ? "Complete Mint"
                    : "Mint on Base (5 USDC)"}
                </button>
                <p className="mt-3 text-xs text-gray-500 dark:text-slate-400">
                  {paymentReady
                    ? "Payment confirmed · Step 2: Approve the mint transaction"
                    : "Step 1: Approve 5 USDC payment · Step 2: Confirm mint transaction"}
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* Success Screen */}
        {step === "mint" && alreadyMinted && (
          <div className="max-w-4xl mx-auto animate-fade-in">
            <div className="card text-center">
              <div className="text-6xl mb-4">🎉</div>
              <h2 className="text-3xl font-bold mb-4 text-gray-800 dark:text-gray-200">Success!</h2>
              <p className="text-lg mb-6 text-gray-700 dark:text-gray-300">Your xFrora NFT has been minted!</p>
              
              {mintedTokenId && (
                <div className="mb-6">
                  <p className="text-2xl font-bold text-black dark:text-white">Token #{mintedTokenId}</p>
                </div>
              )}
              
              {/* Before & After Comparison */}
              {(generated?.preview || generated?.imageUrl) && xUser && (
                <div className="mb-8">
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-8">
                    {/* X Profile Photo */}
                    <div className="flex flex-col items-center">
                      <div className="relative">
                        <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-full overflow-hidden border-4 border-gray-300 dark:border-gray-700 shadow-xl">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={xUser.profile_image_url.replace('_normal', '_400x400')}
                            alt={`@${xUser.username}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 bg-white dark:bg-gray-800 px-3 py-1 rounded-full shadow-lg border-2 border-black dark:border-white">
                          <p className="text-sm font-bold text-black dark:text-white">@{xUser.username}</p>
                        </div>
                      </div>
                      <p className="mt-6 text-sm text-gray-600 dark:text-gray-400 font-semibold">Your X Profile</p>
                    </div>

                    {/* Arrow */}
                    <div className="text-4xl text-gray-400 dark:text-gray-600 rotate-90 sm:rotate-0">
                      →
                    </div>

                    {/* Minted NFT */}
                    <div className="flex flex-col items-center">
                      <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-lg overflow-hidden border-4 border-green-500 dark:border-green-400 shadow-2xl">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={(generated.imageUrl || generated.preview || "").replace("ipfs://", "https://gateway.pinata.cloud/ipfs/")}
                          alt="Minted NFT"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            console.error("Minted image load error:", e);
                            if (generated.preview && e.currentTarget.src !== generated.preview) {
                              e.currentTarget.src = generated.preview.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/");
                            }
                          }}
                        />
                      </div>
                      <p className="mt-6 text-sm text-gray-600 dark:text-gray-400 font-semibold">Your xFrora NFT</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Fallback: Only NFT if no X profile */}
              {(generated?.preview || generated?.imageUrl) && !xUser && (
                <div className="max-w-sm mx-auto mb-6">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
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
                {env.NEXT_PUBLIC_CONTRACT_ADDRESS && (
                  <a
                    href={mintedTokenId
                      ? `https://opensea.io/assets/base/${env.NEXT_PUBLIC_CONTRACT_ADDRESS}/${mintedTokenId}`
                      : `https://opensea.io/assets/base/${env.NEXT_PUBLIC_CONTRACT_ADDRESS}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`btn-primary flex items-center justify-center gap-2 ${
                      mintedTokenId ? "" : "opacity-80"
                    }`}
                  >
                    <span className="text-xl">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/opensea-icon.png" alt="OpenSea icon" className="w-5 h-5" />
                    </span>
                    {mintedTokenId ? `View on OpenSea` : "View Collection on OpenSea"}
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
                
                {/* Share on X */}
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                    `I just minted my xFrora NFT on @XFroraNFT! 🚀✨\n\nView it on Base: https://opensea.io/assets/base/${env.NEXT_PUBLIC_CONTRACT_ADDRESS}/${mintedTokenId ?? ""}\nMint yours here: ${typeof window !== "undefined" ? window.location.origin : "https://xfroranft.xyz"}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary flex items-center justify-center gap-2"
                >
                  <span className="text-xl">𝕏</span>
                  Share on X
                </a>
                
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
        
        {/* Intro Animation */}
        <div className="max-w-4xl mx-auto mb-16 px-4">
          <div className="relative rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
            <video
              ref={introVideoRef}
              src="/xfrora-intro.mp4"
              className="w-full h-full object-cover"
              autoPlay
              muted
              playsInline
              controls={false}
              loop={false}
              onClick={(event) => {
                const vid = event.currentTarget;
                vid.currentTime = 0;
                const promise = vid.play();
                if (promise !== undefined) {
                  promise.catch(() => {
                    // Autoplay prevented; ignore
                  });
                }
              }}
              onEnded={(event) => event.currentTarget.pause()}
              onError={(event) => {
                console.error("Intro video failed to load", event);
              }}
            />
            <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-white/40" />
          </div>
        </div>
        
        {/* Example Creations - xFrora Examples */}
        <PreviousCreations />
        
        {/* Footer */}
        <footer className="mt-16 py-8 border-t border-gray-300">
          <div className="container mx-auto px-4">
            <p className="text-center text-gray-600 text-sm">
              Your digital identity is reborn as an AI work of art. Developed using{" "}
              <a
                href="https://x.com/daydreamsagents"
                target="_blank"
                rel="noopener noreferrer"
                className="text-black dark:text-white hover:underline font-semibold"
              >
                Daydreams infrastructure
              </a>
              . Generated instantly via x402 Protocol.{" "}
              <a
                href="https://base.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-black dark:text-white hover:underline font-semibold"
              >
                @base
              </a>
              .
            </p>
          </div>
        </footer>
      </div>
      
      {/* Chatbot Modal */}
      <Chatbot
        isOpen={chatbotOpen}
        onClose={() => setChatbotOpen(false)}
        walletAddress={wallet}
      />

      {/* Payment Modal */}
      {showPaymentModal && (
        <PaymentModal
          onClose={() => setShowPaymentModal(false)}
          onPaymentSuccess={() => {
            setShowPaymentModal(false);
            // Refresh token balance and points after successful payment
            if (address) {
              fetchTokenBalanceAndPoints(address);
            }
          }}
          walletAddress={address ? address : null}
        />
      )}
        
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
                      : "bg-black dark:bg-white text-white dark:text-black hover:bg-gray-900 dark:hover:bg-gray-100"
                  } font-bold py-3 px-6 rounded-lg w-full border border-black dark:border-white transition-colors`}
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
                <div className="mb-6 p-4 border border-gray-200 dark:border-gray-800 rounded-lg">
                  <p className="text-sm mb-3">Connect your wallet to mint your NFT</p>
                  <div className="w-full">
                    <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false} />
                  </div>
                </div>
              )}
              
              {wallet && (
                <div className="mb-6 border border-gray-200 dark:border-gray-800 rounded-lg p-3 text-sm">
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
                      <div className="border border-yellow-400 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-8 text-center">
                        <p className="text-black dark:text-white mb-2">⚠️ Mock Mode - Image Not Pinned to IPFS</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
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
                    <div key={key} className="border border-gray-200 dark:border-gray-800 p-3 rounded">
                      <div className="font-semibold capitalize text-black dark:text-white">{key}</div>
                      <div className="text-gray-600 dark:text-gray-400">{value}</div>
                    </div>
                  ))}
                </div>
                
                <div className="p-3 border border-gray-200 dark:border-gray-800 rounded-lg text-xs">
                  <p><strong>Seed:</strong> {generated.seed}</p>
                  <p className="mt-1"><strong>Metadata:</strong> {generated.metadataUrl}</p>
                </div>
              </div>
              {alreadyMinted ? (
                <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-6 text-center">
                  <p className="text-black dark:text-white text-lg font-bold mb-2">✅ Already Minted!</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    You have already minted your NFT with this X profile.
                    <br />
                    Each X profile can only mint one NFT.
                  </p>
                  {mintedTokenId && (
                    <p className="text-xs text-gray-500 dark:text-gray-500">
                      Token ID: #{mintedTokenId}
                    </p>
                  )}
                </div>
              ) : (
              <button
                onClick={requestMintPermit}
                disabled={loading || !wallet}
                className="bg-black dark:bg-white text-white dark:text-black hover:bg-gray-900 dark:hover:bg-gray-100 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed font-bold py-3 px-6 rounded-lg w-full border border-black dark:border-white transition-colors"
              >
                  {loading ? "Processing..." : !wallet ? "Connect Wallet to Mint" : "Mint NFT (5 USDC)"}
              </button>
              )}
            </div>
          )}
          
          {step === "mint" && generated && (
            <div className="bg-white/10 backdrop-blur-lg rounded-lg p-8">
              {/* Success Header */}
              <div className="text-center mb-6">
                <div className="text-6xl mb-4">🎉</div>
                <h2 className="text-3xl font-bold mb-2">
                  {mintedTokenId ? `xFrora #${mintedTokenId}` : "Congratulations!"}
                </h2>
                <p className="text-lg text-gray-300">
                  Your xFrora NFT has been minted successfully on Base.
                </p>
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
                    <div className="absolute inset-0 bg-black/20 dark:bg-white/20 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                ) : null}
              </div>
              
              {/* Token Info */}
              <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 mb-6 space-y-3">
                {mintedTokenId && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">Token ID:</span>
                    <span className="font-mono font-bold text-black dark:text-white">#{mintedTokenId}</span>
                  </div>
                )}
                {transactionHash && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">Transaction:</span>
                    <a 
                      href={`https://basescan.org/tx/${transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-sm text-black dark:text-white hover:underline truncate max-w-[200px]"
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
                  href={`https://opensea.io/assets/base/${env.NEXT_PUBLIC_CONTRACT_ADDRESS}/${mintedTokenId || ""}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full bg-black dark:bg-white text-white dark:text-black hover:bg-gray-900 dark:hover:bg-gray-100 font-bold py-4 px-6 rounded-lg text-center transition-colors flex items-center justify-center gap-2 border border-black dark:border-white"
                >
                  <img src="/opensea-icon.png" alt="OpenSea icon" className="w-6 h-6" />
                  View on OpenSea
                </a>
                
                {/* BaseScan Link */}
                {transactionHash && (
                  <a
                    href={`https://basescan.org/tx/${transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full bg-white dark:bg-black text-black dark:text-white hover:bg-gray-50 dark:hover:bg-gray-900 font-bold py-3 px-6 rounded-lg text-center transition-colors border border-gray-200 dark:border-gray-800"
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
                  className="block w-full bg-black dark:bg-white text-white dark:text-black hover:bg-gray-900 dark:hover:bg-gray-100 font-bold py-3 px-6 rounded-lg text-center transition-colors border border-black dark:border-white"
                >
                  ✨ Create Another NFT
                </button>
                
                {/* Return to Home Button */}
                <button
                  onClick={resetToHome}
                  className="block w-full bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 px-6 rounded-lg text-center transition-colors"
                >
                  🏠 Back to Home
                </button>
              </div>
              
              {/* Share Message */}
              <div className="mt-6 text-center text-sm text-gray-400">
                <p>Share your xFrora with the world! 🚀</p>
              </div>
            </div>
          )}
        </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center">
        <div className="text-black dark:text-white text-xl">Loading...</div>
      </div>
    }>
      <HomePageContent />
    </Suspense>
  );
}

