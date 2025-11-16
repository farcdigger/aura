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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();

  // localStorage key for messages (per wallet address)
  const getStorageKey = (wallet: string | null) => {
    if (!wallet) return null;
    return `chatbot_messages_${wallet.toLowerCase()}`;
  };

  // Load messages from localStorage
  const loadMessagesFromStorage = (wallet: string | null) => {
    if (typeof window === "undefined" || !wallet) return [];
    
    try {
      const storageKey = getStorageKey(wallet);
      if (!storageKey) return [];
      
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Convert timestamp strings back to Date objects
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

  // Save messages to localStorage
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

  // Load messages when wallet address changes or component mounts
  useEffect(() => {
    if (walletAddress) {
      const loadedMessages = loadMessagesFromStorage(walletAddress);
      setMessages(loadedMessages);
    } else {
      setMessages([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (walletAddress && messages.length > 0) {
      saveMessagesToStorage(walletAddress, messages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, walletAddress]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  useEffect(() => {
    if (isOpen && walletAddress) {
      // Only fetch token balance - NFT check happens during token purchase
      fetchTokenBalance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, walletAddress]);

  // Update hasNFT based on token balance
  useEffect(() => {
    if (tokenBalance !== null && tokenBalance > 0) {
      setHasNFT(true);
      setCheckingNFT(false);
    } else if (tokenBalance === 0) {
      setHasNFT(false);
      setCheckingNFT(false);
    }
  }, [tokenBalance]);

  const fetchTokenBalance = async () => {
    if (!walletAddress) return;
    try {
      const response = await fetch(`/api/chat/token-balance?wallet=${walletAddress}`);
      const data = await response.json();
      setTokenBalance(data.balance || 0);
      setPoints(data.points || 0);
    } catch (error) {
      console.error("Error fetching token balance:", error);
      setTokenBalance(0);
      setPoints(0);
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
          nftTraits: nftTraits, // Send cached traits to avoid fetching on every message
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

  const handleNewChat = () => {
    setMessages([]);
    // Clear messages from localStorage
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
    fetchTokenBalance();
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isOpen) return null;

  const formatTokenBalance = (balance: number) => {
    // Show full number with thousand separators (e.g., 1,234,567)
    return balance.toLocaleString('en-US');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl h-[90vh] bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 rounded-2xl shadow-2xl flex flex-col border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden border-2 border-purple-500 flex-shrink-0 bg-gradient-to-br from-purple-500 to-blue-500">
                <img 
                  src="/frora-logo.png" 
                  alt="xFrora" 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback to text if image fails
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    if (target.parentElement) {
                      target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center text-white font-bold text-lg">xF</div>';
                    }
                  }}
                />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">
                  xFrora Chat
                </h2>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  Powered by your NFT personality
                </p>
              </div>
            </div>
            {tokenBalance !== null && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30 rounded-full">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm font-semibold text-gray-700 dark:text-slate-200">
                    {formatTokenBalance(tokenBalance)} tokens
                  </span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-yellow-100 to-orange-100 dark:from-yellow-900/30 dark:to-orange-900/30 rounded-full">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  <span className="text-sm font-semibold text-gray-700 dark:text-slate-200">
                    {points.toLocaleString('en-US')} points
                  </span>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleNewChat}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-all duration-200 border border-slate-200 dark:border-slate-600"
            >
              New Chat
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gradient-to-b from-transparent to-slate-50/50 dark:to-slate-900/50">
          {checkingNFT ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
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
                Load Tokens to Get Started
              </h3>
              <p className="text-gray-600 dark:text-slate-400 mb-4 max-w-md">
                Token purchase requires NFT ownership verification. Load tokens to start chatting!
              </p>
              <button
                onClick={() => setShowPaymentModal(true)}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl"
              >
                Load Tokens
              </button>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-4">
                Wallet: {walletAddress?.substring(0, 6)}...{walletAddress?.substring(38)}
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center mb-6 shadow-lg">
                <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden border-2 border-purple-500 bg-gradient-to-br from-purple-500 to-blue-500">
                    <img 
                      src="/frora-logo.png" 
                      alt="xFrora" 
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Fallback to text if image fails
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
                  className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                    message.role === "user"
                      ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg"
                      : "bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 shadow-md border border-slate-200 dark:border-slate-700"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  <p className={`text-xs mt-2 ${message.role === "user" ? "text-blue-100" : "text-gray-400 dark:text-slate-500"}`}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {message.role === "user" && (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                    {walletAddress?.substring(2, 4).toUpperCase()}
                  </div>
                )}
              </div>
            ))
          )}
          {loading && (
            <div className="flex gap-4 justify-start">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden border-2 border-purple-500 bg-gradient-to-br from-purple-500 to-blue-500">
                <img 
                  src="/frora-logo.png" 
                  alt="xFrora" 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback to text if image fails
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    if (target.parentElement) {
                      target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center text-white text-xs font-bold">xF</div>';
                    }
                  }}
                />
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-2xl px-4 py-3 shadow-md border border-slate-200 dark:border-slate-700">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input - show if user has token balance (means they have NFT) */}
        {(hasNFT || (tokenBalance !== null && tokenBalance > 0)) && (
          <div className="p-4 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-t border-slate-200 dark:border-slate-700">
            {tokenBalance !== null && tokenBalance <= 0 && (
              <div className="mb-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    You&apos;re out of tokens! Add more to continue chatting.
                  </p>
                  <button
                    onClick={() => setShowPaymentModal(true)}
                    className="px-4 py-1.5 text-sm font-medium bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition-colors"
                  >
                    Add Tokens
                  </button>
                </div>
              </div>
            )}
            <div className="flex gap-3 items-end">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={tokenBalance !== null && tokenBalance <= 0 ? "Add tokens to continue..." : "Type your message..."}
                  className="w-full px-4 py-3 pr-12 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none max-h-32"
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
                className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl disabled:shadow-none"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Payment Modal */}
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


