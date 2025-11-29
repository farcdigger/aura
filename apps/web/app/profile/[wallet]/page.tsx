"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import ThemeToggle from "@/components/ThemeToggle";
import ChatWidget from "@/app/social/components/ChatWidget";
import { checkNFTOwnershipClientSide } from "@/lib/check-nft-ownership";

interface Post {
  id: number;
  wallet_address: string;
  x_user_id?: string | null;
  nft_token_id: number;
  content: string;
  fav_count: number;
  created_at: string;
}

interface ProfileData {
  wallet: string;
  username: string | null;
  profileImageUrl: string | null;
  nftTokenId: number | null;
  nftImageUrl: string | null;
  postCount: number;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
  isOwnProfile: boolean;
}

const DEV_WALLET = "0xedf8e693b3ab4899a03ab22edf90e36a6ac1fd9d".toLowerCase();

export default function ProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const wallet = (params.wallet as string)?.toLowerCase();

  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [nftImages, setNftImages] = useState<Record<string, string>>({});
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatTargetWallet, setChatTargetWallet] = useState<string | null>(null);
  const [hasNFT, setHasNFT] = useState(false);
  const [checkingNFT, setCheckingNFT] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [profileCreated, setProfileCreated] = useState(false);

  // Check if feature is enabled for current user
  const isFeatureEnabled = address?.toLowerCase() === DEV_WALLET;

  // Check NFT ownership
  useEffect(() => {
    const checkNFT = async () => {
      if (!address) {
        setHasNFT(false);
        return;
      }
      setCheckingNFT(true);
      const hasNFTResult = await checkNFTOwnershipClientSide(address);
      setHasNFT(hasNFTResult);
      setCheckingNFT(false);
    };
    checkNFT();
  }, [address]);

  // Load profile data
  const loadProfile = async () => {
    if (!wallet) return;

    try {
      setLoading(true);
      const currentWallet = address?.toLowerCase() || "";
      const response = await fetch(
        `/api/profile/${wallet}?currentWallet=${currentWallet}&t=${Date.now()}`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error("Failed to load profile");
      }

      const data = await response.json();
      setProfileData(data);
      setFollowing(data.isFollowing);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load posts
  const loadPosts = async () => {
    if (!wallet) return;

    try {
      setPostsLoading(true);
      const response = await fetch(
        `/api/profile/${wallet}/posts?t=${Date.now()}`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error("Failed to load posts");
      }

      const data = await response.json();
      setPosts(data.posts || []);

      // Load NFT images
      data.posts?.forEach((post: Post) => {
        if (post.wallet_address) {
          loadNftImage(post.wallet_address, post.x_user_id);
        }
      });
    } catch (err: any) {
      console.error("Error loading posts:", err);
    } finally {
      setPostsLoading(false);
    }
  };

  // Load NFT image
  const loadNftImage = async (walletAddress: string, xUserId?: string | null) => {
    if (!walletAddress || nftImages[walletAddress]) return;

    try {
      const queryParam = xUserId
        ? `x_user_id=${xUserId}`
        : `wallet=${walletAddress}`;

      const response = await fetch(
        `/api/nft-image?${queryParam}&t=${Date.now()}`,
        { cache: 'no-store' }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.hasNFT && data.imageUrl) {
          setNftImages((prev) => ({ ...prev, [walletAddress]: data.imageUrl }));
        }
      }
    } catch (err) {
      console.error("Error loading NFT image:", err);
    }
  };

  // Handle follow/unfollow
  const handleFollow = async () => {
    if (!address || !wallet || !isFeatureEnabled) return;

    setFollowLoading(true);
    try {
      const action = following ? "unfollow" : "follow";
      const response = await fetch(`/api/profile/${wallet}/follow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentWallet: address.toLowerCase(),
          action,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update follow status");
      }

      setFollowing(!following);
      // Reload profile to update counts
      loadProfile();
    } catch (err: any) {
      alert(err.message || "Failed to update follow status");
    } finally {
      setFollowLoading(false);
    }
  };

  // Handle message button click
  const handleMessage = () => {
    if (!wallet) return;
    setChatTargetWallet(wallet);
    setIsChatOpen(true);
  };

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

      setProfileCreated(true);
      // Reload profile data
      await loadProfile();
      // Redirect to own profile
      router.push(`/profile/${address.toLowerCase()}`);
    } catch (err: any) {
      alert(err.message || "Failed to create profile");
    } finally {
      setCreatingProfile(false);
    }
  };

  useEffect(() => {
    if (wallet) {
      loadProfile();
      loadPosts();
    }
  }, [wallet, address]);

  // Load profile image NFT
  useEffect(() => {
    if (profileData?.wallet && !profileData.nftImageUrl) {
      loadNftImage(profileData.wallet);
    }
  }, [profileData]);

  const formatTimeAgo = (dateString: string) => {
    if (!dateString) return "just now";
    let date: Date;
    try {
      if (!dateString.includes('Z') && !dateString.includes('+')) {
        date = new Date(dateString + 'Z');
      } else {
        date = new Date(dateString);
      }
    } catch (e) {
      return "just now";
    }
    if (isNaN(date.getTime())) return "just now";
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffInSeconds < 0) return "just now";
    if (diffInSeconds < 60) return "just now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  // Show feature disabled message if not enabled
  if (!isFeatureEnabled) {
    return (
      <div className="min-h-screen bg-white dark:bg-black">
        <nav className="border-b border-gray-200 dark:border-gray-800">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center justify-between gap-2">
              <Link href="/social" className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="text-lg sm:text-xl font-bold text-black dark:text-white whitespace-nowrap">
                  XFRORA
                </div>
                <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">Profile</span>
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
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          <div className="text-center py-16">
            <p className="text-xl font-semibold text-black dark:text-white mb-4">
              Profile feature is under development
            </p>
            <Link
              href="/social"
              className="inline-block px-4 py-2 bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white font-semibold hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors"
            >
              Back to Social
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black relative">
      {/* Chat Widget */}
      <ChatWidget 
        isOpen={isChatOpen} 
        onClose={() => {
          setIsChatOpen(false);
          setChatTargetWallet(null);
        }}
        initialWallet={chatTargetWallet || undefined}
      />

      {/* Navbar */}
      <nav className="border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            <Link href="/social" className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="text-lg sm:text-xl font-bold text-black dark:text-white whitespace-nowrap">
                XFRORA
              </div>
              <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">Profile</span>
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

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        {loading ? (
          <div className="text-center py-16">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-2 border-black dark:border-white border-t-transparent"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading profile...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12 p-6 border border-red-300 dark:border-red-700">
            <p className="text-red-600 dark:text-red-400 font-semibold">{error}</p>
            <Link
              href="/social"
              className="mt-4 inline-block px-4 py-2 bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white font-semibold hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors"
            >
              Back to Social
            </Link>
          </div>
        ) : !profileData && !loading && isConnected && address && wallet === address.toLowerCase() ? (
          <>
            {/* Create Profile Button - Show if viewing own profile but profile doesn't exist */}
            <div className="mb-6 p-6 border border-gray-200 dark:border-gray-800 text-center">
              <h2 className="text-xl font-bold text-black dark:text-white mb-2">
                Create Your Profile
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {checkingNFT 
                  ? "Checking NFT ownership..." 
                  : hasNFT 
                  ? "You own an xFrora NFT! Create your profile to get started."
                  : "You need to own an xFrora NFT to create a profile."}
              </p>
              {!checkingNFT && hasNFT && (
                <button
                  onClick={handleCreateProfile}
                  disabled={creatingProfile}
                  className="px-6 py-2 bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white font-semibold hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creatingProfile ? "Creating..." : "Create Profile"}
                </button>
              )}
            </div>
          </>
        ) : profileData ? (
          <>
            {/* Profile Header */}
            <div className="mb-6 border-b border-gray-200 dark:border-gray-800 pb-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4">
                {/* Profile Image */}
                <div className="flex-shrink-0">
                  {profileData.nftImageUrl || nftImages[profileData.wallet] ? (
                    <img
                      src={profileData.nftImageUrl || nftImages[profileData.wallet]}
                      alt="Profile"
                      className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-2 border-black dark:border-white"
                    />
                  ) : (
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-black dark:bg-white text-white dark:text-black flex items-center justify-center font-bold text-lg border-2 border-black dark:border-white">
                      {profileData.wallet.substring(0, 6)}
                    </div>
                  )}
                </div>

                {/* Profile Info */}
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl sm:text-3xl font-bold text-black dark:text-white mb-2">
                    {profileData.username || `${profileData.wallet.substring(0, 6)}...${profileData.wallet.substring(38)}`}
                  </h1>
                  <p className="text-sm text-gray-600 dark:text-gray-400 font-mono mb-4 break-all">
                    {profileData.wallet}
                  </p>

                  {/* Stats */}
                  <div className="flex gap-6 mb-4">
                    <div>
                      <span className="font-bold text-black dark:text-white">{profileData.postCount}</span>
                      <span className="text-gray-600 dark:text-gray-400 ml-1">Posts</span>
                    </div>
                    <div>
                      <span className="font-bold text-black dark:text-white">{profileData.followerCount}</span>
                      <span className="text-gray-600 dark:text-gray-400 ml-1">Followers</span>
                    </div>
                    <div>
                      <span className="font-bold text-black dark:text-white">{profileData.followingCount}</span>
                      <span className="text-gray-600 dark:text-gray-400 ml-1">Following</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  {isConnected && address && (
                    <div className="flex gap-2">
                      {!profileData.isOwnProfile && (
                        <>
                          <button
                            onClick={handleFollow}
                            disabled={followLoading}
                            className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white font-semibold hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {followLoading ? "..." : following ? "Unfollow" : "Follow"}
                          </button>
                          <button
                            onClick={handleMessage}
                            className="px-4 py-2 bg-white dark:bg-black text-black dark:text-white border border-black dark:border-white font-semibold hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
                          >
                            Message
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Posts */}
            <div>
              <h2 className="text-xl font-bold text-black dark:text-white mb-4">Posts</h2>
              {postsLoading ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-black dark:border-white border-t-transparent"></div>
                </div>
              ) : posts.length === 0 ? (
                <div className="text-center py-12 p-6 border border-gray-200 dark:border-gray-800">
                  <p className="text-gray-600 dark:text-gray-400">No posts yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {posts.map((post) => (
                    <div
                      key={post.id}
                      className="p-4 sm:p-6 border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
                    >
                      <div className="flex items-start gap-3 sm:gap-4">
                        <div className="flex-shrink-0">
                          {nftImages[post.wallet_address] ? (
                            <img
                              src={nftImages[post.wallet_address]}
                              alt="NFT"
                              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover border-2 border-black dark:border-white"
                            />
                          ) : (
                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black dark:bg-white text-white dark:text-black flex items-center justify-center font-bold text-xs border border-black dark:border-white">
                              {post.wallet_address.substring(0, 6)}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 gap-1 mb-2">
                            <span className="font-bold text-sm sm:text-base text-black dark:text-white">
                              {post.wallet_address.substring(0, 6)}...{post.wallet_address.substring(38)}
                            </span>
                            <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                              {formatTimeAgo(post.created_at)}
                            </span>
                          </div>
                          <p className="text-sm sm:text-base text-black dark:text-white mb-3 sm:mb-4 whitespace-pre-wrap break-words leading-relaxed">
                            {post.content}
                          </p>
                          <div className="flex items-center gap-4 sm:gap-6">
                            <div className="flex items-center gap-1.5 sm:gap-2 text-gray-600 dark:text-gray-400">
                              <svg
                                className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 fill-current"
                                fill="currentColor"
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
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}

