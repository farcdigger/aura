"use client";

import { useState, useEffect, useRef } from "react";
import { useAccount, useWalletClient } from "wagmi";
import PaymentModal from "@/components/PaymentModal";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ChatbotProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string | null;
}

type ChatMode = "chat" | "image";

interface ImageResult {
  id: string;
  prompt: string;
  imageUrl: string;
  createdAt: Date;
}

const IMAGE_CREDIT_COST = 80_000;
const IMAGE_POINTS_REWARD = 40;
const MAX_IMAGE_RESULTS = 8;

export default function Chatbot({ isOpen, onClose, walletAddress }: ChatbotProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [points, setPoints] = useState<number>(0);
  const [hasNFT, setHasNFT] = useState<boolean | null>(null);
  const [checkingNFT, setCheckingNFT] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [nftTraits, setNftTraits] = useState<any | null>(null);
  const [nftImage, setNftImage] = useState<string | null>(null);
  const [mode, setMode] = useState<ChatMode>("chat");
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageResults, setImageResults] = useState<ImageResult[]>([]);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const modeButtons: { key: ChatMode; label: string }[] = [
    { key: "chat", label: "Chat" },
    { key: "image", label: "Images" },
  ];
  const showModeToggle = true;

  const getStorageKey = (wallet: string | null) => {
    if (!wallet) return null;
    return `chatbot_messages_${wallet.toLowerCase()}`;
  };

  const getImageStorageKey = (wallet: string | null) => {
    if (!wallet) return null;
    return `chatbot_images_${wallet.toLowerCase()}`;
  };

  const loadMessagesFromStorage = (wallet: string | null) => {
    if (typeof window === "undefined" || !wallet) return [];
    
    try {
      const storageKey = getStorageKey(wallet);
      if (!storageKey) return [];
      
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        }));
      }
    } catch (error) {
      console.error("Error loading messages from localStorage:", error);
    }
    return [];
  };

  const saveMessagesToStorage = (wallet: string | null, msgs: Message[]) => {
    if (typeof window === "undefined" || !wallet) return;
    
    try {
      const storageKey = getStorageKey(wallet);
      if (!storageKey) return;
      
      localStorage.setItem(storageKey, JSON.stringify(msgs));
    } catch (error) {
      console.error("Error saving messages to localStorage:", error);
    }
  };

  const loadImageResultsFromStorage = (wallet: string | null) => {
    if (typeof window === "undefined" || !wallet) return [];
    
    try {
      const storageKey = getImageStorageKey(wallet);
      if (!storageKey) return [];
      
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.map((img: any) => ({
          ...img,
          createdAt: new Date(img.createdAt),
        })).slice(0, MAX_IMAGE_RESULTS);
      }
    } catch (error) {
      console.error("Error loading image results from localStorage:", error);
    }
    return [];
  };

  const saveImageResultsToStorage = (wallet: string | null, images: ImageResult[]) => {
    if (typeof window === "undefined" || !wallet) return;
    
    try {
      const storageKey = getImageStorageKey(wallet);
      if (!storageKey) return;
      
      localStorage.setItem(storageKey, JSON.stringify(images.slice(0, MAX_IMAGE_RESULTS)));
    } catch (error) {
      console.error("Error saving image results to localStorage:", error);
    }
  };

  useEffect(() => {
    if (walletAddress) {
      const loadedMessages = loadMessagesFromStorage(walletAddress);
      setMessages(loadedMessages);
      const loadedImages = loadImageResultsFromStorage(walletAddress);
      setImageResults(loadedImages);
    } else {
      setMessages([]);
      setImageResults([]);
    }
    setImagePrompt("");
    setImageError(null);
  }, [walletAddress]);

  useEffect(() => {
    if (walletAddress && messages.length > 0) {
      saveMessagesToStorage(walletAddress, messages);
    }
  }, [messages, walletAddress]);

  useEffect(() => {
    if (walletAddress && imageResults.length > 0) {
      saveImageResultsToStorage(walletAddress, imageResults);
    }
  }, [imageResults, walletAddress]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  useEffect(() => {
    if (isOpen && walletAddress) {
      fetchTokenBalance();
    }
  }, [isOpen, walletAddress]);

  useEffect(() => {
    if (tokenBalance !== null && tokenBalance > 0) {
      setHasNFT(true);
      setCheckingNFT(false);
      if (walletAddress && !nftImage) {
        fetchNftImage();
      }
    } else if (tokenBalance === 0) {
      setHasNFT(false);
      setCheckingNFT(false);
    }
  }, [tokenBalance]);

  const fetchTokenBalance = async () => {
    if (!walletAddress) return;
    try {
      const response = await fetch(`/api/chat/token-balance?wallet=${walletAddress}&t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        console.error("Failed to fetch token balance:", response.status);
        return;
      }
      const data = await response.json();
      setTokenBalance(data.balance ?? null);
      setPoints(data.points ?? 0);
    } catch (error) {
      console.error("Error fetching token balance:", error);
    }
  };

  const fetchNftImage = async () => {
    if (!walletAddress) return;
    try {
      const storedXUser = localStorage.getItem("xUser");
      const xUserId = storedXUser ? JSON.parse(storedXUser).x_user_id : null;
      
      const queryParam = xUserId 
        ? `x_user_id=${xUserId}` 
        : `wallet=${walletAddress}`;
      
      const response = await fetch(`/api/nft-image?${queryParam}&t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (response.ok) {
        const data = await response.json();
        if (data.hasNFT && data.imageUrl) {
          setNftImage(data.imageUrl);
          console.log("[chatbot] NFT image loaded:", walletAddress.substring(0, 10));
        } else {
          console.log("[chatbot] No NFT image found:", walletAddress.substring(0, 10));
        }
      } else {
        console.log("[chatbot] NFT image API failed");
      }
    } catch (error) {
      console.error("[chatbot] Error fetching NFT image:", error);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || loading || !walletAddress || (tokenBalance !== null && tokenBalance <= 0)) return;

    const userMessage: Message = {
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          message: userMessage.content,
          conversationHistory: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          nftTraits: nftTraits,
        }),
      });

      if (response.status === 402) {
        setShowPaymentModal(true);
        setMessages((prev) => prev.slice(0, -1));
        return;
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      const assistantMessage: Message = {
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setTokenBalance(data.newBalance || 0);
      if (data.points !== undefined) {
        setPoints(data.points);
      }
      
      if (data.newBalance <= 0) {
        setShowPaymentModal(true);
      }
    } catch (error: any) {
      console.error("Error sending message:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: `Sorry, I encountered an error: ${error.message || "Failed to send message"}. Please try again.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!walletAddress || !imagePrompt.trim() || imageLoading) {
      return;
    }

    if (tokenBalance !== null && tokenBalance < IMAGE_CREDIT_COST) {
      setImageError(`You need at least ${IMAGE_CREDIT_COST.toLocaleString("en-US")} credits to generate an image.`);
      setShowPaymentModal(true);
      return;
    }

    setImageLoading(true);
    setImageError(null);

    try {
      const response = await fetch("/api/chat/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          prompt: imagePrompt.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        if (response.status === 402) {
          setShowPaymentModal(true);
          setImageError("You need more credits. Please top up to continue.");
          return;
        }

        if (data.providerPaymentRequired) {
          setImageError("Image generation is temporarily unavailable. Please try again later.");
          return;
        }

        throw new Error(data.error || "Failed to generate image.");
      }

      if (!data.imageUrl) {
        throw new Error("Image URL missing from response.");
      }

      const newResult: ImageResult = {
        id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`,
        prompt: imagePrompt.trim(),
        imageUrl: data.imageUrl,
        createdAt: new Date(),
      };

      const updatedResults = [newResult, ...imageResults].slice(0, MAX_IMAGE_RESULTS);
      setImageResults(updatedResults);
      setImagePrompt("");

      if (typeof data.newBalance === "number") {
        setTokenBalance(data.newBalance);
      } else {
        fetchTokenBalance();
      }

      if (typeof data.points === "number") {
        setPoints(data.points);
      }
    } catch (error: any) {
      console.error("Error generating image:", error);
      setImageError(error?.message || "Failed to generate image. Please try again.");
    } finally {
      setImageLoading(false);
    }
  };

  const handleNewChat = () => {
    if (mode === "chat") {
      // Clear only chat messages
    setMessages([]);
    if (walletAddress) {
      const storageKey = getStorageKey(walletAddress);
      if (storageKey) {
        try {
          localStorage.removeItem(storageKey);
        } catch (error) {
          console.error("Error clearing messages from localStorage:", error);
        }
      }
    }
    } else if (mode === "image") {
      // Clear only image results
      setImageResults([]);
      setImagePrompt("");
      if (walletAddress) {
        const imageStorageKey = getImageStorageKey(walletAddress);
        if (imageStorageKey) {
          try {
            localStorage.removeItem(imageStorageKey);
          } catch (error) {
            console.error("Error clearing image results from localStorage:", error);
          }
        }
      }
    }
    fetchTokenBalance();
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleDownloadImage = (imageUrl: string, prompt: string) => {
    try {
      // Extract base64 data from data URL
      const base64Data = imageUrl.split(',')[1] || imageUrl;
      
      // Convert base64 to blob
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/png' });
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Create filename from prompt (sanitize and limit length)
      const sanitizedPrompt = prompt
        .replace(/[^a-z0-9]/gi, '_')
        .substring(0, 50)
        .toLowerCase();
      const timestamp = new Date().toISOString().split('T')[0];
      link.download = `xfrora-image-${sanitizedPrompt}-${timestamp}.png`;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading image:", error);
      // Fallback: open in new tab
      window.open(imageUrl, '_blank');
    }
  };

  const renderLoadingState = () => (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <div className="w-16 h-16 border-4 border-black dark:border-white border-t-transparent rounded-full animate-spin mb-4"></div>
      <p className="text-gray-600 dark:text-slate-400">Loading...</p>
      <p className="text-xs text-gray-400 dark:text-slate-500 mt-2">
        {walletAddress?.substring(0, 6)}...{walletAddress?.substring(38)}
      </p>
    </div>
  );

  const renderNoCreditsState = () => (
    <div className="flex flex-col items-center justify-center h-full text-center p-6">
      <div className="w-20 h-20 rounded-full bg-yellow-100 dark:bg-yellow-900/20 flex items-center justify-center mb-4">
        <svg className="w-10 h-10 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100 mb-2">
        Load credits to continue
      </h3>
      <p className="text-gray-600 dark:text-slate-400 mb-4 max-w-md">
        Credit purchase requires NFT ownership verification. Load credits to start using the AI experiences.
      </p>
      <button
        onClick={() => setShowPaymentModal(true)}
        className="px-6 py-3 bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white hover:bg-gray-900 dark:hover:bg-gray-100 rounded-lg font-semibold transition-colors"
      >
        Load Credits
      </button>
      <p className="text-xs text-gray-400 dark:text-slate-500 mt-4">
        Wallet: {walletAddress?.substring(0, 6)}...{walletAddress?.substring(38)}
      </p>
    </div>
  );

  const renderImageEmptyState = () => (
    <div className="flex flex-col items-center justify-center h-full text-center p-6">
      <div className="w-24 h-24 rounded-full bg-gray-900 dark:bg-white text-white dark:text-black flex items-center justify-center mb-6 border border-gray-200 dark:border-gray-800">
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 7l3-4h12l3 4M5 7v14h14V7" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 11l2 2 4-4" />
        </svg>
      </div>
      <h3 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-2">
        Generate custom visuals
      </h3>
      <p className="text-gray-600 dark:text-slate-400 max-w-2xl">
        Describe your idea and we&apos;ll render it with Daydreams&apos; Gemini 2.5 Flash image model. Each generation costs {IMAGE_CREDIT_COST.toLocaleString("en-US")} credits and earns {IMAGE_POINTS_REWARD} points.
      </p>
    </div>
  );

  if (!isOpen) return null;

  const formatTokenBalance = (balance: number) => {
    return balance.toLocaleString('en-US');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-5xl h-[90vh] sm:h-[90vh] max-h-screen bg-white dark:bg-black flex flex-col border border-gray-200 dark:border-gray-800 overflow-hidden m-2 sm:m-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 flex-1 min-w-0">
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center overflow-hidden border-2 border-black dark:border-white flex-shrink-0 bg-black dark:bg-white">
                <img 
                  src={nftImage || "/frora-logo.png"} 
                  alt={nftImage ? "Your NFT" : "xFrora"} 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = "/frora-logo.png";
                  }}
                />
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-slate-100 truncate">
                  xFrora Chat
                </h2>
                <p className="text-xs text-gray-500 dark:text-slate-400 hidden sm:block">
                  Powered by your NFT personality
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
              {nftImage && (
                <div className="flex items-center gap-1.5 px-2 py-1 border border-gray-200 dark:border-gray-800 rounded-full bg-white dark:bg-black">
                  <img
                    src={nftImage}
                    alt="Your NFT"
                    className="w-5 h-5 sm:w-6 sm:h-6 rounded-full object-cover"
                  />
                  <span className="text-xs text-gray-600 dark:text-gray-400 pr-1 hidden sm:inline">Your NFT</span>
                </div>
              )}
              {tokenBalance !== null && (
                <>
                  <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 border border-gray-200 dark:border-gray-800 rounded-full">
                    <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-black dark:bg-white rounded-full flex-shrink-0"></div>
                    <span className="text-xs sm:text-sm font-semibold text-black dark:text-white whitespace-nowrap">
                      {formatTokenBalance(tokenBalance)} credits
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 border border-yellow-400 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 rounded-full">
                    <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-black dark:bg-white rounded-full flex-shrink-0"></div>
                    <span className="text-xs sm:text-sm font-semibold text-black dark:text-white whitespace-nowrap">
                      {points.toLocaleString('en-US')} points
                    </span>
                  </div>
                </>
              )}
            </div>
            {showModeToggle && (
              <div className="flex items-center gap-2 border-l border-gray-200 dark:border-gray-800 pl-2 sm:pl-4 flex-shrink-0">
                {modeButtons.map((button) => (
                  <button
                    key={button.key}
                    type="button"
                    onClick={() => setMode(button.key)}
                    className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-full border transition-colors whitespace-nowrap ${
                      mode === button.key
                        ? "bg-black text-white dark:bg-white dark:text-black border-black dark:border-white"
                        : "text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900"
                    }`}
                  >
                    {button.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleNewChat}
              className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-black dark:text-white bg-white dark:bg-black rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-all duration-200 border border-gray-200 dark:border-gray-800 whitespace-nowrap"
            >
              New Chat
            </button>
            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg transition-colors flex-shrink-0"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {mode === "chat" && (
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 sm:space-y-6 bg-white dark:bg-black">
          {checkingNFT ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 border-4 border-black dark:border-white border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-gray-600 dark:text-slate-400">Loading...</p>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-2">
                {walletAddress?.substring(0, 6)}...{walletAddress?.substring(38)}
              </p>
            </div>
          ) : (tokenBalance === null || tokenBalance === 0) ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <div className="w-20 h-20 rounded-full bg-yellow-100 dark:bg-yellow-900/20 flex items-center justify-center mb-4">
                <svg className="w-10 h-10 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100 mb-2">
                Load Credits to Get Started
              </h3>
              <p className="text-gray-600 dark:text-slate-400 mb-4 max-w-md">
                Credit purchase requires NFT ownership verification. Load credits to start chatting!
              </p>
              <button
                onClick={() => setShowPaymentModal(true)}
                className="px-4 sm:px-6 py-2 sm:py-3 bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white hover:bg-gray-900 dark:hover:bg-gray-100 rounded-lg font-semibold transition-colors text-sm sm:text-base"
              >
                Load Credits
              </button>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-4">
                Wallet: {walletAddress?.substring(0, 6)}...{walletAddress?.substring(38)}
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <div className="w-24 h-24 rounded-full bg-black dark:bg-white border border-black dark:border-white flex items-center justify-center mb-6">
                <svg className="w-12 h-12 text-white dark:text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-2">
                Start a conversation
              </h3>
              <p className="text-gray-600 dark:text-slate-400 max-w-md">
                Your NFT&apos;s unique personality is ready to chat! Ask anything and discover what makes your xFrora special.
              </p>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={index}
                className={`flex gap-4 ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {message.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden border-2 border-black dark:border-white bg-black dark:bg-white">
                    <img 
                      src="/frora-logo.png" 
                      alt="xFrora" 
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        if (target.parentElement) {
                          target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center text-white text-xs font-bold">xF</div>';
                        }
                      }}
                    />
                  </div>
                )}
                <div
                  className={`max-w-[75%] rounded-lg px-4 py-3 ${
                    message.role === "user"
                      ? "bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white"
                      : "bg-white dark:bg-black text-black dark:text-white border border-gray-200 dark:border-gray-800"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  <p className={`text-xs mt-2 ${message.role === "user" ? "text-gray-300 dark:text-gray-700" : "text-gray-500 dark:text-gray-400"}`}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {message.role === "user" && (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden border-2 border-black dark:border-white flex-shrink-0 bg-black dark:bg-white">
                    {nftImage ? (
                      <img 
                        src={nftImage} 
                        alt="Your NFT" 
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          if (target.parentElement) {
                            target.parentElement.innerHTML = `<div class="w-full h-full flex items-center justify-center text-white dark:text-black text-xs font-bold">${walletAddress?.substring(2, 4).toUpperCase()}</div>`;
                          }
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white dark:text-black text-sm font-bold">
                        {walletAddress?.substring(2, 4).toUpperCase()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
          {loading && (
            <div className="flex gap-4 justify-start">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden border-2 border-black dark:border-white bg-black dark:bg-white">
                <img 
                  src="/frora-logo.png" 
                  alt="xFrora" 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    if (target.parentElement) {
                      target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center text-white text-xs font-bold">xF</div>';
                    }
                  }}
                />
              </div>
              <div className="bg-white dark:bg-black rounded-lg px-4 py-3 border border-gray-200 dark:border-gray-800">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-black dark:bg-white rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-black dark:bg-white rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                  <div className="w-2 h-2 bg-black dark:bg-white rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        )}

        {mode === "image" && (
          <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 sm:space-y-6 bg-white dark:bg-black">
          {checkingNFT ? (
            renderLoadingState()
          ) : tokenBalance === null || tokenBalance < IMAGE_CREDIT_COST ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-4">
              <div className="w-20 h-20 rounded-full bg-yellow-100 dark:bg-yellow-900/20 flex items-center justify-center">
                <svg className="w-10 h-10 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100">Add credits to generate images</h3>
              <p className="text-gray-600 dark:text-slate-400 max-w-md">
                Each render costs {IMAGE_CREDIT_COST.toLocaleString("en-US")} credits (+{IMAGE_POINTS_REWARD} points). Please top up to continue.
              </p>
              <button
                onClick={() => setShowPaymentModal(true)}
                className="px-6 py-3 bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white rounded-lg font-semibold hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors"
              >
                Load Credits
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4 bg-gray-50/70 dark:bg-white/5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Model</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">gemini-2.5-flash-image</p>
                  </div>
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-semibold">
                      {IMAGE_CREDIT_COST.toLocaleString("en-US")} credits
                    </span>{" "}
                    +{IMAGE_POINTS_REWARD} points
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">
                  Powered by Daydreams Router. Describe your scene and we&apos;ll render a 1024x1024 image. Credits burn only when a generation succeeds.
                </p>
              </div>

              <div className="rounded-lg border border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20 p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex-1">
                    <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-1.5">
                      Storage Information / Depolama Bilgisi
                    </h4>
                    <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                      <strong>EN:</strong> Your generated images are stored in localStorage. Please download your images after generation, as they may be lost over time in the chat session.
                    </p>
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      <strong>TR:</strong> Ürettiğiniz görseller localStorage&apos;da saklanmaktadır. Lütfen görsellerinizi üretim sonrası indiriniz, çünkü görselleriniz zamanla chat oturumunda kaybolabilir.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <textarea
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  placeholder="Describe the scene you want to generate..."
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-black text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent resize-none text-sm sm:text-base"
                  rows={3}
                  disabled={imageLoading}
                />
                {imageError && (
                  <div className="text-sm text-red-500 dark:text-red-400">{imageError}</div>
                )}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Each generation burns {IMAGE_CREDIT_COST.toLocaleString("en-US")} credits and rewards {IMAGE_POINTS_REWARD} points.
                  </p>
                  <button
                    onClick={handleGenerateImage}
                    disabled={imageLoading || !imagePrompt.trim()}
                    className="px-4 sm:px-6 py-2 bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm sm:text-base whitespace-nowrap w-full sm:w-auto"
                  >
                    {imageLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white dark:border-black border-t-transparent rounded-full animate-spin"></span>
                        Generating...
                      </span>
                    ) : (
                      "Generate"
                    )}
                  </button>
                </div>
              </div>

              {imageResults.length === 0 ? (
                renderImageEmptyState()
              ) : (
                <div className="grid gap-6 sm:grid-cols-2">
                  {imageResults.map((result) => (
                    <div
                      key={result.id}
                      className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-black shadow-sm"
                    >
                      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-500 mb-1">Prompt</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-3">{result.prompt}</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-900">
                        <img
                          src={result.imageUrl}
                          alt={`AI generated result for ${result.prompt}`}
                          className="w-full h-auto object-cover"
                        />
                      </div>
                      <div className="flex items-center justify-between px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                        <span>{result.createdAt.toLocaleString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        <button
                          onClick={() => handleDownloadImage(result.imageUrl, result.prompt)}
                          className="flex items-center gap-1.5 text-sm font-semibold text-black dark:text-white hover:opacity-70 transition-opacity"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Download
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {imageLoading && imageResults.length > 0 && (
                <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                  <div className="w-4 h-4 border-2 border-black dark:border-white border-t-transparent rounded-full animate-spin" />
                  Generating with Daydreams...
                </div>
              )}
            </div>
          )}
          </div>
        )}

        {mode === "chat" && (hasNFT || (tokenBalance !== null && tokenBalance > 0)) && (
          <div className="p-3 sm:p-4 border-t border-gray-200 dark:border-gray-800">
              {tokenBalance !== null && tokenBalance <= 0 && (
              <div className="mb-3 p-3 border border-yellow-400 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
                  <p className="text-xs sm:text-sm text-black dark:text-white">
                    You&apos;re out of credits! Add more to continue chatting.
                  </p>
                  <button
                    onClick={() => setShowPaymentModal(true)}
                    className="px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white hover:bg-gray-900 dark:hover:bg-gray-100 rounded-lg transition-colors whitespace-nowrap w-full sm:w-auto"
                  >
                    Add Credits
                  </button>
                </div>
              </div>
            )}
            <div className="flex gap-2 sm:gap-3 items-end">
              <div className="flex-1 relative min-w-0">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={tokenBalance !== null && tokenBalance <= 0 ? "Add credits to continue..." : "Type your message..."}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 pr-10 sm:pr-12 border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-black text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent resize-none max-h-32 text-sm sm:text-base"
                  rows={1}
                  disabled={loading || (tokenBalance !== null && tokenBalance <= 0)}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
                  }}
                />
              </div>
              <button
                onClick={handleSendMessage}
                disabled={loading || !input.trim() || (tokenBalance !== null && tokenBalance <= 0)}
                className="px-4 sm:px-6 py-2 sm:py-3 bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white hover:bg-gray-900 dark:hover:bg-gray-100 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                {loading ? (
                  <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        )}

        {showPaymentModal && (
          <PaymentModal
            onClose={() => setShowPaymentModal(false)}
            onPaymentSuccess={(newBalance) => {
              setShowPaymentModal(false);
              if (newBalance !== undefined) {
                setTokenBalance(newBalance);
              } else {
                fetchTokenBalance();
              }
            }}
            walletAddress={walletAddress}
          />
        )}
      </div>
    </div>
  );
}

