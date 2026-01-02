"use client";

import { useState, useEffect, useRef } from "react";
import { useAccount } from "wagmi";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface SagaGameGuideChatProps {
  sagaId: string;
}

export default function SagaGameGuideChat({ sagaId }: SagaGameGuideChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { address } = useAccount();

  // Load messages from localStorage
  useEffect(() => {
    if (!address) return;
    
    const storageKey = `saga_chat_${sagaId}_${address.toLowerCase()}`;
    const savedMessages = localStorage.getItem(storageKey);
    if (savedMessages) {
      try {
        const parsed = JSON.parse(savedMessages);
        setMessages(parsed.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        })));
      } catch (e) {
        console.error("Failed to load chat messages:", e);
      }
    }
  }, [sagaId, address]);

  // Save messages to localStorage
  useEffect(() => {
    if (!address || messages.length === 0) return;
    
    const storageKey = `saga_chat_${sagaId}_${address.toLowerCase()}`;
    localStorage.setItem(storageKey, JSON.stringify(messages));
  }, [messages, sagaId, address]);

  // Fetch token balance using API endpoint (same as Chatbot component)
  useEffect(() => {
    if (!address) return;
    
    const fetchBalance = async () => {
      try {
        const response = await fetch(`/api/chat/token-balance?wallet=${address}&t=${Date.now()}`, {
          cache: 'no-store',
        });
        
        if (!response.ok) {
          console.error("Failed to fetch token balance:", response.status);
          setTokenBalance(null);
          return;
        }
        
        const data = await response.json();
        setTokenBalance(data.balance || 0);
      } catch (err) {
        console.error("Error fetching balance:", err);
        setTokenBalance(null);
      }
    };
    
    fetchBalance();
    
    // Refresh balance periodically (every 30 seconds)
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, [address]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() || loading || !address) return;
    
    const userMessage: Message = {
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };
    
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);
    
    try {
      // Build conversation history (excluding system messages)
      const conversationHistory = [...messages, userMessage].map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));
      
      const response = await fetch("/api/saga/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          walletAddress: address,
          message: userMessage.content,
          conversationHistory,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to send message");
      }
      
      const data = await response.json();
      
      const assistantMessage: Message = {
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
      };
      
      setMessages((prev) => [...prev, assistantMessage]);
      
      // Refresh token balance from API after message (to get accurate balance)
      if (data.newBalance !== undefined) {
        setTokenBalance(data.newBalance);
      }
      
      // Also fetch fresh balance from API to ensure accuracy
      try {
        const balanceResponse = await fetch(`/api/chat/token-balance?wallet=${address}&t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (balanceResponse.ok) {
          const balanceData = await balanceResponse.json();
          setTokenBalance(balanceData.balance || 0);
        }
      } catch (err) {
        console.error("Error refreshing balance:", err);
      }
      
      // Show low balance warning
      if (data.lowBalance) {
        setError("Your credit balance is low. Please purchase more credits to continue.");
      }
    } catch (err: any) {
      console.error("Error sending message:", err);
      setError(err.message || "Failed to send message. Please try again.");
      
      // Remove user message on error
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  // Show button even if wallet not connected, but show message when clicked
  const handleToggleWithWalletCheck = () => {
    if (!address) {
      alert("Please connect your wallet to use the Game Guide chat.");
      return;
    }
    setIsOpen(!isOpen);
  };

  return (
    <>
      {/* Chat Toggle Button */}
      <button
        onClick={handleToggleWithWalletCheck}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-black text-white rounded-full shadow-lg hover:bg-gray-800 transition-all flex items-center justify-center border-4 border-white"
        style={{
          boxShadow: '4px 4px 0px rgba(0,0,0,1)',
          fontFamily: 'Georgia, serif'
        }}
        title={address ? "Game Guide Chat" : "Connect wallet to use Game Guide"}
      >
        {isOpen ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && address && (
        <div
          className="fixed bottom-24 right-6 z-40 w-96 h-[600px] bg-white border-4 border-black shadow-2xl flex flex-col"
          style={{
            boxShadow: '8px 8px 0px rgba(0,0,0,1)',
            fontFamily: 'Georgia, serif'
          }}
        >
          {/* Header */}
          <div className="bg-black text-white p-4 border-b-4 border-gray-800 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-lg">Game Guide</h3>
              <p className="text-xs text-gray-300">Loot Survivor 2 Assistant</p>
            </div>
            {tokenBalance !== null && (
              <div className="text-right">
                <p className="text-xs text-gray-300">Credits</p>
                <p className="font-bold">{tokenBalance.toLocaleString()}</p>
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 text-sm mt-8">
                <p className="font-bold mb-2">Welcome to Game Guide!</p>
                <p>Ask me anything about Loot Survivor 2 mechanics, strategies, or tactics.</p>
                <p className="mt-4 text-xs">Examples:</p>
                <ul className="text-xs mt-2 space-y-1 text-left">
                  <li>• "What should I prioritize in early game?"</li>
                  <li>• "Which weapon is best for Metal armor?"</li>
                  <li>• "How does the escape mechanic work?"</li>
                </ul>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      message.role === "user"
                        ? "bg-black text-white"
                        : "bg-white text-black border-2 border-black"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                    <p className={`text-xs mt-1 ${message.role === "user" ? "text-gray-300" : "text-gray-500"}`}>
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white text-black border-2 border-black rounded-lg px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black"></div>
                    <p className="text-sm">Thinking...</p>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Error Message */}
          {error && (
            <div className="px-4 py-2 bg-red-100 border-t-2 border-red-500">
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleSend} className="p-4 border-t-4 border-black bg-white">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
                placeholder="Ask about game mechanics..."
                className="flex-1 px-3 py-2 border-2 border-black text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black"
                rows={2}
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="px-4 py-2 bg-black text-white font-bold border-2 border-black hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all"
                style={{
                  boxShadow: '2px 2px 0px rgba(0,0,0,1)'
                }}
              >
                Send
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Press Enter to send, Shift+Enter for new line
            </p>
          </form>
        </div>
      )}
    </>
  );
}

