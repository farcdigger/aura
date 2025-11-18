"use client";

import { useState, useEffect, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface Message {
  id: string;
  sender_wallet: string;
  receiver_wallet: string;
  content: string;
  read: boolean;
  created_at: string;
}

interface MessageThreadProps {
  conversationId: string | null;
  currentWallet: string;
  otherParticipant: string;
}

export default function MessageThread({
  conversationId,
  currentWallet,
  otherParticipant,
}: MessageThreadProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadMessages = async () => {
    if (!conversationId || !currentWallet) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/messages/${conversationId}?wallet=${currentWallet}&t=${Date.now()}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        throw new Error("Failed to load messages");
      }

      const data = await response.json();
      setMessages(data.messages || []);
    } catch (err: any) {
      setError(err.message || "Failed to load messages");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    const client = getSupabaseBrowserClient();

    if (conversationId && client) {
      loadMessages();

      channel = client
        .channel(`message-thread-${conversationId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            const newMessage = payload.new as Message;
            if (!newMessage) return;
            setMessages((prev) => {
              const exists = prev.some((msg) => msg.id === newMessage.id);
              return exists ? prev : [...prev, newMessage];
            });
          }
        )
        .subscribe();

      return () => {
        channel?.unsubscribe();
      };
    } else {
      setMessages([]);
    }
  }, [conversationId, currentWallet]);

  const parseTimestamp = (value: string) => {
    if (!value) return null;
    return new Date(value.endsWith("Z") ? value : `${value}Z`);
  };

  const formatTime = (dateString: string) => {
    const date = parseTimestamp(dateString);
    if (!date || isNaN(date.getTime())) return "";
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return "just now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (!conversationId) {
    if (otherParticipant) {
      return (
        <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
          <div className="text-center">
            <div className="text-4xl mb-2">💬</div>
            <p className="text-sm">Start the conversation!</p>
            <p className="text-xs mt-1">Send your first message below</p>
          </div>
        </div>
      );
    }
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
        <div className="text-center">
          <div className="text-4xl mb-2">💬</div>
          <p className="text-sm">Select a conversation to start messaging</p>
        </div>
      </div>
    );
  }

  if (loading && messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-gray-400 border-t-transparent mb-2"></div>
          <p className="text-sm">Loading messages...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-red-500 dark:text-red-400 text-sm">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.length === 0 ? (
        <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
          <div className="text-center">
            <div className="text-4xl mb-2">💬</div>
            <p className="text-sm">No messages yet</p>
            <p className="text-xs mt-1">Start the conversation!</p>
          </div>
        </div>
      ) : (
        messages.map((message) => {
          const isOwnMessage = message.sender_wallet.toLowerCase() === currentWallet.toLowerCase();
          
          return (
            <div
              key={message.id}
              className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[70%] rounded-lg px-4 py-2 ${
                  isOwnMessage
                    ? "bg-black dark:bg-white text-white dark:text-black"
                    : "bg-gray-200 dark:bg-gray-800 text-black dark:text-white"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                <p className={`text-xs mt-1 ${
                  isOwnMessage
                    ? "text-gray-300 dark:text-gray-700"
                    : "text-gray-500 dark:text-gray-400"
                }`}>
                  {formatTime(message.created_at)}
                </p>
              </div>
            </div>
          );
        })
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
