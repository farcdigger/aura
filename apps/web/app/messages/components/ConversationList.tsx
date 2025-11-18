"use client";

import { useState, useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

interface Conversation {
  id: string;
  otherParticipant: string;
  lastMessageAt: string | null;
  createdAt: string | null;
  unreadCount: number;
}

interface ConversationListProps {
  currentWallet: string;
  selectedConversationId: string | null;
  onSelectConversation: (conversationId: string, otherParticipant: string) => void;
}

export default function ConversationList({
  currentWallet,
  selectedConversationId,
  onSelectConversation,
}: ConversationListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConversations = async (showLoading = false) => {
    if (!currentWallet) return;

    if (showLoading || conversations.length === 0) {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await fetch(
        `/api/messages/conversations?wallet=${currentWallet}&t=${Date.now()}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        throw new Error("Failed to load conversations");
      }

      const data = await response.json();
      setConversations(data.conversations || []);
    } catch (err: any) {
      setError(err.message || "Failed to load conversations");
    } finally {
      if (showLoading || conversations.length === 0) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadConversations(true);

    const client = getSupabaseBrowserClient();
    if (!client || !currentWallet) {
      const intervalFallback = setInterval(() => loadConversations(false), 10000);
      return () => clearInterval(intervalFallback);
    }

    const intervalFallback = setInterval(() => loadConversations(false), 10000);

    const channel = client
      .channel(`conversations-realtime-${currentWallet}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_wallet=eq.${currentWallet}`,
        },
        () => loadConversations()
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `sender_wallet=eq.${currentWallet}`,
        },
        () => loadConversations()
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // after realtime ready, ensure we have latest data
          loadConversations();
        }
      });

    return () => {
      clearInterval(intervalFallback);
      channel.unsubscribe();
    };
  }, [currentWallet]);

  const parseTimestamp = (value: string) => {
    if (!value) return null;
    return new Date(value.endsWith("Z") ? value : `${value}Z`);
  };

  const formatTime = (dateString: string | null) => {
    if (!dateString) return "";
    
    const date = parseTimestamp(dateString);
    if (!date || isNaN(date.getTime())) return "";
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return "just now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-gray-500 dark:text-gray-400">
        <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-gray-400 border-t-transparent"></div>
        <p className="text-sm mt-2">Loading conversations...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-500 dark:text-red-400 text-sm">
        {error}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 dark:text-gray-400">
        <div className="text-4xl mb-2">💬</div>
        <p className="text-sm">No conversations yet</p>
        <p className="text-xs mt-1">Search for a wallet to start messaging</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-200 dark:divide-gray-800">
      {conversations.map((conv) => (
        <button
          key={conv.id}
          onClick={() => onSelectConversation(conv.id, conv.otherParticipant)}
          className={`w-full p-4 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
            selectedConversationId === conv.id
              ? "bg-gray-100 dark:bg-gray-800 border-l-4 border-black dark:border-white"
              : ""
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center border-2 border-black dark:border-white">
                <span className="text-xs font-bold text-black dark:text-white">
                  {conv.otherParticipant.substring(2, 6).toUpperCase()}
                </span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="font-semibold text-black dark:text-white truncate text-sm">
                  {conv.otherParticipant.substring(0, 6)}...{conv.otherParticipant.substring(38)}
                </p>
                {conv.unreadCount > 0 && (
                  <span className="flex-shrink-0 bg-black dark:bg-white text-white dark:text-black text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {conv.unreadCount}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {formatTime(conv.lastMessageAt)}
              </p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
