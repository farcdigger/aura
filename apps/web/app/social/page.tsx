"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import PaymentModal from "@/components/PaymentModal";

interface Post {
  id: number;
  nft_token_id: number;
  content: string;
  fav_count: number;
  created_at: string;
}

interface WeeklyWinner {
  id: number;
  week_start_date: string;
  week_end_date: string;
  reward_type: string;
  winner_nft_token_id: number | null;
  winner_post_id: number | null;
  tokens_awarded: number;
  status: string;
  created_at: string;
}

export default function SocialPage() {
  const { address, isConnected } = useAccount();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newPostContent, setNewPostContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [points, setPoints] = useState<number | null>(null);
  const [favLoading, setFavLoading] = useState<Record<number, boolean>>({});
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [weeklyWinners, setWeeklyWinners] = useState<WeeklyWinner[]>([]);
  const [mostFavedPost, setMostFavedPost] = useState<Post | null>(null);
  const [topFaver, setTopFaver] = useState<{ wallet_address: string; fav_count: number } | null>(null);

  // Load posts
  const loadPosts = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/posts?t=${Date.now()}`);
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
      const response = await fetch(`/api/chat/token-balance?wallet=${address}&t=${Date.now()}`);
      if (response.ok) {
        const data = await response.json();
        setTokenBalance(data.balance || 0);
        setPoints(data.points || 0);
      }
    } catch (err) {
      console.error("Error loading token balance:", err);
    }
  };

  useEffect(() => {
    if (address) {
      loadTokenBalance();
    } else {
      setTokenBalance(null);
      setPoints(null);
    }
  }, [address]);

  // Load weekly winners and top stats
  const loadWeeklyWinners = async () => {
    try {
      const response = await fetch("/api/posts/weekly-winners");
      if (response.ok) {
        const data = await response.json();
        setWeeklyWinners(data.winners || []);
      }
    } catch (err) {
      console.error("Error loading weekly winners:", err);
    }
  };

  const loadTopStats = async () => {
    try {
      const postsResponse = await fetch("/api/posts");
      if (postsResponse.ok) {
        const postsData = await postsResponse.json();
        const posts = postsData.posts || [];
        if (posts.length > 0) {
          const mostFaved = posts.reduce((prev: Post, current: Post) => 
            (current.fav_count > prev.fav_count) ? current : prev
          );
          setMostFavedPost(mostFaved);
        }
      }

      const topFaverResponse = await fetch("/api/posts/top-faver");
      if (topFaverResponse.ok) {
        const topFaverData = await topFaverResponse.json();
        setTopFaver(topFaverData.topFaver || null);
      }
    } catch (err) {
      console.error("Error loading top stats:", err);
    }
  };

  useEffect(() => {
    loadPosts();
    loadWeeklyWinners();
    loadTopStats();
    const interval = setInterval(() => {
      loadPosts();
      loadTopStats();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleCreatePost = async () => {
    if (!address) {
      alert("Please connect your wallet");
      return;
    }

    if (tokenBalance === null || tokenBalance === 0) {
      alert("You need to load tokens first. Token purchase requires NFT ownership verification.");
      setShowPaymentModal(true);
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
    
    const optimisticBalance = tokenBalance !== null ? tokenBalance - 20000 : 0;
    const optimisticPoints = points !== null ? points + 8 : 8;
    setTokenBalance(optimisticBalance);
    setPoints(optimisticPoints);
    
    const contentToPost = newPostContent.trim();
    
    try {
      const response = await fetch("/api/posts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          content: contentToPost,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setTokenBalance(tokenBalance);
        setPoints(points);
        throw new Error(data.error || "Failed to create post");
      }

      setNewPostContent("");
      
      if (data.post) {
        setPosts((prev) => [data.post, ...prev]);
      }
      
      await Promise.all([
        loadPosts(),
        loadTokenBalance(),
        loadTopStats(),
      ]);
    } catch (err: any) {
      setTokenBalance(tokenBalance);
      setPoints(points);
      alert(err.message || "Failed to create post");
    } finally {
      setPosting(false);
    }
  };

  const handleFav = async (postId: number) => {
    if (!address) {
      alert("Please connect your wallet");
      return;
    }

    if (tokenBalance === null || tokenBalance < 100) {
      alert("You need to load tokens first. Token purchase requires NFT ownership verification.");
      setShowPaymentModal(true);
      return;
    }

    setFavLoading((prev) => ({ ...prev, [postId]: true }));
    
    const optimisticBalance = tokenBalance !== null ? tokenBalance - 100 : 0;
    setTokenBalance(optimisticBalance);
    
    const currentPost = posts.find(p => p.id === postId);
    const optimisticFavCount = currentPost ? currentPost.fav_count + 1 : 0;
    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId
          ? { ...post, fav_count: optimisticFavCount }
          : post
      )
    );
    
    try {
      const response = await fetch("/api/posts/fav", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          postId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setTokenBalance(tokenBalance);
        setPosts((prev) =>
          prev.map((post) =>
            post.id === postId
              ? { ...post, fav_count: currentPost?.fav_count || 0 }
              : post
          )
        );
        throw new Error(data.error || "Failed to favorite post");
      }

      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? { ...post, fav_count: data.favCount }
            : post
        )
      );

      // Reload posts, token balance, and top stats to get accurate data from server
      await Promise.all([
        loadPosts(),
        loadTokenBalance(),
        loadTopStats(),
      ]);
    } catch (err: any) {
      setTokenBalance(tokenBalance);
      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? { ...post, fav_count: currentPost?.fav_count || 0 }
            : post
        )
      );
      alert(err.message || "Failed to favorite post");
    } finally {
      setFavLoading((prev) => ({ ...prev, [postId]: false }));
    }
  };

  const formatTimeAgo = (dateString: string) => {
    if (!dateString) return "just now";
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
    <div className="min-h-screen bg-white dark:bg-black">
      {/* Navbar */}
      <nav className="border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <div className="text-xl font-bold text-black dark:text-white">
                XFRORA
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Social</span>
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
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-black dark:text-white italic mb-2">
            XFroraSocial
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Connect with the xFrora community
          </p>
        </div>

        {/* Stats Card */}
        {isConnected && address && (
          <div className="mb-6 p-6 border border-gray-200 dark:border-gray-800">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">
                  Tokens
                </p>
                <p className="text-2xl font-bold text-black dark:text-white">
                  {tokenBalance !== null ? tokenBalance.toLocaleString() : "..."}
                </p>
              </div>
              <div className="text-center border-x border-gray-200 dark:border-gray-800">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">
                  Points
                </p>
                <p className="text-2xl font-bold text-black dark:text-white">
                  {points !== null ? points.toLocaleString() : "..."}
                </p>
              </div>
              <div className="text-center">
                <button
                  onClick={() => setShowPaymentModal(true)}
                  className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white font-semibold hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors"
                >
                  Load Tokens
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Post Form */}
        {isConnected && address && tokenBalance !== null && tokenBalance > 0 && (
          <div className="mb-6 p-6 border border-gray-200 dark:border-gray-800">
            <textarea
              value={newPostContent}
              onChange={(e) => setNewPostContent(e.target.value)}
              placeholder="What's happening?"
              maxLength={280}
              className="w-full p-4 border border-gray-200 dark:border-gray-800 bg-white dark:bg-black text-black dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white mb-4"
              rows={4}
            />
            <div className="flex items-center justify-between">
              <span className={`text-sm ${newPostContent.length > 260 ? "text-red-500" : "text-gray-500 dark:text-gray-400"}`}>
                {newPostContent.length}/280
              </span>
              <button
                onClick={handleCreatePost}
                disabled={posting || !newPostContent.trim() || newPostContent.length > 280}
                className="px-6 py-2 bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors"
              >
                {posting ? "Posting..." : "Post (20K tokens)"}
              </button>
            </div>
          </div>
        )}

        {/* Weekly Winners & Top Stats */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {mostFavedPost && (
            <div className="p-4 border border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-black dark:text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
                <h3 className="font-bold text-black dark:text-white">Most Faved Post</h3>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2 line-clamp-2">
                {mostFavedPost.content}
              </p>
              <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                <span>NFT #{mostFavedPost.nft_token_id}</span>
                <span className="font-semibold">{mostFavedPost.fav_count} favs</span>
              </div>
            </div>
          )}

          {topFaver && (
            <div className="p-4 border border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-black dark:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
                <h3 className="font-bold text-black dark:text-white">Top Faver</h3>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                {topFaver.wallet_address.substring(0, 6)}...{topFaver.wallet_address.substring(38)}
              </p>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                <span className="font-semibold">{topFaver.fav_count} favs given</span>
              </div>
            </div>
          )}
        </div>

        {/* Load Tokens Message */}
        {isConnected && address && (tokenBalance === null || tokenBalance === 0) && (
          <div className="mb-6 p-4 border border-yellow-400 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/20">
            <div className="flex items-center justify-between">
              <p className="text-black dark:text-white">
                <span className="font-semibold">Load tokens to get started.</span> Token purchase requires NFT ownership verification.
              </p>
              <button
                onClick={() => setShowPaymentModal(true)}
                className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white font-semibold hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors"
              >
                Load Tokens
              </button>
            </div>
          </div>
        )}

        {/* Posts Feed */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-16">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-2 border-black dark:border-white border-t-transparent"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-400">Loading posts...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12 p-6 border border-red-300 dark:border-red-700">
              <p className="text-red-600 dark:text-red-400 font-semibold">{error}</p>
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-16 p-6 border border-gray-200 dark:border-gray-800">
              <p className="text-xl font-semibold text-black dark:text-white">
                No posts yet
              </p>
            </div>
          ) : (
            posts.map((post) => (
              <div
                key={post.id}
                className="p-6 border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-full bg-black dark:bg-white text-white dark:text-black flex items-center justify-center font-bold text-sm border border-black dark:border-white">
                      #{post.nft_token_id}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-bold text-black dark:text-white">
                        NFT #{post.nft_token_id}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {formatTimeAgo(post.created_at)}
                      </span>
                    </div>
                    <p className="text-black dark:text-white mb-4 whitespace-pre-wrap break-words leading-relaxed">
                      {post.content}
                    </p>
                    <div className="flex items-center gap-6">
                      <button
                        onClick={() => handleFav(post.id)}
                        disabled={!isConnected || (tokenBalance !== null && tokenBalance < 100) || favLoading[post.id]}
                        className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <svg
                          className={`w-5 h-5 ${post.fav_count > 0 ? "text-red-500 fill-current" : ""}`}
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

      {/* Payment Modal */}
      {showPaymentModal && (
        <PaymentModal
          onClose={() => setShowPaymentModal(false)}
          onPaymentSuccess={(newBalance) => {
            setShowPaymentModal(false);
            if (newBalance !== undefined) {
              setTokenBalance(newBalance);
            } else {
              loadTokenBalance();
            }
          }}
          walletAddress={address ? address : null}
        />
      )}
    </div>
  );
}
