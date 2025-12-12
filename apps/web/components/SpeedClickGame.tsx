"use client";

import { useState, useEffect, useRef } from "react";
import { useAccount } from "wagmi";

interface SpeedClickGameProps {
  onFreeTicketWon?: () => void;
}

interface GameStatus {
  canPlay: boolean;
  hasNFT: boolean;
  cost: number;
  currentBalance: number;
  pointsReward: number;
  targetsToWin: number;
  timePerTarget: number; // seconds
}

type GameState = "idle" | "waiting" | "playing" | "targetHit" | "targetMissed" | "won" | "lost";

export default function SpeedClickGame({ onFreeTicketWon }: SpeedClickGameProps) {
  const { address, isConnected } = useAccount();
  const [status, setStatus] = useState<GameStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [gameState, setGameState] = useState<GameState>("idle");
  const [currentTarget, setCurrentTarget] = useState(0);
  const [targetPosition, setTargetPosition] = useState({ x: 50, y: 50 });
  const [targetSize, setTargetSize] = useState(120); // Start with large target
  const [timeLeft, setTimeLeft] = useState(0.3);
  const [hits, setHits] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch game status
  useEffect(() => {
    if (isConnected && address) {
      fetchStatus();
    }
  }, [isConnected, address]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const fetchStatus = async () => {
    if (!address) return;
    
    setLoading(true);
    try {
      const response = await fetch(
        `/api/deep-research/speed-click?walletAddress=${address}`
      );
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      console.error("Error fetching game status:", error);
    } finally {
      setLoading(false);
    }
  };

  const startGame = async () => {
    if (!address || !status?.canPlay) return;

    setLoading(true);
    try {
      const response = await fetch("/api/deep-research/speed-click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address, action: "start" }),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.message || "Failed to start game");
        setLoading(false);
        return;
      }

      const data = await response.json();
      
      // Update status
      if (status) {
        setStatus({
          ...status,
          currentBalance: data.newBalance,
        });
      }

      // Reset game
      setCurrentTarget(0);
      setHits(0);
      setTargetSize(120); // Start large
      setGameState("waiting");
      setLoading(false);
      
      // Start first target after a short delay
      setTimeout(() => {
        spawnTarget();
      }, 1000);
      
    } catch (error: any) {
      console.error("Error starting game:", error);
      alert("Failed to start game. Please try again.");
      setLoading(false);
    }
  };

  const spawnTarget = () => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    
    // Random position (leave margin for target size)
    const margin = targetSize / 2 + 20;
    const x = margin + Math.random() * (containerRect.width - margin * 2);
    const y = margin + Math.random() * (containerRect.height - margin * 2);
    
    setTargetPosition({ x, y });
    setTimeLeft(0.3);
    setGameState("playing");

    // Start countdown timer
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = 0.3 - elapsed;
      
      if (remaining <= 0) {
        // Time's up - missed
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
        setGameState("targetMissed");
      } else {
        setTimeLeft(remaining);
      }
    }, 10); // Update every 10ms for smooth countdown
  };

  const handleTargetClick = () => {
    if (gameState !== "playing") return;

    // Clear timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    const newHits = hits + 1;
    setHits(newHits);
    setGameState("targetHit");

    // Check if won
    if (newHits >= (status?.targetsToWin || 7)) {
      // User won!
      setTimeout(() => {
        handleWin();
      }, 500);
    } else {
      // Continue to next target (wait for user to click continue)
      // Target gets smaller
      const newSize = Math.max(60, targetSize - 10); // Minimum 60px
      setTargetSize(newSize);
    }
  };

  const continueToNextTarget = () => {
    if (gameState !== "targetHit") return;
    
    setCurrentTarget(currentTarget + 1);
    setGameState("waiting");
    
    // Spawn next target after short delay
    setTimeout(() => {
      spawnTarget();
    }, 500);
  };

  const handleWin = async () => {
    if (!address) return;

    try {
      const response = await fetch("/api/deep-research/speed-click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address, action: "win" }),
      });

      if (response.ok) {
        setGameState("won");
        if (onFreeTicketWon) {
          setTimeout(() => {
            onFreeTicketWon();
          }, 2000);
        }
      }
    } catch (error) {
      console.error("Error recording win:", error);
    }
  };

  const resetGame = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    setGameState("idle");
    setCurrentTarget(0);
    setHits(0);
    setTargetSize(120);
    setTimeLeft(0.5);
  };

  if (!isConnected || !address) {
    return (
      <div className="p-6 border border-gray-300 dark:border-gray-700 rounded-lg text-center">
        <p className="text-gray-600 dark:text-gray-400">
          Connect your wallet to play
        </p>
      </div>
    );
  }

  if (loading && !status) {
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
          You must own an xFrora NFT to play
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 border border-gray-300 dark:border-gray-700 rounded-lg">
      <div className="text-center mb-6">
        <h3 className="text-xl font-bold mb-2">🎯 Speed Click Challenge</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Hit {status.targetsToWin} targets in {status.timePerTarget}s each!
        </p>
        
        {/* Balance */}
        <div className="mb-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Your Credits: <span className="font-bold">{status.currentBalance.toLocaleString()}</span>
          </p>
        </div>
      </div>

      {/* Game Container */}
      <div 
        ref={containerRef}
        className="relative mx-auto mb-6 bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden"
        style={{ 
          width: "100%", 
          height: "400px",
          minHeight: "400px",
          touchAction: "none", // Prevent scrolling on mobile
        }}
      >
        {gameState === "idle" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-lg font-semibold mb-4">Ready to play?</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Hit {status.targetsToWin} targets in {status.timePerTarget}s each
                <br />
                Targets get smaller each round!
              </p>
              <button
                onClick={startGame}
                disabled={!status.canPlay || loading}
                className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
                  status.canPlay && !loading
                    ? "bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200"
                    : "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                }`}
              >
                {loading ? "Starting..." : `Start Game (${status.cost.toLocaleString()} credits)`}
              </button>
              {!status.canPlay && (
                <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                  Insufficient credits. You need {status.cost.toLocaleString()} credits.
                </p>
              )}
            </div>
          </div>
        )}

        {gameState === "waiting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
            <div className="text-center text-white">
              <p className="text-2xl font-bold mb-2">Get Ready!</p>
              <p className="text-lg">Target {currentTarget + 1} of {status.targetsToWin}</p>
            </div>
          </div>
        )}

        {gameState === "playing" && (
          <>
            {/* Target */}
            <div
              onClick={handleTargetClick}
              onTouchStart={(e) => {
                e.preventDefault();
                handleTargetClick();
              }}
              className="absolute cursor-pointer transition-all duration-100 active:scale-95"
              style={{
                left: `${targetPosition.x - targetSize / 2}px`,
                top: `${targetPosition.y - targetSize / 2}px`,
                width: `${targetSize}px`,
                height: `${targetSize}px`,
                borderRadius: "50%",
                background: "radial-gradient(circle, #ef4444 0%, #dc2626 100%)",
                border: "4px solid white",
                boxShadow: "0 0 20px rgba(239, 68, 68, 0.6), 0 4px 12px rgba(0,0,0,0.3)",
                zIndex: 10,
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-lg">
                CLICK
              </div>
            </div>

            {/* Timer */}
            <div className="absolute top-4 left-4 bg-black bg-opacity-70 text-white px-4 py-2 rounded-lg">
              <p className="text-sm font-semibold">
                Time: {(timeLeft).toFixed(2)}s
              </p>
            </div>

            {/* Progress */}
            <div className="absolute top-4 right-4 bg-black bg-opacity-70 text-white px-4 py-2 rounded-lg">
              <p className="text-sm font-semibold">
                {hits} / {status.targetsToWin}
              </p>
            </div>
          </>
        )}

        {gameState === "targetHit" && (
          <div className="absolute inset-0 flex items-center justify-center bg-green-500 bg-opacity-20">
            <div className="text-center">
              <p className="text-3xl font-bold text-green-600 dark:text-green-400 mb-4">
                ✓ Hit!
              </p>
              <p className="text-lg mb-4">
                {hits} / {status.targetsToWin} targets hit
              </p>
              {hits < status.targetsToWin && (
                <button
                  onClick={continueToNextTarget}
                  className="px-6 py-3 bg-black dark:bg-white text-white dark:text-black rounded-lg font-semibold hover:bg-gray-800 dark:hover:bg-gray-200"
                >
                  Continue to Next Target
                </button>
              )}
            </div>
          </div>
        )}

        {gameState === "targetMissed" && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-500 bg-opacity-20">
            <div className="text-center">
              <p className="text-3xl font-bold text-red-600 dark:text-red-400 mb-4">
                ✗ Time's Up!
              </p>
              <p className="text-lg mb-4">
                You hit {hits} / {status.targetsToWin} targets
              </p>
              <button
                onClick={resetGame}
                className="px-6 py-3 bg-black dark:bg-white text-white dark:text-black rounded-lg font-semibold hover:bg-gray-800 dark:hover:bg-gray-200"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {gameState === "won" && (
          <div className="absolute inset-0 flex items-center justify-center bg-green-500 bg-opacity-30">
            <div className="text-center">
              <p className="text-4xl font-bold text-green-600 dark:text-green-400 mb-4">
                🎉 You Won!
              </p>
              <p className="text-xl mb-2">Free Analysis Ticket Earned!</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                You can now use it for your next analysis
              </p>
              <button
                onClick={resetGame}
                className="px-6 py-3 bg-black dark:bg-white text-white dark:text-black rounded-lg font-semibold hover:bg-gray-800 dark:hover:bg-gray-200"
              >
                Play Again
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Game Info */}
      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-800">
        <p className="text-sm font-semibold mb-2">How to Play:</p>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
          <li>• Click targets as they appear (0.5s each)</li>
          <li>• Targets get smaller each round</li>
          <li>• Hit all {status.targetsToWin} targets to win a free analysis ticket</li>
          <li>• Entry cost: {status.cost.toLocaleString()} credits</li>
          <li>• Entry reward: +{status.pointsReward} points</li>
        </ul>
      </div>
    </div>
  );
}

