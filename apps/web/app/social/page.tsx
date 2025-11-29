"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import PaymentModal from "@/components/PaymentModal";
import { isMessagingEnabled } from "@/lib/feature-flags";
import ChatWidget from "./components/ChatWidget";
import ProfileSidebar from "./components/ProfileSidebar";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { checkNFTOwnershipClientSide } from "@/lib/check-nft-ownership";

interface Post {
  id: number;
  wallet_address: string; // Add wallet address for NFT image lookup
  x_user_id?: string | null; // ✅ Add x_user_id for NFT image lookup (priority)
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

const FEATURE_WALLETS = new Set(
  [
    "0xedf8e693b3ab4899a03ab22edf90e36a6ac1fd9d",
    "0x7d2ceb7a0e0c39a3d0f7b5b491659fde4bb7bcfe",
  ].map((addr) => addr.toLowerCase()),
);

export default function SocialPage() {
  const router = useRouter();
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
  const [nftImages, setNftImages] = useState<Record<string, string>>({});  // wallet_address -> image URL
  
  // Chat state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Profile search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedProfileWallet, setSelectedProfileWallet] = useState<string | null>(null);

  // Profile creation state
  const [hasNFT, setHasNFT] = useState(false);
  const [checkingNFT, setCheckingNFT] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [checkingProfile, setCheckingProfile] = useState(false);

  // Check if profile feature is enabled
  const isProfileFeatureEnabled =
    address && FEATURE_WALLETS.has(address.toLowerCase());

  // Check NFT ownership and profile existence
  useEffect(() => {
    const checkNFTAndProfile = async () => {
      if (!address || !isProfileFeatureEnabled) {
        setHasNFT(false);
        setHasProfile(false);
        return;
      }

      setCheckingNFT(true);
      const hasNFTResult = await checkNFTOwnershipClientSide(address);
      setHasNFT(hasNFTResult);
      setCheckingNFT(false);

      if (hasNFTResult) {
        // Check if profile exists
        setCheckingProfile(true);
        try {
          const response = await fetch(
            `/api/profile/${address.toLowerCase()}?currentWallet=${address.toLowerCase()}&t=${Date.now()}`,
            { cache: 'no-store' }
          );
          if (response.ok) {
            const data = await response.json();
            setHasProfile(!!data);
          }
        } catch (err) {
          console.error("Error checking profile:", err);
        } finally {
          setCheckingProfile(false);
        }
      }
    };
    checkNFTAndProfile();
  }, [address, isProfileFeatureEnabled]);

  // Handle create profile
  const handleCreateProfile = async () => {
    if (!address) {
      alert("Please connect your wallet");
      return;
    }

    if (!hasNFT) {
      alert("You need to own an xFrora NFT to create a profile");
      return;
    }

    setCreatingProfile(true);
    try {
      const response = await fetch("/api/profile/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create profile");
      }

      setHasProfile(true);
      // Redirect to profile page
      router.push(`/profile/${address.toLowerCase()}`);
    } catch (err: any) {
      alert(err.message || "Failed to create profile");
    } finally {
      setCreatingProfile(false);
    }
  };

  // Load NFT image for a specific wallet address or x_user_id
  const loadNftImage = async (walletAddress: string, xUserId?: string | null) => {
    // Skip if already loaded or invalid
    if (!walletAddress || nftImages[walletAddress]) return;
    
    try {
      // Prefer x_user_id over wallet_address for better performance
      const queryParam = xUserId 
        ? `x_user_id=${xUserId}` 
        : `wallet=${walletAddress}`;
      
      // Add timestamp to prevent caching + explicit no-store
      console.log(`🖼️ [NFT-IMAGE] Fetching for ${xUserId ? 'x_user_id' : 'wallet'}: ${xUserId || walletAddress.substring(0, 10)}...`);
      const response = await fetch(`/api/nft-image?${queryParam}&t=${Date.now()}`, {
        cache: 'no-store',
      });
      
      console.log(`🖼️ [NFT-IMAGE] Response status: ${response.status} for ${walletAddress.substring(0, 10)}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`🖼️ [NFT-IMAGE] Response data:`, { 
          hasNFT: data.hasNFT,
          hasImageUrl: !!data.imageUrl,
          wallet: walletAddress.substring(0, 10),
        });
        
        if (data.hasNFT && data.imageUrl) {
          setNftImages((prev) => ({ ...prev, [walletAddress]: data.imageUrl }));
          console.log(`✅ [NFT-IMAGE] SUCCESS - Image loaded for ${walletAddress.substring(0, 10)}`);
        } else {
          console.log(`⚠️  [NFT-IMAGE] NO IMAGE - hasNFT: ${data.hasNFT}, imageUrl: ${!!data.imageUrl}`);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error(`❌ [NFT-IMAGE] API ERROR (${response.status}):`, {
          wallet: walletAddress.substring(0, 10),
          status: response.status,
          error: errorData,
        });
      }
    } catch (err: any) {
      console.error(`❌ [NFT-IMAGE] FETCH ERROR for ${walletAddress.substring(0, 10)}:`, {
        message: err.message,
        error: err,
      });
    }
  };

  // Load posts
  const loadPosts = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/posts?t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error("Failed to load posts");
      const data = await response.json();
      const loadedPosts = data.posts || [];
      setPosts(loadedPosts);
      
      // Load NFT images for all posts using wallet address
      loadedPosts.forEach((post: Post) => {
        if (post.wallet_address) {
          loadNftImage(post.wallet_address, post.x_user_id); // ✅ Pass x_user_id for priority lookup
        }
      });
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
      const response = await fetch(`/api/chat/token-balance?wallet=${address}&t=${Date.now()}`, {
        cache: 'no-store',
      });
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
  
  // Unread Count Effect
  useEffect(() => {
    if (!address) return;
    
    const client = getSupabaseBrowserClient();
    if (!client) return;

    const normalizedWallet = address.toLowerCase();
    
    const fetchUnreadCount = async () => {
        const { count } = await client
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('receiver_wallet', normalizedWallet)
            .eq('read', false);
        setUnreadCount(count || 0);
    };
    
    fetchUnreadCount();
    
    const channel = client.channel(`unread-count-${normalizedWallet}`)
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'messages', 
            filter: `receiver_wallet=eq.${normalizedWallet}` 
        }, () => {
            fetchUnreadCount();
        })
        .on('postgres_changes', { 
             event: 'UPDATE', 
             schema: 'public', 
             table: 'messages', 
             filter: `receiver_wallet=eq.${normalizedWallet}` 
        }, () => {
            fetchUnreadCount();
        })
        .subscribe();
        
    // Backup polling
    const intervalId = setInterval(fetchUnreadCount, 10000);

    return () => {
        client.removeChannel(channel);
        clearInterval(intervalId);
    };
  }, [address]);

  // Load weekly winners and top stats
  const loadWeeklyWinners = async () => {
    try {
      const response = await fetch(`/api/posts/weekly-winners?t=${Date.now()}`, {
        cache: 'no-store',
      });
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
      // Use cache-busting to get fresh data + explicit no-store
      const postsResponse = await fetch(`/api/posts?t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (postsResponse.ok) {
        const postsData = await postsResponse.json();
        const posts = postsData.posts || [];
        if (posts.length > 0) {
          // Find the post with the highest fav_count
          // Convert fav_count to number to ensure proper comparison
          const mostFaved = posts.reduce((prev: Post, current: Post) => {
            const prevCount = Number(prev.fav_count) || 0;
            const currentCount = Number(current.fav_count) || 0;
            return currentCount > prevCount ? current : prev;
          });
          
          // Only set if there's at least one post with fav_count > 0
          if (Number(mostFaved.fav_count) > 0) {
            setMostFavedPost(mostFaved);
          } else {
            // If no posts have favs yet, still show the first post
            setMostFavedPost(mostFaved);
          }
        } else {
          setMostFavedPost(null);
        }
      }

      const topFaverResponse = await fetch(`/api/posts/top-faver?t=${Date.now()}`, {
        cache: 'no-store',
      });
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
      alert("You need to load credits first. Credit purchase requires NFT ownership verification.");
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
      // Get x_user_id from localStorage if available
      const storedXUser = localStorage.getItem("xUser");
      const xUserId = storedXUser ? JSON.parse(storedXUser).x_user_id : null;
      
      const response = await fetch("/api/posts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          content: contentToPost,
          x_user_id: xUserId, // ✅ Include x_user_id for NFT image lookup
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setTokenBalance(tokenBalance);
        setPoints(points);
        throw new Error(data.error || "Failed to create post");
      }

      console.log("✅ Post created successfully:", data.post);
      setNewPostContent("");
      
      // Optimistically add the new post to the top of the list
      if (data.post && data.post.id) {
        setPosts((prev) => {
          // Check if post already exists (to prevent duplicates)
          const exists = prev.some(p => p.id === data.post.id);
          if (exists) {
            console.log("Post already exists in list, skipping duplicate");
            return prev;
          }
          return [data.post, ...prev];
        });
        
        // Load NFT image for the new post immediately
        if (data.post.wallet_address) {
          console.log("🖼️ Loading NFT image for new post:", data.post.wallet_address.substring(0, 10));
          loadNftImage(data.post.wallet_address, data.post.x_user_id); // ✅ Pass x_user_id for priority lookup
        }
      }
      
      // Reload all data from server to ensure consistency
      await Promise.all([
        loadPosts(),
        loadTokenBalance(),
        loadTopStats(),
      ]);
    } catch (err: any) {
      console.error("❌ Error creating post:", err);
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
      alert("You need to load credits first. Credit purchase requires NFT ownership verification.");
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

      console.log("✅ Fav successful, new count:", data.favCount);
      
      // Update posts with the confirmed fav count from server
      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? { ...post, fav_count: Number(data.favCount) || 0 }
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
      console.error("❌ Error favoriting post:", err);
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

  // Handle profile search
  const handleProfileSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchError("Please enter a wallet address");
      return;
    }

    // Basic wallet address validation
    if (!/^0x[a-fA-F0-9]{40}$/.test(searchQuery.trim())) {
      setSearchError("Invalid wallet address format");
      return;
    }

    setSearching(true);
    setSearchError(null);

    try {
      // Select profile in sidebar instead of navigating
      setSelectedProfileWallet(searchQuery.trim().toLowerCase());
      setSearchQuery("");
    } catch (err: any) {
      setSearchError(err.message || "Failed to search profile");
    } finally {
      setSearching(false);
    }
  };

  const handleSearchKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleProfileSearch();
    }
  };

  const formatTimeAgo = (dateString: string) => {
    if (!dateString) return "just now";
    
    // Parse the date string - PostgreSQL returns UTC timestamps
    // Make sure we interpret it correctly
    let date: Date;
    try {
      // If the date string doesn't include timezone info, PostgreSQL returns UTC
      // We need to ensure it's parsed as UTC
      if (!dateString.includes('Z') && !dateString.includes('+')) {
        // Add Z to indicate UTC if not present
        date = new Date(dateString + 'Z');
      } else {
        date = new Date(dateString);
      }
    } catch (e) {
      console.error('Error parsing date:', dateString, e);
      return "just now";
    }
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date:', dateString);
      return "just now";
    }
    
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    // Handle negative differences (future dates) - shouldn't happen but just in case
    if (diffInSeconds < 0) {
      console.warn('Future date detected:', dateString, 'diff:', diffInSeconds);
      return "just now";
    }

    if (diffInSeconds < 60) return "just now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    
    // For older dates, show the actual date in local time
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black relative">
      {/* Chat Widget - Fixed on right side */}
      <ChatWidget 
        isOpen={isChatOpen} 
        onClose={() => setIsChatOpen(false)}
        initialWallet={selectedProfileWallet || undefined}
      />

      {/* Navbar */}
      <nav className="border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            <Link href="/" className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="text-lg sm:text-xl font-bold text-black dark:text-white whitespace-nowrap">
                XFRORA
              </div>
              <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">Social</span>
            </Link>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <ThemeToggle />
              <div className="scale-90 sm:scale-100 origin-right">
                <ConnectButton />
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content - 3 Column Layout */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Sidebar - Profiles */}
          {isProfileFeatureEnabled && (
            <aside className="lg:col-span-3 space-y-4">
              <ProfileSidebar
                selectedWallet={selectedProfileWallet}
                onSelectProfile={(wallet) => setSelectedProfileWallet(wallet)}
                onMessage={(wallet) => {
                  setSelectedProfileWallet(wallet);
                  setIsChatOpen(true);
                }}
              />
            </aside>
          )}

          {/* Center Column - Posts */}
          <div className={`${isProfileFeatureEnabled ? 'lg:col-span-6' : 'lg:col-span-8 lg:col-start-3'}`}>
            {/* Header */}
            <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-2">
            <h1 className="text-2xl sm:text-4xl font-bold text-black dark:text-white italic">
              XFroraSocial
            </h1>
            {isConnected && address && isProfileFeatureEnabled && (
              <button
                onClick={() => setSelectedProfileWallet(address.toLowerCase())}
                className="text-sm sm:text-base text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors"
              >
                My Profile
              </button>
            )}
            {/* Direct Message Button - Herkese görünür, sadece NFT sahipleri kullanabilir */}
            <button
              onClick={() => setIsChatOpen(!isChatOpen)}
              className="relative flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white font-semibold hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors text-sm sm:text-base w-full sm:w-auto"
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <span className="hidden sm:inline">Direct Messages</span>
              <span className="sm:hidden">Messages</span>
              {process.env.NODE_ENV === "development" && (
                <span className="text-xs bg-yellow-400 text-black px-1 rounded">DEV</span>
              )}
              {unreadCount > 0 && !isChatOpen && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center border-2 border-white dark:border-black z-10">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </div>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-4">
            Connect with the xFrora community
          </p>

          {/* Profile Search - Only visible to dev wallet */}
          {isProfileFeatureEnabled && (
            <div className="mb-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSearchError(null);
                  }}
                  onKeyPress={handleSearchKeyPress}
                  placeholder="Search wallet address to view profile..."
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-black text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white text-sm sm:text-base"
                />
                <button
                  onClick={handleProfileSearch}
                  disabled={searching || !searchQuery.trim()}
                  className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white font-semibold hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                >
                  {searching ? "..." : "Search"}
                </button>
              </div>
              {searchError && (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">{searchError}</p>
              )}
            </div>
          )}
        </div>

        {/* Stats Card */}
        {isConnected && address && (
          <div className="mb-6 p-4 sm:p-6 border border-gray-200 dark:border-gray-800">
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              <div className="text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">
                  Credits
                </p>
                <p className="text-xl sm:text-2xl font-bold text-black dark:text-white">
                  {tokenBalance !== null ? tokenBalance.toLocaleString() : "..."}
                </p>
              </div>
              <div className="text-center border-x border-gray-200 dark:border-gray-800">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">
                  Points
                </p>
                <p className="text-xl sm:text-2xl font-bold text-black dark:text-white">
                  {points !== null ? points.toLocaleString() : "..."}
                </p>
              </div>
              <div className="text-center flex items-center justify-center">
                <button
                  onClick={() => setShowPaymentModal(true)}
                  className="px-2 sm:px-4 py-1.5 sm:py-2 bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white font-semibold hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors text-xs sm:text-sm whitespace-nowrap"
                >
                  Load Credits
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Post Form */}
        {isConnected && address && tokenBalance !== null && tokenBalance > 0 && (
          <div className="mb-6 p-4 sm:p-6 border border-gray-200 dark:border-gray-800">
            <textarea
              value={newPostContent}
              onChange={(e) => setNewPostContent(e.target.value)}
              placeholder="What's happening?"
              maxLength={280}
              className="w-full p-3 sm:p-4 border border-gray-200 dark:border-gray-800 bg-white dark:bg-black text-black dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white mb-4 text-sm sm:text-base"
              rows={4}
            />
            <div className="flex items-center justify-between gap-2">
              <span className={`text-xs sm:text-sm ${newPostContent.length > 260 ? "text-red-500" : "text-gray-500 dark:text-gray-400"}`}>
                {newPostContent.length}/280
              </span>
              <button
                onClick={handleCreatePost}
                disabled={posting || !newPostContent.trim() || newPostContent.length > 280}
                className="px-4 sm:px-6 py-2 bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors text-xs sm:text-sm whitespace-nowrap"
              >
                {posting ? "Posting..." : "Post (20K credits)"}
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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm sm:text-base text-black dark:text-white">
                <span className="font-semibold">Load credits to get started.</span> Credit purchase requires NFT ownership verification.
              </p>
              <button
                onClick={() => setShowPaymentModal(true)}
                className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white font-semibold hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors text-sm sm:text-base whitespace-nowrap w-full sm:w-auto"
              >
                Load Credits
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
                className="p-4 sm:p-6 border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
              >
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="flex-shrink-0">
                    {nftImages[post.wallet_address] ? (
                      <img
                        src={nftImages[post.wallet_address]}
                        alt={`${post.wallet_address.substring(0, 6)}'s NFT`}
                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover border-2 border-black dark:border-white"
                        onError={(e) => {
                          // Fallback to default avatar if image fails to load
                          e.currentTarget.style.display = 'none';
                          if (e.currentTarget.nextSibling) {
                            (e.currentTarget.nextSibling as HTMLElement).style.display = 'flex';
                          }
                        }}
                      />
                    ) : null}
                    <div 
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black dark:bg-white text-white dark:text-black flex items-center justify-center font-bold text-xs border border-black dark:border-white"
                      style={{ display: nftImages[post.wallet_address] ? 'none' : 'flex' }}
                    >
                      {post.wallet_address.substring(0, 6)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 gap-1 mb-2">
                      {isProfileFeatureEnabled ? (
                        <button
                          onClick={() => setSelectedProfileWallet(post.wallet_address.toLowerCase())}
                          className="font-bold text-sm sm:text-base text-black dark:text-white hover:underline text-left"
                        >
                          {post.wallet_address.substring(0, 6)}...{post.wallet_address.substring(38)}
                        </button>
                      ) : (
                        <span className="font-bold text-sm sm:text-base text-black dark:text-white">
                          {post.wallet_address.substring(0, 6)}...{post.wallet_address.substring(38)}
                        </span>
                      )}
                      <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                        {formatTimeAgo(post.created_at)}
                      </span>
                    </div>
                    <p className="text-sm sm:text-base text-black dark:text-white mb-3 sm:mb-4 whitespace-pre-wrap break-words leading-relaxed">
                      {post.content}
                    </p>
                    <div className="flex items-center gap-4 sm:gap-6">
                      <button
                        onClick={() => handleFav(post.id)}
                        disabled={!isConnected || (tokenBalance !== null && tokenBalance < 100) || favLoading[post.id]}
                        className="flex items-center gap-1.5 sm:gap-2 text-gray-600 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <svg
                          className={`w-4 h-4 sm:w-5 sm:h-5 ${post.fav_count > 0 ? "text-red-500 fill-current" : ""}`}
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
                        <span className="font-semibold text-sm sm:text-base">{post.fav_count}</span>
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
          </div>
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
