"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";

interface SpinWheelProps {
  onFreeAnalysisWon?: () => void;
}

interface WheelStatus {
  canSpin: boolean;
  hasNFT: boolean;
  cost: number;
  currentBalance: number;
  pointsReward: number;
  freeAnalysisChance: number;
  creditRewards: Array<{ credits: number; chance: number }>;
}

const WHEEL_SEGMENTS = 25; // Total segments on the wheel
const FREE_ANALYSIS_SEGMENTS = 1; // 1 segment = 4% (1/25)
const CREDIT_SEGMENTS = WHEEL_SEGMENTS - FREE_ANALYSIS_SEGMENTS;

export default function SpinWheel({ onFreeAnalysisWon }: SpinWheelProps) {
  const { address, isConnected } = useAccount();
  const [status, setStatus] = useState<WheelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{
    type: "free_analysis" | "credits";
    amount: number;
  } | null>(null);
  const [rotation, setRotation] = useState(0);
  const [showResult, setShowResult] = useState(false);

  // Fetch wheel status
  useEffect(() => {
    if (isConnected && address) {
      fetchStatus();
    }
  }, [isConnected, address]);

  const fetchStatus = async () => {
    if (!address) return;
    
    setLoading(true);
    try {
      const response = await fetch(
        `/api/deep-research/spin-wheel?walletAddress=${address}`
      );
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      console.error("Error fetching wheel status:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSpin = async () => {
    if (!address || !status?.canSpin || spinning) return;

    setSpinning(true);
    setResult(null);
    setShowResult(false);

    try {
      const response = await fetch("/api/deep-research/spin-wheel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.message || "Failed to spin wheel");
        setSpinning(false);
        return;
      }

      const data = await response.json();
      
      // Calculate rotation (spin multiple times + land on result)
      const baseRotation = 360 * 5; // 5 full rotations
      const segmentAngle = 360 / WHEEL_SEGMENTS;
      
      // Determine which segment to land on
      let targetSegment = 0;
      if (data.reward.type === "free_analysis") {
        // Land on free analysis segment (first segment)
        targetSegment = 0;
      } else {
        // Land on a random credit segment
        targetSegment = Math.floor(Math.random() * CREDIT_SEGMENTS) + FREE_ANALYSIS_SEGMENTS;
      }
      
      const targetRotation = baseRotation + (targetSegment * segmentAngle) + (segmentAngle / 2);
      
      setRotation(targetRotation);
      setResult(data.reward);
      
      // Wait for animation to complete
      setTimeout(() => {
        setShowResult(true);
        setSpinning(false);
        
        // Update status
        if (status) {
          setStatus({
            ...status,
            currentBalance: data.newBalance,
          });
        }
        
        // Callback if free analysis won
        if (data.reward.type === "free_analysis" && onFreeAnalysisWon) {
          setTimeout(() => {
            onFreeAnalysisWon();
          }, 2000);
        }
      }, 3000);
      
    } catch (error: any) {
      console.error("Error spinning wheel:", error);
      alert("Failed to spin wheel. Please try again.");
      setSpinning(false);
    }
  };

  if (!isConnected || !address) {
    return (
      <div className="p-6 border border-gray-300 dark:border-gray-700 rounded-lg text-center">
        <p className="text-gray-600 dark:text-gray-400">
          Connect your wallet to spin the wheel
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 border border-gray-300 dark:border-gray-700 rounded-lg text-center">
        <p className="text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!status?.hasNFT) {
    return (
      <div className="p-6 border border-gray-300 dark:border-gray-700 rounded-lg text-center">
        <p className="text-gray-600 dark:text-gray-400 mb-2">
          NFT ownership required
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-500">
          You must own an xFrora NFT to spin the wheel
        </p>
      </div>
    );
  }

  // Generate wheel segments
  const segments: Array<{ label: string; color: string }> = [];
  
  // Free analysis segment (green)
  segments.push({ label: "FREE", color: "#10b981" });
  
  // Credit segments (various colors)
  const creditColors = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b"];
  for (let i = 0; i < CREDIT_SEGMENTS; i++) {
    const creditIndex = i % 4;
    const creditAmounts = [100, 500, 1000, 10000];
    segments.push({
      label: `${creditAmounts[creditIndex]}`,
      color: creditColors[creditIndex],
    });
  }

  return (
    <div className="p-6 border border-gray-300 dark:border-gray-700 rounded-lg">
      <div className="text-center mb-6">
        <h3 className="text-xl font-bold mb-2">🎰 Spin the Wheel</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Spend {status.cost.toLocaleString()} credits for a chance to win!
        </p>
        
        {/* Balance */}
        <div className="mb-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Your Credits: <span className="font-bold">{status.currentBalance.toLocaleString()}</span>
          </p>
        </div>
      </div>

      {/* Wheel Container */}
      <div className="relative mx-auto mb-6" style={{ width: "300px", height: "300px" }}>
        <div
          className="relative w-full h-full rounded-full border-4 border-gray-800 dark:border-gray-200 overflow-hidden"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? "transform 3s cubic-bezier(0.17, 0.67, 0.12, 0.99)" : "none",
          }}
        >
          {segments.map((segment, index) => {
            const angle = (360 / WHEEL_SEGMENTS) * index;
            const segmentAngle = 360 / WHEEL_SEGMENTS;
            
            return (
              <div
                key={index}
                className="absolute origin-center"
                style={{
                  width: "50%",
                  height: "50%",
                  transform: `rotate(${angle}deg)`,
                  transformOrigin: "100% 100%",
                  clipPath: `polygon(0 0, 100% 0, 100% 100%)`,
                  backgroundColor: segment.color,
                }}
              >
                <div
                  className="absolute text-white font-bold text-xs"
                  style={{
                    top: "10px",
                    left: "50%",
                    transform: `translateX(-50%) rotate(${segmentAngle / 2}deg)`,
                    transformOrigin: "center",
                  }}
                >
                  {segment.label}
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Pointer */}
        <div
          className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-2"
          style={{
            width: 0,
            height: 0,
            borderLeft: "15px solid transparent",
            borderRight: "15px solid transparent",
            borderTop: "30px solid #ef4444",
            zIndex: 10,
          }}
        />
      </div>

      {/* Spin Button */}
      <div className="text-center">
        <button
          onClick={handleSpin}
          disabled={!status.canSpin || spinning}
          className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
            status.canSpin && !spinning
              ? "bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200"
              : "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
          }`}
        >
          {spinning ? "Spinning..." : `Spin (${status.cost.toLocaleString()} credits)`}
        </button>
        
        {!status.canSpin && (
          <p className="text-sm text-red-600 dark:text-red-400 mt-2">
            Insufficient credits. You need {status.cost.toLocaleString()} credits.
          </p>
        )}
      </div>

      {/* Result Modal */}
      {showResult && result && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-black border border-gray-300 dark:border-gray-700 rounded-lg p-8 max-w-md mx-4 text-center">
            <h3 className="text-2xl font-bold mb-4">
              {result.type === "free_analysis" ? "🎉 Congratulations!" : "🎁 You Won!"}
            </h3>
            <div className="mb-6">
              {result.type === "free_analysis" ? (
                <div>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400 mb-2">
                    FREE ANALYSIS
                  </p>
                  <p className="text-gray-600 dark:text-gray-400">
                    You won a free deep research analysis!
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-2">
                    {result.amount.toLocaleString()} Credits
                  </p>
                  <p className="text-gray-600 dark:text-gray-400">
                    Credits have been added to your account
                  </p>
                </div>
              )}
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-4">
                +{status.pointsReward} points earned
              </p>
            </div>
            <button
              onClick={() => {
                setShowResult(false);
                setResult(null);
                fetchStatus();
              }}
              className="px-6 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg font-semibold hover:bg-gray-800 dark:hover:bg-gray-200"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Rewards Info */}
      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-800">
        <p className="text-sm font-semibold mb-2">Rewards:</p>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
          <li>🎁 Free Analysis: {((status.freeAnalysisChance * 100).toFixed(1))}% chance</li>
          {status.creditRewards.map((reward, index) => (
            <li key={index}>
              💰 {reward.credits.toLocaleString()} Credits: {reward.chance.toFixed(1)}% chance
            </li>
          ))}
          <li className="pt-2 border-t border-gray-200 dark:border-gray-800">
            ⭐ +{status.pointsReward} points every spin
          </li>
        </ul>
      </div>
    </div>
  );
}

