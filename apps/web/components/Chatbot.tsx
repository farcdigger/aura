"use client";

import { useState, useEffect, useRef } from "react";
import { useAccount, useWalletClient } from "wagmi";
import PaymentModal from "@/components/PaymentModal";
import { CHAT_MODES, type ChatMode as ChatModeType } from "@/lib/chat-prompts";

/**
 * Component to render message content with SVG visualization
 */
function MessageContent({ content }: { content: string }) {
  // Extract SVG code blocks
  const svgRegex = /```svg\n([\s\S]*?)```/g;
  const svgMatches = Array.from(content.matchAll(svgRegex));
  
  // Auto-expand all SVGs by default
  const [expandedSvgs, setExpandedSvgs] = useState<Set<number>>(() => {
    // Initialize with all SVGs expanded
    return new Set(svgMatches.map((_, idx) => idx));
  });
  
  // Update expanded state when content changes
  useEffect(() => {
    const matches = Array.from(content.matchAll(svgRegex));
    if (matches.length > 0) {
      setExpandedSvgs(new Set(matches.map((_, idx) => idx)));
    }
  }, [content]);
  
  // Extract Mermaid code blocks
  const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
  const mermaidMatches = Array.from(content.matchAll(mermaidRegex));
  
  // Split content by code blocks
  let parts: Array<{ type: 'text' | 'svg' | 'mermaid'; content: string; index: number }> = [];
  let lastIndex = 0;
  const allMatches = [
    ...svgMatches.map(m => ({ type: 'svg' as const, match: m })),
    ...mermaidMatches.map(m => ({ type: 'mermaid' as const, match: m }))
  ].sort((a, b) => a.match.index! - b.match.index!);
  
  allMatches.forEach(({ type, match }, idx) => {
    if (match.index! > lastIndex) {
      parts.push({ type: 'text', content: content.slice(lastIndex, match.index!), index: -1 });
    }
    parts.push({ type, content: match[1], index: idx });
    lastIndex = match.index! + match[0].length;
  });
  
  if (lastIndex < content.length) {
    parts.push({ type: 'text', content: content.slice(lastIndex), index: -1 });
  }
  
  if (parts.length === 0) {
    parts.push({ type: 'text', content, index: -1 });
  }
  
  const toggleSvg = (index: number) => {
    setExpandedSvgs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };
  
  const copySvgToClipboard = (svgContent: string) => {
    navigator.clipboard.writeText(svgContent).then(() => {
      // You could add a toast notification here
    }).catch(err => {
      console.error('Failed to copy SVG:', err);
    });
  };
  
  return (
    <div className="whitespace-pre-wrap break-words">
      {parts.map((part, idx) => {
        if (part.type === 'text') {
          return <span key={idx}>{part.content}</span>;
        }
        
        if (part.type === 'svg') {
          const svgIndex = svgMatches.findIndex(m => m[1] === part.content);
          const isExpanded = expandedSvgs.has(svgIndex);
          
          // Normalize SVG content - ensure it has <svg> tag
          let svgContent = part.content.trim();
          if (!svgContent.includes('<svg')) {
            // If no <svg> tag, wrap the content
            svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">${svgContent}</svg>`;
          } else if (!svgContent.startsWith('<svg')) {
            // If <svg> is in the middle, extract it
            const svgMatch = svgContent.match(/<svg[\s\S]*<\/svg>/);
            if (svgMatch) {
              svgContent = svgMatch[0];
            }
          }
          
          // Ensure SVG has proper attributes if missing
          if (svgContent.includes('<svg') && !svgContent.includes('xmlns')) {
            svgContent = svgContent.replace(/<svg(\s|>)/, '<svg xmlns="http://www.w3.org/2000/svg"$1');
          }
          if (svgContent.includes('<svg') && !svgContent.includes('viewBox') && !svgContent.includes('width')) {
            svgContent = svgContent.replace(/<svg(\s[^>]*)?>/, '<svg$1 viewBox="0 0 400 300" width="400" height="300">');
          }
          
          return (
            <div key={idx} className="my-4 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="bg-gray-50 dark:bg-gray-900 px-3 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">SVG Diagram</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copySvgToClipboard(svgContent)}
                    className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-gray-700 dark:text-gray-300 transition-colors"
                    title="Copy SVG code"
                  >
                    Copy
                  </button>
                  <button
                    onClick={() => toggleSvg(svgIndex)}
                    className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-gray-700 dark:text-gray-300 transition-colors"
                  >
                    {isExpanded ? 'Hide' : 'Show'} Visual
                  </button>
                </div>
              </div>
              {isExpanded && (
                <div className="p-4 bg-white dark:bg-black flex items-center justify-center min-h-[400px] max-h-[800px] overflow-auto border-b border-gray-200 dark:border-gray-800">
                  <div 
                    className="max-w-full w-full"
                    style={{ maxWidth: '100%', width: '100%' }}
                    dangerouslySetInnerHTML={{ __html: svgContent }}
                  />
                </div>
              )}
              <div className="bg-gray-900 dark:bg-gray-950 p-3 overflow-x-auto">
                <pre className="text-xs text-gray-300 dark:text-gray-400 font-mono whitespace-pre-wrap">
                  <code>{svgContent}</code>
                </pre>
              </div>
            </div>
          );
        }
        
        if (part.type === 'mermaid') {
          return (
            <div key={idx} className="my-4 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="bg-gray-50 dark:bg-gray-900 px-3 py-2 border-b border-gray-200 dark:border-gray-800">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Mermaid Diagram</span>
              </div>
              <div className="bg-gray-900 dark:bg-gray-950 p-3 overflow-x-auto">
                <pre className="text-xs text-gray-300 dark:text-gray-400 font-mono whitespace-pre-wrap">
                  <code>{`\`\`\`mermaid\n${part.content}\n\`\`\``}</code>
                </pre>
              </div>
            </div>
          );
        }
        
        return null;
      })}
    </div>
  );
}

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

type ViewMode = "chat" | "image" | "svg";

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
  const [viewMode, setViewMode] = useState<ViewMode>("chat");
  const [chatMode, setChatMode] = useState<ChatModeType>("default");
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageResults, setImageResults] = useState<ImageResult[]>([]);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [svgCode, setSvgCode] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const viewModeButtons: { key: ViewMode; label: string }[] = [
    { key: "chat", label: "Chat" },
    { key: "image", label: "Images" },
    { key: "svg", label: "SVG Viewer" },
  ];
  const showModeToggle = true;

  const getStorageKey = (wallet: string | null, mode: ChatModeType = "default") => {
    if (!wallet) return null;
    return `chatbot_messages_${wallet.toLowerCase()}_${mode}`;
  };

  const getImageStorageKey = (wallet: string | null) => {
    if (!wallet) return null;
    return `chatbot_images_${wallet.toLowerCase()}`;
  };

  const loadMessagesFromStorage = (wallet: string | null, mode: ChatModeType) => {
    if (typeof window === "undefined" || !wallet) return [];
    
    try {
      const storageKey = getStorageKey(wallet, mode);
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

  const saveMessagesToStorage = (wallet: string | null, msgs: Message[], mode: ChatModeType) => {
    if (typeof window === "undefined" || !wallet) return;
    
    try {
      const storageKey = getStorageKey(wallet, mode);
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
      const loadedMessages = loadMessagesFromStorage(walletAddress, chatMode);
      setMessages(loadedMessages);
      const loadedImages = loadImageResultsFromStorage(walletAddress);
      setImageResults(loadedImages);
    } else {
      setMessages([]);
      setImageResults([]);
    }
    setImagePrompt("");
    setImageError(null);
  }, [walletAddress, chatMode]);

  useEffect(() => {
    if (walletAddress && messages.length > 0) {
      saveMessagesToStorage(walletAddress, messages, chatMode);
    }
  }, [messages, walletAddress, chatMode]);

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
          chatMode: chatMode,
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
    if (viewMode === "chat") {
      // Clear only chat messages
      setMessages([]);
      if (walletAddress) {
        const storageKey = getStorageKey(walletAddress, chatMode);
        if (storageKey) {
          try {
            localStorage.removeItem(storageKey);
          } catch (error) {
            console.error("Error clearing messages from localStorage:", error);
          }
        }
      }
    } else if (viewMode === "image") {
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
    } else if (viewMode === "svg") {
      // Clear SVG code
      setSvgCode("");
    }
    fetchTokenBalance();
  };

  const handleChatModeChange = (newMode: ChatModeType) => {
    // Reset chat when mode changes
    setMessages([]);
    setChatMode(newMode);
    setShowModeMenu(false);
    
    // Clear localStorage for old mode
    if (walletAddress) {
      const oldStorageKey = getStorageKey(walletAddress, chatMode);
      if (oldStorageKey) {
        try {
          localStorage.removeItem(oldStorageKey);
        } catch (error) {
          console.error("Error clearing old mode messages:", error);
        }
      }
    }
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowModeMenu(false);
      }
    };

    if (showModeMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showModeMenu]);

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
        className="px-6 py-3 bg-white/20 dark:bg-black/20 backdrop-blur-xl text-gray-900 dark:text-gray-100 border border-gray-300/20 dark:border-gray-700/20 hover:bg-white/30 dark:hover:bg-black/30 rounded-xl font-medium transition-all duration-300 shadow-[0_10px_40px_rgb(0,0,0,0.12)] dark:shadow-[0_10px_40px_rgb(255,255,255,0.08)] hover:shadow-[0_15px_50px_rgb(0,0,0,0.18)] dark:hover:shadow-[0_15px_50px_rgb(255,255,255,0.12)]"
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
      <div className="w-24 h-24 rounded-full bg-white/30 dark:bg-black/30 backdrop-blur-xl text-gray-900 dark:text-gray-100 flex items-center justify-center mb-6 border border-gray-300/50 dark:border-gray-700/50 shadow-[0_10px_40px_rgb(0,0,0,0.12)] dark:shadow-[0_10px_40px_rgb(255,255,255,0.08)]">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-7xl h-[90vh] sm:h-[90vh] max-h-screen bg-white/50 dark:bg-gray-900/50 backdrop-blur-2xl flex flex-col border border-gray-200/50 dark:border-gray-800/50 overflow-hidden m-2 sm:m-0 rounded-2xl shadow-[0_25px_70px_rgb(0,0,0,0.22)] dark:shadow-[0_25px_70px_rgb(255,255,255,0.15)]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-6 border-b border-gray-200/30 dark:border-gray-800/30 bg-white/30 dark:bg-black/30 backdrop-blur-xl">
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="relative">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center overflow-hidden border-2 border-gray-300/50 dark:border-gray-700/50 flex-shrink-0 bg-gray-100/50 dark:bg-gray-800/50 shadow-[0_8px_30px_rgb(0,0,0,0.10)] dark:shadow-[0_8px_30px_rgb(255,255,255,0.06)]">
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
              </div>
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-medium text-gray-900 dark:text-gray-100 truncate">
                  xFrora Chat
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block font-light">
                  Powered by your NFT personality
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
              {nftImage && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300/30 dark:border-gray-700/30 rounded-xl bg-white/30 dark:bg-black/30 backdrop-blur-xl shadow-[0_6px_20px_rgb(0,0,0,0.08)] dark:shadow-[0_6px_20px_rgb(255,255,255,0.05)]">
                  <img
                    src={nftImage}
                    alt="Your NFT"
                    className="w-5 h-5 sm:w-6 sm:h-6 rounded-full object-cover"
                  />
                  <span className="text-xs text-gray-600 dark:text-gray-400 pr-1 hidden sm:inline font-medium">Your NFT</span>
                </div>
              )}
              {tokenBalance !== null && (
                <>
                  <div className="flex items-center gap-2 px-3 py-1.5 border border-gray-300/30 dark:border-gray-700/30 rounded-xl bg-white/30 dark:bg-black/30 backdrop-blur-xl shadow-[0_6px_20px_rgb(0,0,0,0.08)] dark:shadow-[0_6px_20px_rgb(255,255,255,0.05)]">
                    <div className="w-2 h-2 bg-gray-700 dark:bg-gray-300 rounded-full flex-shrink-0"></div>
                    <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                      {formatTokenBalance(tokenBalance)} credits
                    </span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 border border-yellow-300/30 dark:border-yellow-700/30 bg-yellow-100/30 dark:bg-yellow-900/20 rounded-xl backdrop-blur-xl shadow-[0_6px_20px_rgb(0,0,0,0.08)] dark:shadow-[0_6px_20px_rgb(255,255,255,0.05)]">
                    <div className="w-2 h-2 bg-yellow-500 dark:bg-yellow-400 rounded-full flex-shrink-0"></div>
                    <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                      {points.toLocaleString('en-US')} points
                    </span>
                  </div>
                </>
              )}
            </div>
            {showModeToggle && (
              <div className="flex items-center gap-2 border-l border-gray-200 dark:border-gray-800 pl-2 sm:pl-4 flex-shrink-0">
                {viewModeButtons.map((button) => (
                  <button
                    key={button.key}
                    type="button"
                    onClick={() => setViewMode(button.key)}
                    className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-full border transition-colors whitespace-nowrap ${
                      viewMode === button.key
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
            {/* Menu Button */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowModeMenu(!showModeMenu)}
                className="px-4 py-2 text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100 bg-white/30 dark:bg-black/30 backdrop-blur-xl rounded-xl hover:bg-white/40 dark:hover:bg-black/40 transition-all duration-300 border border-gray-300/30 dark:border-gray-700/30 whitespace-nowrap flex items-center gap-2 shadow-[0_8px_30px_rgb(0,0,0,0.10)] dark:shadow-[0_8px_30px_rgb(255,255,255,0.06)]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                <span className="hidden sm:inline">Menu</span>
              </button>
              
              {/* Dropdown Menu */}
              {showModeMenu && (
                <>
                  {/* Mobile: Full screen overlay */}
                  <div 
                    className="fixed inset-0 bg-black/50 z-40 sm:hidden"
                    onClick={() => setShowModeMenu(false)}
                  />
                  {/* Menu - Mobile: Full width from right, Desktop: Dropdown */}
                  <div className="fixed sm:absolute right-0 top-0 sm:top-auto sm:mt-2 h-full sm:h-auto w-[85vw] sm:w-64 sm:w-72 max-w-sm sm:max-w-none bg-white/50 dark:bg-gray-900/50 backdrop-blur-2xl border-l sm:border border-gray-200/50 dark:border-gray-800/50 sm:rounded-xl shadow-[0_25px_70px_rgb(0,0,0,0.22)] dark:shadow-[0_25px_70px_rgb(255,255,255,0.15)] z-50 overflow-y-auto sm:overflow-hidden">
                    <div className="p-2 sm:p-2">
                      <div className="flex items-center justify-between mb-2 sm:mb-0">
                        <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          Chat Modes
                        </div>
                        <button
                          onClick={() => setShowModeMenu(false)}
                          className="sm:hidden p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      {CHAT_MODES.map((mode) => (
                        <button
                          key={mode.key}
                          onClick={() => handleChatModeChange(mode.key)}
                          className={`w-full text-left px-3 py-2.5 rounded-xl transition-all duration-300 mb-1 ${
                            chatMode === mode.key
                              ? "bg-white/30 dark:bg-black/30 backdrop-blur-xl text-gray-900 dark:text-gray-100 border border-gray-300/30 dark:border-gray-700/30 shadow-sm"
                              : "hover:bg-white/20 dark:hover:bg-black/20 text-gray-900 dark:text-gray-100"
                          }`}
                        >
                          <div className="font-medium text-sm">{mode.name}</div>
                          <div className={`text-xs mt-0.5 ${
                            chatMode === mode.key
                              ? "text-gray-200 dark:text-gray-700"
                              : "text-gray-500 dark:text-gray-400"
                          }`}>
                            {mode.description}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            
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

        {viewMode === "chat" && (
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
                  className={`max-w-[90%] rounded-lg px-4 py-3 ${
                    message.role === "user"
                      ? "bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white"
                      : "bg-white dark:bg-black text-black dark:text-white border border-gray-200 dark:border-gray-800"
                  }`}
                >
                  <MessageContent content={message.content} />
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

        {viewMode === "svg" && (
          <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 sm:space-y-6 bg-white dark:bg-black">
            <div className="flex flex-col gap-6 max-w-4xl mx-auto">
              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4 bg-gray-50/70 dark:bg-white/5">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">SVG Viewer</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Paste your SVG code below to preview it. This is useful for viewing SVG diagrams generated in Chain of Thought mode.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* SVG Code Input */}
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-gray-900 dark:text-white">
                    SVG Code
                  </label>
                  <textarea
                    value={svgCode}
                    onChange={(e) => setSvgCode(e.target.value)}
                    placeholder="Paste your SVG code here...&#10;&#10;Example:&#10;&lt;svg xmlns=&quot;http://www.w3.org/2000/svg&quot; viewBox=&quot;0 0 400 300&quot;&gt;&#10;  &lt;circle cx=&quot;200&quot; cy=&quot;150&quot; r=&quot;50&quot; fill=&quot;#3b82f6&quot; /&gt;&#10;&lt;/svg&gt;"
                    className="w-full h-96 px-3 sm:px-4 py-2 sm:py-3 border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-black text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent resize-none text-sm font-mono"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSvgCode("")}
                      className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      Clear
                    </button>
                    <button
                      onClick={() => {
                        if (svgCode.trim()) {
                          navigator.clipboard.writeText(svgCode).then(() => {
                            // Could add toast notification here
                          }).catch(err => {
                            console.error('Failed to copy:', err);
                          });
                        }
                      }}
                      disabled={!svgCode.trim()}
                      className="px-4 py-2 text-sm font-medium text-white dark:text-black bg-black dark:bg-white hover:bg-gray-900 dark:hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Copy Code
                    </button>
                  </div>
                </div>

                {/* SVG Preview */}
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-gray-900 dark:text-white">
                    Preview
                  </label>
                  <div className="w-full h-96 border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-black overflow-auto flex items-center justify-center p-4">
                    {svgCode.trim() ? (
                      <div 
                        className="max-w-full max-h-full"
                        dangerouslySetInnerHTML={{ __html: svgCode }}
                      />
                    ) : (
                      <div className="text-center text-gray-400 dark:text-gray-600">
                        <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="text-sm">SVG preview will appear here</p>
                      </div>
                    )}
                  </div>
                  {svgCode.trim() && (
                    <button
                      onClick={() => {
                        try {
                          const blob = new Blob([svgCode], { type: 'image/svg+xml' });
                          const url = URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.href = url;
                          link.download = `svg-diagram-${Date.now()}.svg`;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                          URL.revokeObjectURL(url);
                        } catch (error) {
                          console.error("Error downloading SVG:", error);
                        }
                      }}
                      className="w-full px-4 py-2 text-sm font-medium text-white dark:text-black bg-black dark:bg-white hover:bg-gray-900 dark:hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      Download SVG
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {viewMode === "image" && (
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

        {viewMode === "chat" && (hasNFT || (tokenBalance !== null && tokenBalance > 0)) && (
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
                  className="w-full px-4 sm:px-5 py-3 sm:py-3.5 pr-10 sm:pr-12 border-2 border-gray-300/50 dark:border-gray-700/50 rounded-xl bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:border-gray-400 dark:focus:border-gray-600 focus:bg-white/80 dark:focus:bg-gray-900/80 focus:ring-4 focus:ring-gray-400/10 dark:focus:ring-gray-600/10 resize-none max-h-32 text-sm sm:text-base transition-all duration-200 shadow-sm focus:shadow-md"
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
                className="px-5 sm:px-6 py-3 sm:py-3.5 bg-white/20 dark:bg-black/20 backdrop-blur-xl text-gray-900 dark:text-gray-100 border border-gray-300/20 dark:border-gray-700/20 hover:bg-white/30 dark:hover:bg-black/30 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex-shrink-0 shadow-[0_10px_40px_rgb(0,0,0,0.12)] dark:shadow-[0_10px_40px_rgb(255,255,255,0.08)] hover:shadow-[0_15px_50px_rgb(0,0,0,0.18)] dark:hover:shadow-[0_15px_50px_rgb(255,255,255,0.12)]"
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

