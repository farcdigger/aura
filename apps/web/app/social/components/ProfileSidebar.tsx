"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { checkNFTOwnershipClientSide } from "@/lib/check-nft-ownership";

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

interface ProfileSidebarProps {
  selectedWallet: string | null;
  onSelectProfile: (wallet: string) => void;
  onMessage: (wallet: string) => void;
}

export default function ProfileSidebar({ 
  selectedWallet, 
  onSelectProfile, 
  onMessage
}: ProfileSidebarProps) {
  const { address } = useAccount();
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasNFT, setHasNFT] = useState(false);
  const [checkingNFT, setCheckingNFT] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

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

      if (hasNFTResult) {
        // Check if profile exists
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
        }
      }
    };
    checkNFT();
  }, [address]);

  // Load profile data when selectedWallet changes
  useEffect(() => {
    if (selectedWallet) {
      loadProfile(selectedWallet);
    } else if (address) {
      // Load own profile by default
      loadProfile(address.toLowerCase());
    }
  }, [selectedWallet, address]);

  const loadProfile = async (wallet: string) => {
    if (!wallet) return;

    try {
      setLoading(true);
      const currentWallet = address?.toLowerCase() || "";
      const response = await fetch(
        `/api/profile/${wallet}?currentWallet=${currentWallet}&t=${Date.now()}`,
        { cache: 'no-store' }
      );

      if (response.ok) {
        const data = await response.json();
        setProfileData(data);
        setFollowing(data.isFollowing);
      } else {
        setProfileData(null);
      }
    } catch (err) {
      console.error("Error loading profile:", err);
      setProfileData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProfile = async () => {
    if (!address) return;

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
      // Reload own profile
      loadProfile(address.toLowerCase());
    } catch (err: any) {
      alert(err.message || "Failed to create profile");
    } finally {
      setCreatingProfile(false);
    }
  };

  const handleFollowClick = async () => {
    if (!profileData || !address || profileData.isOwnProfile) return;

    setFollowLoading(true);
    try {
      const action = following ? "unfollow" : "follow";
      const response = await fetch(`/api/profile/${profileData.wallet}/follow`, {
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
      loadProfile(profileData.wallet);
    } catch (err: any) {
      alert(err.message || "Failed to update follow status");
    } finally {
      setFollowLoading(false);
    }
  };

  // Show create profile if no profile exists
  if (address && !hasProfile && hasNFT && !selectedWallet) {
    return (
      <div className="p-4 border border-gray-200 dark:border-gray-800 bg-white dark:bg-black">
        <h3 className="text-lg font-bold text-black dark:text-white mb-4">Your Profile</h3>
        <div className="text-center py-8">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Create your profile to get started
          </p>
          <button
            onClick={handleCreateProfile}
            disabled={creatingProfile || checkingNFT}
            className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white font-semibold hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {creatingProfile ? "Creating..." : checkingNFT ? "Checking..." : "Create Profile"}
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 border border-gray-200 dark:border-gray-800 bg-white dark:bg-black">
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-black dark:border-white border-t-transparent"></div>
        </div>
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="p-4 border border-gray-200 dark:border-gray-800 bg-white dark:bg-black">
        <h3 className="text-lg font-bold text-black dark:text-white mb-4">Profile</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">No profile found</p>
      </div>
    );
  }

  return (
    <div className="p-4 border border-gray-200 dark:border-gray-800 bg-white dark:bg-black">
      <h3 className="text-lg font-bold text-black dark:text-white mb-4">
        {profileData.isOwnProfile ? "Your Profile" : "Profile"}
      </h3>
      
      <div className="space-y-4">
        {/* Profile Image */}
        <div className="flex justify-center">
          {profileData.nftImageUrl ? (
            <img
              src={profileData.nftImageUrl}
              alt="Profile"
              className="w-20 h-20 rounded-full object-cover border-2 border-black dark:border-white"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-black dark:bg-white text-white dark:text-black flex items-center justify-center font-bold text-sm border-2 border-black dark:border-white">
              {profileData.wallet.substring(0, 6)}
            </div>
          )}
        </div>

        {/* Profile Info */}
        <div className="text-center">
          <h4 className="font-bold text-black dark:text-white mb-1">
            {profileData.username || `${profileData.wallet.substring(0, 6)}...${profileData.wallet.substring(38)}`}
          </h4>
          <p className="text-xs text-gray-600 dark:text-gray-400 font-mono break-all">
            {profileData.wallet}
          </p>
        </div>

        {/* Stats */}
        <div className="flex justify-around border-t border-b border-gray-200 dark:border-gray-800 py-3">
          <div className="text-center">
            <div className="font-bold text-black dark:text-white">{profileData.postCount}</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Posts</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-black dark:text-white">{profileData.followerCount}</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Followers</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-black dark:text-white">{profileData.followingCount}</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Following</div>
          </div>
        </div>

        {/* Action Buttons */}
        {address && (
          <div className="space-y-2">
            {!profileData.isOwnProfile && (
              <>
                <button
                  onClick={handleFollowClick}
                  disabled={followLoading}
                  className="w-full px-4 py-2 bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white font-semibold hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {followLoading ? "..." : following ? "Unfollow" : "Follow"}
                </button>
                <button
                  onClick={() => onMessage(profileData.wallet)}
                  className="w-full px-4 py-2 bg-white dark:bg-black text-black dark:text-white border border-black dark:border-white font-semibold hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors text-sm"
                >
                  Message
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

