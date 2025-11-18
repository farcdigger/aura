"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import { isMessagingEnabled, checkMessagingPermissions } from "@/lib/feature-flags";
import UserSearch from "./components/UserSearch";
import ConversationList from "./components/ConversationList";
import MessageThread from "./components/MessageThread";
import MessageInput from "./components/MessageInput";

export default function MessagesPage() {
  const { address, isConnected } = useAccount();
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accessReason, setAccessReason] = useState<string>("");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [otherParticipant, setOtherParticipant] = useState<string>("");
  const [messageRefreshSignal, setMessageRefreshSignal] = useState(0);
  const [showUserSearch, setShowUserSearch] = useState(false);

  useEffect(() => {
    const checkAccess = () => {
      const permissions = checkMessagingPermissions(address);
      setHasAccess(permissions.hasAccess);
      setAccessReason(permissions.reason || "");
      setLoading(false);
      
      // Redirect to social page if no access (after 3 seconds)
      if (!permissions.hasAccess && address) {
        setTimeout(() => {
          window.location.href = "/social";
        }, 3000);
      }
    };
    
    checkAccess();
  }, [address]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-2 border-black dark:border-white border-t-transparent mb-4"></div>
          <div className="text-black dark:text-white">Loading...</div>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-white dark:bg-black">
        {/* Navbar */}
        <nav className="border-b border-gray-200 dark:border-gray-800">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <Link href="/" className="flex items-center gap-3">
                <img 
                  src="/frora-logo.png" 
                  alt="XFRORA Logo" 
                  className="w-10 h-10 rounded-full object-cover"
                />
                <span className="text-xl font-bold text-gray-800 uppercase dark:text-slate-100">XFRORA</span>
              </Link>
              <div className="flex items-center gap-3">
                <ThemeToggle />
                <ConnectButton />
              </div>
            </div>
          </div>
        </nav>

        {/* Access Denied Content */}
        <div className="flex items-center justify-center min-h-[calc(100vh-80px)]">
          <div className="text-center max-w-md mx-auto px-4">
            <div className="text-6xl mb-6">🔒</div>
            <h1 className="text-3xl font-bold text-black dark:text-white mb-4">
              Access Denied
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {accessReason || "This feature is still in development."}
            </p>
            {!isConnected && (
              <div className="mb-6">
                <ConnectButton />
              </div>
            )}
            <div className="space-y-3">
              <Link
                href="/social"
                className="block w-full px-6 py-3 bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white font-semibold hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors"
              >
                Back to Social
              </Link>
              <Link
                href="/"
                className="block w-full px-6 py-3 border border-gray-300 dark:border-gray-700 text-black dark:text-white font-semibold hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
              >
                Back to Home
              </Link>
            </div>
            {address && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-6">
                Wallet: {address.substring(0, 6)}...{address.substring(38)}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {/* Navbar */}
      <nav className="border-b border-gray-200 dark:border-gray-800 sticky top-0 z-50 bg-white dark:bg-black">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <img 
                src="/frora-logo.png" 
                alt="XFRORA Logo" 
                className="w-10 h-10 rounded-full object-cover"
              />
              <span className="text-xl font-bold text-gray-800 uppercase dark:text-slate-100">XFRORA</span>
              <span className="text-sm text-gray-600 dark:text-gray-400">Messages</span>
            </Link>
            <div className="flex items-center gap-3">
              <Link
                href="/social"
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 text-black dark:text-white hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
              >
                Social
              </Link>
              <ThemeToggle />
              <ConnectButton />
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex h-[calc(100vh-80px)]">
        {/* Sidebar - Conversations List */}
        <div className="w-1/3 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex flex-col">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-black dark:text-white">
                Messages
                {process.env.NODE_ENV === "development" && (
                  <span className="text-xs bg-yellow-400 text-black px-2 py-1 rounded ml-2">
                    BETA
                  </span>
                )}
              </h2>
              <button
                onClick={() => setShowUserSearch(!showUserSearch)}
                className="px-3 py-1 text-sm bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white font-semibold hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors"
              >
                {showUserSearch ? "Cancel" : "New"}
              </button>
            </div>
            
            {/* User Search */}
            {showUserSearch && address && (
              <div className="mb-4">
                <UserSearch
                  currentWallet={address}
                  onSelectUser={(wallet, userInfo) => {
                    if (userInfo.hasExistingConversation && userInfo.conversationId) {
                      setSelectedConversationId(userInfo.conversationId);
                      setOtherParticipant(wallet);
                    } else {
                      // Create new conversation by sending first message
                      // This will be handled by MessageInput when user sends first message
                      setSelectedConversationId(null);
                      setOtherParticipant(wallet);
                    }
                    setShowUserSearch(false);
                  }}
                />
              </div>
            )}
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto">
            {address && (
              <ConversationList
                currentWallet={address}
                selectedConversationId={selectedConversationId}
                onSelectConversation={(conversationId, otherParticipantWallet) => {
                  setSelectedConversationId(conversationId);
                  setOtherParticipant(otherParticipantWallet);
                }}
              />
            )}
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Chat Header */}
          {otherParticipant && (
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-black">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center border-2 border-black dark:border-white">
                  <span className="text-xs font-bold text-black dark:text-white">
                    {otherParticipant.substring(2, 6).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-black dark:text-white">
                    {otherParticipant.substring(0, 6)}...{otherParticipant.substring(38)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                    {otherParticipant}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Messages Area */}
          {address && (
            <MessageThread
              conversationId={selectedConversationId}
              currentWallet={address}
              otherParticipant={otherParticipant}
              refreshSignal={messageRefreshSignal}
            />
          )}

          {/* Message Input Area */}
          {address && (
            <MessageInput
              conversationId={selectedConversationId}
              senderWallet={address}
              receiverWallet={otherParticipant}
              onMessageSent={(newConversationId) => {
                setMessageRefreshSignal((prev) => prev + 1);
                if (newConversationId && newConversationId !== selectedConversationId) {
                  setSelectedConversationId(newConversationId);
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
