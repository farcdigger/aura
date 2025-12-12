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
const FREE_ANALYSIS_SEGMENTS = 2; // 2 segments = 8% (2/25)
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
      
      // Determine which segment to land on based on actual reward
      // Segments: FREE(0), credits(1-11), FREE(12), credits(13-24)
      let targetSegment = 0;
      if (data.reward.type === "free_analysis") {
        // Land on one of the free analysis segments (0 or 12)
        targetSegment = Math.random() < 0.5 ? 0 : 12;
      } else {
        // Find the segment index for the credit reward amount
        const creditAmounts = [100, 500, 1000, 10000];
        const creditIndex = creditAmounts.indexOf(data.reward.amount);
        
        if (creditIndex !== -1) {
          // Find all segments with this credit amount
          const matchingSegments: number[] = [];
          for (let i = 0; i < WHEEL_SEGMENTS; i++) {
            if (i === 0 || i === 12) continue; // Skip FREE segments
            // Calculate which credit this segment should have
            const adjustedIndex = i > 12 ? i - 2 : i - 1; // Account for FREE at 0
            const segCreditIndex = adjustedIndex % 4;
            if (segCreditIndex === creditIndex) {
              matchingSegments.push(i);
            }
          }
          // Pick a random segment from matching ones
          if (matchingSegments.length > 0) {
            targetSegment = matchingSegments[Math.floor(Math.random() * matchingSegments.length)];
          } else {
            // Fallback
            targetSegment = creditIndex + 1;
          }
        } else {
          // Fallback: random credit segment
          const creditSegments = Array.from({ length: WHEEL_SEGMENTS }, (_, i) => i)
            .filter(i => i !== 0 && i !== 12);
          targetSegment = creditSegments[Math.floor(Math.random() * creditSegments.length)];
        }
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
  // FREE segments will be at position 0 and 12 (opposite sides)
  const segments: Array<{ label: string; color: string; gradient: string; isFree: boolean }> = [];
  
  const creditColors = [
    { base: "#3b82f6", light: "#60a5fa", dark: "#2563eb" }, // Blue
    { base: "#8b5cf6", light: "#a78bfa", dark: "#7c3aed" }, // Purple
    { base: "#ec4899", light: "#f472b6", dark: "#db2777" }, // Pink
    { base: "#f59e0b", light: "#fbbf24", dark: "#d97706" }, // Orange
  ];
  const creditAmounts = [100, 500, 1000, 10000];
  
  // Build segments: FREE at 0, credits, FREE at 12, more credits
  for (let i = 0; i < WHEEL_SEGMENTS; i++) {
    if (i === 0) {
      // First FREE segment
      segments.push({ 
        label: "FREE", 
        color: "#10b981", 
        gradient: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
        isFree: true 
      });
    } else if (i === 12) {
      // Second FREE segment (opposite side)
      segments.push({ 
        label: "FREE", 
        color: "#10b981", 
        gradient: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
        isFree: true 
      });
    } else {
      // Credit segments
      const creditIndex = (i - (i > 12 ? 1 : 1)) % 4; // Adjust for FREE segments
      const adjustedIndex = i > 12 ? i - 2 : i - 1; // Account for both FREE segments
      const finalCreditIndex = adjustedIndex % 4;
      segments.push({
        label: `${creditAmounts[finalCreditIndex].toLocaleString()} Credits`,
        color: creditColors[finalCreditIndex].base,
        gradient: `linear-gradient(135deg, ${creditColors[finalCreditIndex].light} 0%, ${creditColors[finalCreditIndex].dark} 100%)`,
        isFree: false,
      });
    }
  }

  return (
    <div className="p-6 border border-gray-300 dark:border-gray-700 rounded-lg">
      <div className="text-center mb-6">
        <h3 className="text-xl font-bold mb-2">Spin the Wheel</h3>
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
      <div className="relative mx-auto mb-6" style={{ width: "400px", height: "400px" }}>
        {/* Outer glow effect */}
        <div 
          className="absolute inset-0 rounded-full blur-2xl opacity-40"
          style={{
            background: "radial-gradient(circle, rgba(59,130,246,0.6) 0%, rgba(139,92,246,0.4) 50%, transparent 70%)",
            transform: "scale(1.15)",
          }}
        />
        
        <svg
          width="400"
          height="400"
          viewBox="0 0 400 400"
          className="absolute top-0 left-0"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? "transform 3s cubic-bezier(0.17, 0.67, 0.12, 0.99)" : "none",
            transformOrigin: "center",
            filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.4))",
          }}
        >
          <defs>
            {/* Radial gradient for 3D effect */}
            <radialGradient id="wheelShadow" cx="50%" cy="50%">
              <stop offset="0%" stopColor="rgba(0,0,0,0.1)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.3)" />
            </radialGradient>
            
            {segments.map((segment, index) => {
              const gradientId = `gradient-${index}`;
              const colorMatch = segment.gradient.match(/#[0-9a-fA-F]{6}/g);
              const colors = colorMatch && colorMatch.length >= 2 
                ? [colorMatch[0], colorMatch[1]] 
                : [segment.color, segment.color];
              return (
                <linearGradient key={gradientId} id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={colors[0]} stopOpacity="1" />
                  <stop offset="50%" stopColor={segment.color} stopOpacity="1" />
                  <stop offset="100%" stopColor={colors[1]} stopOpacity="0.9" />
                </linearGradient>
              );
            })}
          </defs>
          
          {/* Outer decorative rings */}
          <circle cx="200" cy="200" r="195" fill="none" stroke="url(#wheelShadow)" strokeWidth="8" opacity="0.3" />
          <circle cx="200" cy="200" r="190" fill="none" stroke="#1f2937" strokeWidth="4" className="dark:stroke-gray-300" />
          <circle cx="200" cy="200" r="185" fill="none" stroke="#374151" strokeWidth="1" className="dark:stroke-gray-400" opacity="0.5" />
          
          {segments.map((segment, index) => {
            const segmentAngle = 360 / WHEEL_SEGMENTS;
            const startAngle = (index * segmentAngle - 90) * (Math.PI / 180);
            const endAngle = ((index + 1) * segmentAngle - 90) * (Math.PI / 180);
            const radius = 185;
            
            const x1 = 200 + radius * Math.cos(startAngle);
            const y1 = 200 + radius * Math.sin(startAngle);
            const x2 = 200 + radius * Math.cos(endAngle);
            const y2 = 200 + radius * Math.sin(endAngle);
            
            const largeArc = segmentAngle > 180 ? 1 : 0;
            
            // Text position (middle of segment, closer to center)
            const textAngle = (startAngle + endAngle) / 2;
            const textRadius = 120;
            const textX = 200 + textRadius * Math.cos(textAngle);
            const textY = 200 + textRadius * Math.sin(textAngle);
            
            // Calculate rotation for vertical text
            const textRotation = (textAngle * 180 / Math.PI) + 90;
            
            return (
              <g key={index}>
                {/* Segment with gradient and shadow */}
                <path
                  d={`M 200 200 L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`}
                  fill={`url(#gradient-${index})`}
                  stroke="#1f2937"
                  strokeWidth="2.5"
                  className="dark:stroke-gray-300"
                  style={{
                    filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.3))",
                  }}
                />
                {/* Inner highlight for 3D effect */}
                <path
                  d={`M 200 200 L ${200 + 50 * Math.cos(startAngle)} ${200 + 50 * Math.sin(startAngle)} L ${200 + 50 * Math.cos(endAngle)} ${200 + 50 * Math.sin(endAngle)} Z`}
                  fill="rgba(255,255,255,0.15)"
                  opacity="0.4"
                />
                {/* Segment divider line */}
                <line
                  x1="200"
                  y1="200"
                  x2={x1}
                  y2={y1}
                  stroke="#1f2937"
                  strokeWidth="2"
                  className="dark:stroke-gray-300"
                  opacity="0.4"
                />
                {/* Vertical text */}
                <text
                  x={textX}
                  y={textY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="white"
                  fontSize="10"
                  fontWeight="700"
                  transform={`rotate(${textRotation} ${textX} ${textY})`}
                  style={{
                    textShadow: "2px 2px 4px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.7)",
                    letterSpacing: "0.5px",
                  }}
                >
                  {segment.label}
                </text>
              </g>
            );
          })}
          
          {/* Center circle with 3D effect */}
          <circle cx="200" cy="200" r="35" fill="#1f2937" className="dark:fill-gray-300" opacity="0.9" />
          <circle cx="200" cy="200" r="30" fill="#374151" className="dark:fill-gray-400" />
          <circle cx="200" cy="200" r="25" fill="url(#wheelShadow)" opacity="0.3" />
          <circle cx="200" cy="200" r="20" fill="#4b5563" className="dark:fill-gray-500" />
        </svg>
        
        {/* Modern pointer with glow */}
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-4 z-20">
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: "25px solid transparent",
              borderRight: "25px solid transparent",
              borderTop: "50px solid #ef4444",
              filter: "drop-shadow(0 6px 12px rgba(239,68,68,0.5)) drop-shadow(0 2px 4px rgba(0,0,0,0.4))",
            }}
          />
          <div
            className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1"
            style={{
              width: 0,
              height: 0,
              borderLeft: "18px solid transparent",
              borderRight: "18px solid transparent",
              borderTop: "38px solid #dc2626",
            }}
          />
        </div>
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

