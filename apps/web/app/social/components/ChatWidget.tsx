"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { checkNFTOwnershipClientSide } from "@/lib/check-nft-ownership";
import ConversationList from "../../messages/components/ConversationList";
import MessageThread from "../../messages/components/MessageThread";
import MessageInput from "../../messages/components/MessageInput";
import UserSearch from "../../messages/components/UserSearch";

interface ChatWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  initialWallet?: string; // Optional: pre-select a wallet when opening
  onWalletSelect?: (wallet: string) => void; // Callback when wallet is selected
}

export default function ChatWidget({ isOpen, onClose, initialWallet }: ChatWidgetProps) {
  const { address } = useAccount();
  const [view, setView] = useState<"LIST" | "THREAD">("LIST");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [otherParticipant, setOtherParticipant] = useState<string>("");
  const [showSearch, setShowSearch] = useState(false);
  const [lastUpdatedConversation, setLastUpdatedConversation] = useState<{ id: string; timestamp: string } | null>(null);
  const [messageRefreshSignal, setMessageRefreshSignal] = useState(0);
  const [hasNFT, setHasNFT] = useState(false);
  const [checkingNFT, setCheckingNFT] = useState(true);

  // Handle initial wallet selection
  useEffect(() => {
    if (isOpen && initialWallet && hasNFT && address) {
      // Search for the user and open conversation
      const openInitialConversation = async () => {
        try {
          const response = await fetch(
            `/api/messages/search?q=${encodeURIComponent(initialWallet)}&wallet=${address.toLowerCase()}`
          );
          if (response.ok) {
            const data = await response.json();
            if (data.conversationId) {
              handleSelectConversation(data.conversationId, initialWallet.toLowerCase());
            } else {
              handleSelectConversation("temp", initialWallet.toLowerCase());
            }
          }
        } catch (err) {
          console.error("Error opening initial conversation:", err);
          // Fallback: just set the participant
          handleSelectConversation("temp", initialWallet.toLowerCase());
        }
      };
      openInitialConversation();
    }
  }, [isOpen, initialWallet, hasNFT, address]);

  // Check NFT ownership using client-side blockchain check (same as credit purchase system)
  useEffect(() => {
    const checkNFTOwnership = async () => {
      if (!address) {
        setHasNFT(false);
        setCheckingNFT(false);
        return;
      }

      setCheckingNFT(true);
      const hasNFTResult = await checkNFTOwnershipClientSide(address);
      setHasNFT(hasNFTResult);
      setCheckingNFT(false);
    };
    
    if (isOpen) {
      checkNFTOwnership();
    }
  }, [address, isOpen]);

  // Reset view when widget is closed
  useEffect(() => {
    if (!isOpen) {
      // Optional: Reset to list view or keep state? 
      // User might want to come back to the same conversation.
      // keeping it as is for now.
    }
  }, [isOpen]);

  // Handle initial wallet selection
  useEffect(() => {
    if (isOpen && initialWallet && hasNFT && address) {
      // Search for the user and open conversation
      const openInitialConversation = async () => {
        try {
          const response = await fetch(
            `/api/messages/search?q=${encodeURIComponent(initialWallet)}&wallet=${address.toLowerCase()}`
          );
          if (response.ok) {
            const data = await response.json();
            if (data.conversationId) {
              handleSelectConversation(data.conversationId, initialWallet.toLowerCase());
            } else {
              handleSelectConversation("temp", initialWallet.toLowerCase());
            }
          }
        } catch (err) {
          console.error("Error opening initial conversation:", err);
          // Fallback: just set the participant
          handleSelectConversation("temp", initialWallet.toLowerCase());
        }
      };
      openInitialConversation();
    }
  }, [isOpen, initialWallet, hasNFT, address]);

  const handleSelectConversation = (conversationId: string, participant: string) => {
    setSelectedConversationId(conversationId);
    setOtherParticipant(participant);
    setView("THREAD");
  };

  // Handle initial wallet selection
  useEffect(() => {
    if (isOpen && initialWallet && hasNFT && address) {
      // Search for the user and open conversation
      const openInitialConversation = async () => {
        try {
          const response = await fetch(
            `/api/messages/search?q=${encodeURIComponent(initialWallet)}&wallet=${address.toLowerCase()}`
          );
          if (response.ok) {
            const data = await response.json();
            if (data.conversationId) {
              handleSelectConversation(data.conversationId, initialWallet.toLowerCase());
            } else {
              handleSelectConversation("temp", initialWallet.toLowerCase());
            }
          }
        } catch (err) {
          console.error("Error opening initial conversation:", err);
          // Fallback: just set the participant
          handleSelectConversation("temp", initialWallet.toLowerCase());
        }
      };
      openInitialConversation();
    }
  }, [isOpen, initialWallet, hasNFT, address]);

  const handleBackToList = () => {
    setView("LIST");
    // Don't clear selectedConversationId immediately to avoid flicker, 
    // but practically we are in list view now.
  };

  const handleMessageSent = (newConversationId?: string, timestamp?: string) => {
    if (newConversationId && newConversationId !== selectedConversationId) {
      setSelectedConversationId(newConversationId);
    }
    
    if (newConversationId && timestamp) {
       setLastUpdatedConversation({ id: newConversationId, timestamp });
    } else if (selectedConversationId && timestamp) {
       setLastUpdatedConversation({ id: selectedConversationId, timestamp });
    }

    setMessageRefreshSignal((prev) => prev + 1);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed top-0 right-0 h-full w-full sm:w-[400px] bg-white dark:bg-black border-l border-gray-200 dark:border-gray-800 shadow-xl z-50 flex flex-col transition-transform duration-300 transform translate-x-0">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-black">
        <div className="flex items-center gap-3">
          {view === "THREAD" && hasNFT && (
            <button 
              onClick={handleBackToList}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
            >
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <h2 className="text-lg font-bold text-black dark:text-white">
            {view === "LIST" ? "Messages" : otherParticipant ? `${otherParticipant.substring(0, 6)}...${otherParticipant.substring(38)}` : "Chat"}
          </h2>
        </div>
        <div className="flex items-center gap-2">
            {view === "LIST" && hasNFT && (
                <button
                    onClick={() => setShowSearch(!showSearch)}
                    className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </button>
            )}
            <button 
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-black dark:hover:text-white transition-colors"
            >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {checkingNFT ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-black dark:border-white border-t-transparent mb-2"></div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Checking NFT...</p>
            </div>
          </div>
        ) : !hasNFT ? (
          <div className="flex items-center justify-center h-full p-6">
            <div className="text-center max-w-sm">
              <div className="text-5xl mb-4">🎨</div>
              <h3 className="text-xl font-bold text-black dark:text-white mb-2">
                xFrora NFT Required
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                You need to own an xFrora NFT to use Direct Messages.
              </p>
              <a
                href="/"
                className="inline-block px-4 py-2 bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white font-semibold hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors"
              >
                Mint Your NFT
              </a>
            </div>
          </div>
        ) : view === "LIST" ? (
          <div className="h-full overflow-y-auto">
            {showSearch && (
                <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                    <UserSearch 
                        currentWallet={address || ""} 
                        onSelectUser={(wallet, userInfo) => {
                            if (userInfo && userInfo.conversationId) {
                                handleSelectConversation(userInfo.conversationId, wallet);
                            } else {
                                handleSelectConversation("temp", wallet); 
                            }
                            setShowSearch(false);
                        }} 
                    />
                </div>
            )}
            <ConversationList
              currentWallet={address || ""}
              selectedConversationId={selectedConversationId}
              onSelectConversation={handleSelectConversation}
              lastUpdatedConversation={lastUpdatedConversation}
            />
          </div>
        ) : (
          <>
            <MessageThread
              conversationId={selectedConversationId === "temp" ? null : selectedConversationId}
              currentWallet={address || ""}
              otherParticipant={otherParticipant}
              refreshSignal={messageRefreshSignal}
            />
            <MessageInput
              conversationId={selectedConversationId === "temp" ? null : selectedConversationId}
              senderWallet={address || ""}
              receiverWallet={otherParticipant}
              onMessageSent={handleMessageSent}
            />
          </>
        )}
      </div>
    </div>
  );
}

