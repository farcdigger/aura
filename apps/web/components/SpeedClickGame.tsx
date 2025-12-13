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
  const [timeLeft, setTimeLeft] = useState(0.4);
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
    const timePerTarget = status?.timePerTarget || 0.4;
    setTimeLeft(timePerTarget);
    setGameState("playing");

    // Start countdown timer
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = timePerTarget - elapsed;
      
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
    setTimeLeft(0.4);
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
    <div className="p-6 border-2 border-cyan-500/30 rounded-lg bg-gradient-to-br from-purple-900/20 via-pink-900/20 to-cyan-900/20 backdrop-blur-sm">
      <div className="text-center mb-6">
        <h3 className="text-2xl font-bold mb-2 bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(255,0,255,0.5)]">
          ⚡ SPEED CLICK CHALLENGE ⚡
        </h3>
        <p className="text-sm text-cyan-300 mb-4 font-semibold drop-shadow-[0_0_4px_rgba(0,255,255,0.5)]">
          Hit {status.targetsToWin} targets in {status.timePerTarget}s each!
        </p>
        
        {/* Balance */}
        <div className="mb-4">
          <p className="text-sm text-pink-300 font-semibold">
            Your Credits: <span className="font-bold text-cyan-300 drop-shadow-[0_0_4px_rgba(0,255,255,0.5)]">{status.currentBalance.toLocaleString()}</span>
          </p>
        </div>
      </div>

      {/* Game Container */}
      <div 
        ref={containerRef}
        className="relative mx-auto mb-6 rounded-lg overflow-hidden border-2 border-cyan-500/50"
        style={{ 
          width: "100%", 
          height: "400px",
          minHeight: "400px",
          touchAction: "none", // Prevent scrolling on mobile
          background: "linear-gradient(180deg, #0a0a0a 0%, #1a0a2e 25%, #16213e 50%, #0f3460 75%, #0a0a0a 100%)",
          position: "relative",
        }}
      >
        {/* Synthwave Grid Pattern */}
        <div 
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `
              linear-gradient(cyan 1px, transparent 1px),
              linear-gradient(90deg, cyan 1px, transparent 1px)
            `,
            backgroundSize: "40px 40px",
          }}
        />
        
        {/* Synthwave Sun Effect */}
        <div 
          className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-96 h-96 opacity-30"
          style={{
            background: "radial-gradient(circle, rgba(255,0,255,0.4) 0%, rgba(0,255,255,0.2) 30%, transparent 70%)",
            filter: "blur(40px)",
          }}
        />
        {gameState === "idle" && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-center">
              <p className="text-2xl font-bold mb-4 bg-gradient-to-r from-pink-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(255,0,255,0.5)]">
                READY TO PLAY?
              </p>
              <p className="text-sm text-cyan-300 mb-6 font-semibold drop-shadow-[0_0_4px_rgba(0,255,255,0.5)]">
                Hit {status.targetsToWin} targets in {status.timePerTarget}s each
                <br />
                <span className="text-pink-300">Targets get smaller each round!</span>
              </p>
              <button
                onClick={startGame}
                disabled={!status.canPlay || loading}
                className={`px-8 py-4 rounded-lg font-bold text-lg transition-all duration-300 ${
                  status.canPlay && !loading
                    ? "bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 text-white hover:shadow-[0_0_20px_rgba(255,0,255,0.6)] hover:scale-105 border-2 border-cyan-300"
                    : "bg-gray-700 text-gray-400 cursor-not-allowed opacity-50"
                }`}
                style={{
                  textShadow: status.canPlay && !loading ? "0 0 10px rgba(255,255,255,0.8)" : "none",
                  boxShadow: status.canPlay && !loading ? "0 0 20px rgba(0,255,255,0.4), inset 0 0 20px rgba(255,0,255,0.2)" : "none",
                }}
              >
                {loading ? "STARTING..." : `START GAME (${status.cost.toLocaleString()} CREDITS)`}
              </button>
              {!status.canPlay && (
                <p className="text-sm text-red-400 mt-4 font-semibold drop-shadow-[0_0_4px_rgba(255,0,0,0.5)]">
                  Insufficient credits. You need {status.cost.toLocaleString()} credits.
                </p>
              )}
            </div>
          </div>
        )}

        {gameState === "waiting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-10">
            <div className="text-center">
              <p className="text-4xl font-bold mb-4 bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(255,0,255,0.8)] animate-pulse">
                GET READY!
              </p>
              <p className="text-2xl text-cyan-300 font-bold drop-shadow-[0_0_8px_rgba(0,255,255,0.6)]">
                Target {currentTarget + 1} of {status.targetsToWin}
              </p>
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
              className="absolute cursor-pointer transition-all duration-100 active:scale-95 z-10 animate-pulse"
              style={{
                left: `${targetPosition.x - targetSize / 2}px`,
                top: `${targetPosition.y - targetSize / 2}px`,
                width: `${targetSize}px`,
                height: `${targetSize}px`,
                borderRadius: "50%",
                background: "radial-gradient(circle, #ff00ff 0%, #8b00ff 50%, #00ffff 100%)",
                border: "4px solid #00ffff",
                boxShadow: `
                  0 0 30px rgba(255, 0, 255, 0.8),
                  0 0 60px rgba(0, 255, 255, 0.6),
                  0 0 90px rgba(139, 0, 255, 0.4),
                  inset 0 0 20px rgba(255, 255, 255, 0.3)
                `,
                animation: "pulse 1s ease-in-out infinite",
              }}
            >
              <div 
                className="absolute inset-0 flex items-center justify-center font-bold text-white"
                style={{
                  fontSize: `${Math.max(14, targetSize / 8)}px`,
                  textShadow: "0 0 10px rgba(0,255,255,0.8), 0 0 20px rgba(255,0,255,0.6)",
                  fontWeight: "900",
                  letterSpacing: "2px",
                }}
              >
                CLICK
              </div>
            </div>

            {/* Timer */}
            <div 
              className="absolute top-4 left-4 px-4 py-2 rounded-lg border-2 border-cyan-500/50 z-10"
              style={{
                background: "linear-gradient(135deg, rgba(0,255,255,0.2) 0%, rgba(255,0,255,0.2) 100%)",
                backdropFilter: "blur(10px)",
              }}
            >
              <p className="text-sm font-bold text-cyan-300 drop-shadow-[0_0_6px_rgba(0,255,255,0.8)]">
                TIME: {(timeLeft).toFixed(2)}s
              </p>
            </div>

            {/* Progress */}
            <div 
              className="absolute top-4 right-4 px-4 py-2 rounded-lg border-2 border-pink-500/50 z-10"
              style={{
                background: "linear-gradient(135deg, rgba(255,0,255,0.2) 0%, rgba(139,0,255,0.2) 100%)",
                backdropFilter: "blur(10px)",
              }}
            >
              <p className="text-sm font-bold text-pink-300 drop-shadow-[0_0_6px_rgba(255,0,255,0.8)]">
                {hits} / {status.targetsToWin}
              </p>
            </div>
          </>
        )}

        {gameState === "targetHit" && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-cyan-500/20 via-green-500/20 to-pink-500/20 backdrop-blur-sm z-10">
            <div className="text-center">
              <p className="text-5xl font-bold mb-4 bg-gradient-to-r from-cyan-400 via-green-400 to-pink-400 bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(0,255,255,0.8)] animate-bounce">
                ✓ HIT!
              </p>
              <p className="text-xl text-cyan-300 mb-6 font-bold drop-shadow-[0_0_8px_rgba(0,255,255,0.6)]">
                {hits} / {status.targetsToWin} targets hit
              </p>
              {hits < status.targetsToWin && (
                <button
                  onClick={continueToNextTarget}
                  className="px-8 py-4 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 text-white rounded-lg font-bold text-lg hover:shadow-[0_0_25px_rgba(0,255,255,0.7)] hover:scale-105 transition-all duration-300 border-2 border-cyan-300"
                  style={{
                    textShadow: "0 0 10px rgba(255,255,255,0.8)",
                    boxShadow: "0 0 20px rgba(0,255,255,0.5), inset 0 0 20px rgba(255,0,255,0.2)",
                  }}
                >
                  CONTINUE TO NEXT TARGET
                </button>
              )}
            </div>
          </div>
        )}

        {gameState === "targetMissed" && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-red-500/20 via-orange-500/20 to-pink-500/20 backdrop-blur-sm z-10">
            <div className="text-center">
              <p className="text-5xl font-bold mb-4 bg-gradient-to-r from-red-400 via-orange-400 to-pink-400 bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(255,0,0,0.8)]">
                ✗ TIME'S UP!
              </p>
              <p className="text-xl text-red-300 mb-6 font-bold drop-shadow-[0_0_8px_rgba(255,0,0,0.6)]">
                You hit {hits} / {status.targetsToWin} targets
              </p>
              <button
                onClick={resetGame}
                className="px-8 py-4 bg-gradient-to-r from-red-500 via-orange-500 to-pink-500 text-white rounded-lg font-bold text-lg hover:shadow-[0_0_25px_rgba(255,0,0,0.7)] hover:scale-105 transition-all duration-300 border-2 border-red-300"
                style={{
                  textShadow: "0 0 10px rgba(255,255,255,0.8)",
                  boxShadow: "0 0 20px rgba(255,0,0,0.5), inset 0 0 20px rgba(255,100,0,0.2)",
                }}
              >
                TRY AGAIN
              </button>
            </div>
          </div>
        )}

        {gameState === "won" && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-green-500/30 via-cyan-500/30 to-pink-500/30 backdrop-blur-sm z-10">
            <div className="text-center">
              <p className="text-6xl font-bold mb-4 bg-gradient-to-r from-green-400 via-cyan-400 to-pink-400 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(0,255,255,0.9)] animate-pulse">
                🎉 YOU WON! 🎉
              </p>
              <p className="text-2xl mb-2 text-cyan-300 font-bold drop-shadow-[0_0_10px_rgba(0,255,255,0.7)]">
                You Won a Report for 0.001 USDC!
              </p>
              <p className="text-sm text-pink-300 mb-6 font-semibold drop-shadow-[0_0_6px_rgba(255,0,255,0.6)]">
                You can now get a report for only 0.001 USDC on your next analysis
              </p>
              <button
                onClick={resetGame}
                className="px-8 py-4 bg-gradient-to-r from-green-500 via-cyan-500 to-pink-500 text-white rounded-lg font-bold text-lg hover:shadow-[0_0_30px_rgba(0,255,255,0.8)] hover:scale-105 transition-all duration-300 border-2 border-cyan-300"
                style={{
                  textShadow: "0 0 10px rgba(255,255,255,0.8)",
                  boxShadow: "0 0 25px rgba(0,255,255,0.6), inset 0 0 25px rgba(255,0,255,0.3)",
                }}
              >
                PLAY AGAIN
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Game Info */}
      <div className="mt-6 pt-6 border-t-2 border-cyan-500/30">
        <p className="text-sm font-bold mb-3 text-cyan-300 drop-shadow-[0_0_6px_rgba(0,255,255,0.6)]">HOW TO PLAY:</p>
        <ul className="text-xs text-pink-300 space-y-2 font-semibold">
          <li className="flex items-center gap-2">
            <span className="text-cyan-400">▶</span>
            Click targets as they appear ({status.timePerTarget}s each)
          </li>
          <li className="flex items-center gap-2">
            <span className="text-cyan-400">▶</span>
            Targets get smaller each round
          </li>
          <li className="flex items-center gap-2">
            <span className="text-cyan-400">▶</span>
            Hit all {status.targetsToWin} targets to win a report for 0.001 USDC
          </li>
          <li className="flex items-center gap-2">
            <span className="text-cyan-400">▶</span>
            Entry cost: <span className="text-cyan-300 font-bold">{status.cost.toLocaleString()}</span> credits
          </li>
          <li className="flex items-center gap-2">
            <span className="text-cyan-400">▶</span>
            Entry reward: <span className="text-pink-300 font-bold">+{status.pointsReward}</span> points
          </li>
        </ul>
      </div>
    </div>
  );
}

