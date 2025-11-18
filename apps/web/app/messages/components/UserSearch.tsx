"use client";

import { useState } from "react";

interface UserSearchProps {
  onSelectUser: (wallet: string, userInfo: any) => void;
  currentWallet: string;
}

export default function UserSearch({ onSelectUser, currentWallet }: UserSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setError("Please enter a wallet address");
      return;
    }

    // Basic wallet address validation
    if (!/^0x[a-fA-F0-9]{40}$/.test(searchQuery.trim())) {
      setError("Invalid wallet address format");
      return;
    }

    setSearching(true);
    setError(null);
    setSearchResult(null);

    try {
      const response = await fetch(
        `/api/messages/search?q=${encodeURIComponent(searchQuery.trim())}&wallet=${currentWallet}`
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Search failed");
      }

      const data = await response.json();
      setSearchResult(data);
    } catch (err: any) {
      setError(err.message || "Failed to search user");
    } finally {
      setSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const handleSelect = () => {
    if (searchResult) {
      onSelectUser(searchResult.wallet, searchResult);
      setSearchQuery("");
      setSearchResult(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setError(null);
            setSearchResult(null);
          }}
          onKeyPress={handleKeyPress}
          placeholder="Search wallet address..."
          className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-black text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
        />
        <button
          onClick={handleSearch}
          disabled={searching || !searchQuery.trim()}
          className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white font-semibold hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {searching ? "..." : "Search"}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {searchResult && (
        <div className="p-4 border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-black">
          <div className="flex items-center gap-3 mb-3">
            {searchResult.nftImageUrl ? (
              <img
                src={searchResult.nftImageUrl.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/")}
                alt="NFT"
                className="w-12 h-12 rounded-full object-cover border-2 border-black dark:border-white"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center border-2 border-black dark:border-white">
                <span className="text-xs font-bold text-black dark:text-white">
                  {searchResult.wallet.substring(2, 6).toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex-1">
              <p className="font-semibold text-black dark:text-white">
                {searchResult.wallet.substring(0, 6)}...{searchResult.wallet.substring(38)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                {searchResult.wallet}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-3">
            {searchResult.hasNFT && (
              <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded">
                NFT #{searchResult.tokenId}
              </span>
            )}
            {searchResult.hasExistingConversation && (
              <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded">
                Existing conversation
              </span>
            )}
          </div>

          <button
            onClick={handleSelect}
            className="w-full px-4 py-2 bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white font-semibold hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors"
          >
            {searchResult.hasExistingConversation ? "Open Conversation" : "Start Conversation"}
          </button>
        </div>
      )}
    </div>
  );
}
