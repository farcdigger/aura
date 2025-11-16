"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import { checkNFTOwnershipWithCache, clearCachedNFTVerification } from "@/lib/nft-cache";

interface Post {
  id: number;
  nft_token_id: number;
  content: string;
  fav_count: number;
  created_at: string;
}

export default function SocialPage() {
  const { address, isConnected } = useAccount();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newPostContent, setNewPostContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [nftVerified, setNftVerified] = useState(false);
  const [nftTokenId, setNftTokenId] = useState<number | null>(null);
  const [checkingNFT, setCheckingNFT] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [points, setPoints] = useState<number | null>(null);
  const [favLoading, setFavLoading] = useState<Record<number, boolean>>({});

  // Load posts
  const loadPosts = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/posts");
      if (!response.ok) throw new Error("Failed to load posts");
      const data = await response.json();
      setPosts(data.posts || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load token balance
  const loadTokenBalance = async () => {
    if (!address) return;
    try {
      const response = await fetch(`/api/chat/token-balance?walletAddress=${address}`);
      if (response.ok) {
        const data = await response.json();
        setTokenBalance(data.balance || 0);
        setPoints(data.points || 0);
      }
    } catch (err) {
      console.error("Error loading token balance:", err);
    }
  };

  // Check NFT ownership (with cache)
  const checkNFT = async () => {
    if (!address) return;
    setCheckingNFT(true);
    try {
      // Use address as-is, API will normalize it properly
      // But for cache key, use lowercase for consistency
      const cacheKey = address.toLowerCase();
      const result = await checkNFTOwnershipWithCache(address);
      console.log("NFT check result:", {
        address,
        result,
        hasNFT: result.hasNFT,
        tokenId: result.tokenId,
      });
      setNftVerified(result.hasNFT);
      setNftTokenId(result.tokenId);
    } catch (err: any) {
      console.error("Error checking NFT:", {
        error: err.message,
        address,
      });
      setNftVerified(false);
      setNftTokenId(null);
    } finally {
      setCheckingNFT(false);
    }
  };

  // Handle wallet change
  useEffect(() => {
    if (address) {
      // Normalize address before clearing cache
      const normalizedAddress = address.toLowerCase();
      clearCachedNFTVerification(normalizedAddress);
      checkNFT();
      loadTokenBalance();
    } else {
      setNftVerified(false);
      setNftTokenId(null);
      setTokenBalance(null);
      setPoints(null);
    }
  }, [address]);

  // Load posts on mount and refresh every 30 seconds
  useEffect(() => {
    loadPosts();
    const interval = setInterval(loadPosts, 30000);
    return () => clearInterval(interval);
  }, []);

  // Create new post
  const handleCreatePost = async () => {
    if (!address || !nftVerified || !nftTokenId) {
      alert("NFT ownership required to create posts");
      return;
    }

    if (!newPostContent.trim()) {
      alert("Please enter some content");
      return;
    }

    if (newPostContent.length > 280) {
      alert("Content too long. Maximum 280 characters allowed.");
      return;
    }

    setPosting(true);
    try {
      const response = await fetch("/api/posts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          content: newPostContent.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create post");
      }

      setNewPostContent("");
      await loadPosts();
      await loadTokenBalance();
    } catch (err: any) {
      alert(err.message || "Failed to create post");
    } finally {
      setPosting(false);
    }
  };

  // Handle fav
  const handleFav = async (postId: number) => {
    if (!address) {
      alert("Please connect your wallet");
      return;
    }

    if (!nftVerified || !nftTokenId) {
      await checkNFT();
      if (!nftVerified || !nftTokenId) {
        alert("NFT ownership required to favorite posts");
        return;
      }
    }

    setFavLoading((prev) => ({ ...prev, [postId]: true }));
    try {
      const response = await fetch("/api/posts/fav", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          postId,
          nftVerified,
          nftTokenId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to favorite post");
      }

      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? { ...post, fav_count: data.favCount }
            : post
        )
      );

      if (data.newBalance !== undefined) {
        setTokenBalance(data.newBalance);
      }
    } catch (err: any) {
      alert(err.message || "Failed to favorite post");
    } finally {
      setFavLoading((prev) => ({ ...prev, [postId]: false }));
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return "just now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-purple-50 to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800 transition-colors">
      {/* Navbar */}
      <nav className="bg-white/80 backdrop-blur-xl shadow-lg sticky top-0 z-50 border-b border-gray-200/50 dark:bg-slate-900/80 dark:border-slate-800">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="relative">
                <img
                  src="/frora-logo.png"
                  alt="XFRORA Logo"
                  className="w-10 h-10 rounded-full object-cover ring-2 ring-purple-200 dark:ring-purple-800 group-hover:ring-purple-400 transition-all"
                />
              </div>
              <div>
                <span className="text-xl font-bold text-gray-900 dark:text-slate-100 block">
                  XFRORA
                </span>
                <span className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                  Social
                </span>
              </div>
            </Link>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <ConnectButton />
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-extrabold text-black dark:text-black italic mb-2">
            XFroraSocial
          </h1>
          <p className="text-gray-600 dark:text-slate-400">
            Connect with the xFrora community
          </p>
        </div>

        {/* Stats Card */}
        {isConnected && address && (
          <div className="mb-6 p-6 bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-slate-700/50">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Tokens
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">
                  {tokenBalance !== null ? tokenBalance.toLocaleString() : "..."}
                </p>
              </div>
              <div className="text-center border-x border-gray-200 dark:border-slate-700">
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Points
                </p>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {points !== null ? points.toLocaleString() : "..."}
                </p>
              </div>
              {nftTokenId && (
                <div className="text-center">
                  <p className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                    NFT ID
                  </p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    #{nftTokenId}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Create Post Form */}
        {isConnected && address && nftVerified && (
          <div className="mb-6 p-6 bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-slate-700/50">
            <div className="flex items-start gap-4">
              {nftTokenId && (
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                    #{nftTokenId}
                  </div>
                </div>
              )}
              <div className="flex-1">
                <textarea
                  value={newPostContent}
                  onChange={(e) => setNewPostContent(e.target.value)}
                  placeholder="What's happening?"
                  maxLength={280}
                  className="w-full p-4 border-2 border-gray-200 dark:border-slate-700 rounded-xl bg-white/50 dark:bg-slate-900/50 text-gray-900 dark:text-slate-100 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  rows={4}
                />
                <div className="flex items-center justify-between mt-4">
                  <span className={`text-sm ${newPostContent.length > 260 ? "text-red-500" : "text-gray-500 dark:text-slate-400"}`}>
                    {newPostContent.length}/280
                  </span>
                  <button
                    onClick={handleCreatePost}
                    disabled={posting || !newPostContent.trim() || newPostContent.length > 280}
                    className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
                  >
                    {posting ? "Posting..." : "Post (20K tokens)"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* NFT Required Message */}
        {isConnected && address && !nftVerified && !checkingNFT && (
          <div className="mb-6 p-4 bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border-2 border-yellow-200 dark:border-yellow-800 rounded-xl">
            <p className="text-yellow-800 dark:text-yellow-200 text-center">
              <span className="font-semibold">NFT ownership required</span> to create posts and favorite.{" "}
              <Link href="/" className="underline font-bold hover:text-yellow-900 dark:hover:text-yellow-100">
                Mint your NFT →
              </Link>
            </p>
          </div>
        )}

        {/* Posts Feed */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-16">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent"></div>
              <p className="mt-4 text-gray-600 dark:text-slate-400">Loading posts...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12 p-6 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl">
              <p className="text-red-600 dark:text-red-400 font-semibold">{error}</p>
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-16 p-6 bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-slate-700/50">
              <p className="text-xl font-semibold text-gray-800 dark:text-slate-200 mb-2">
                No posts yet
              </p>
            </div>
          ) : (
            posts.map((post) => (
              <div
                key={post.id}
                className="p-6 bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl rounded-2xl shadow-lg hover:shadow-xl border border-gray-200/50 dark:border-slate-700/50 transition-all hover:scale-[1.01]"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-blue-500 flex items-center justify-center text-white font-bold text-lg shadow-lg ring-2 ring-purple-200 dark:ring-purple-800">
                      #{post.nft_token_id}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-bold text-gray-900 dark:text-slate-100">
                        NFT #{post.nft_token_id}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-slate-400">
                        {formatTimeAgo(post.created_at)}
                      </span>
                    </div>
                    <p className="text-gray-800 dark:text-slate-100 mb-4 whitespace-pre-wrap break-words leading-relaxed">
                      {post.content}
                    </p>
                    <div className="flex items-center gap-6">
                      <button
                        onClick={() => handleFav(post.id)}
                        disabled={!isConnected || !nftVerified || favLoading[post.id]}
                        className="flex items-center gap-2 text-gray-600 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all group"
                      >
                        <svg
                          className={`w-6 h-6 transition-transform group-hover:scale-110 ${post.fav_count > 0 ? "text-red-500" : ""}`}
                          fill={post.fav_count > 0 ? "currentColor" : "none"}
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                          />
                        </svg>
                        <span className="font-semibold">{post.fav_count}</span>
                        {favLoading[post.id] && (
                          <span className="text-xs">...</span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
