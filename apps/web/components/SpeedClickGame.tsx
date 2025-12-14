"use client";

import { useState, useEffect, useRef } from "react";
import { useAccount } from "wagmi";

interface SpeedClickGameProps {
  onFreeTicketWon?: () => void;
  onGameStateChange?: (isPlaying: boolean) => void;
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

export default function SpeedClickGame({ onFreeTicketWon, onGameStateChange }: SpeedClickGameProps) {
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
    
    // Notify parent that game is playing
    if (onGameStateChange) {
      onGameStateChange(true);
    }

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
        
        // Notify parent that game is not playing
        if (onGameStateChange) {
          onGameStateChange(false);
        }
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
        
        // Notify parent that game is not playing
        if (onGameStateChange) {
          onGameStateChange(false);
        }
        
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
    
    // Notify parent that game is not playing
    if (onGameStateChange) {
      onGameStateChange(false);
    }
    
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
    <div className="p-2" style={{ fontFamily: 'MS Sans Serif, sans-serif' }}>
      {/* Windows XP Style Window */}
      <div className="border-2 border-t-gray-300 border-l-gray-300 border-r-gray-600 border-b-gray-600 shadow-lg" style={{ background: '#c0c0c0' }}>
        {/* Window Title Bar */}
        <div className="flex items-center justify-between px-1 py-0.5" style={{ 
          background: 'linear-gradient(to bottom, #0054e3 0%, #0066ff 50%, #0054e3 100%)',
          borderBottom: '1px solid #000'
        }}>
          <div className="flex items-center gap-1">
            <span className="text-white text-xs font-bold">🎯</span>
            <span className="text-white text-xs font-bold">SPEED CLICK CHALLENGE</span>
          </div>
          <div className="flex gap-0.5">
            <button className="w-4 h-4 border border-t-gray-300 border-l-gray-300 border-r-gray-600 border-b-gray-600 bg-gray-300 text-xs font-bold hover:bg-gray-400" style={{ fontSize: '10px' }}>_</button>
            <button className="w-4 h-4 border border-t-gray-300 border-l-gray-300 border-r-gray-600 border-b-gray-600 bg-gray-300 text-xs font-bold hover:bg-gray-400" style={{ fontSize: '10px' }}>□</button>
            <button className="w-4 h-4 border border-t-gray-300 border-l-gray-300 border-r-gray-600 border-b-gray-600 bg-gray-300 text-xs font-bold hover:bg-gray-400" style={{ fontSize: '10px' }}>×</button>
          </div>
        </div>

        {/* Window Content */}
        <div className="p-3" style={{ background: '#c0c0c0' }}>
          <div className="text-center mb-4">
            <p className="text-sm mb-2 font-bold" style={{ color: '#000' }}>
              Hit {status.targetsToWin} targets in {status.timePerTarget}s each!
            </p>
            
            {/* Balance */}
            <div className="mb-3 p-2 border-2 border-t-gray-600 border-l-gray-600 border-r-gray-300 border-b-gray-300" style={{ background: '#fff', display: 'inline-block' }}>
              <p className="text-xs font-bold" style={{ color: '#000' }}>
                Your Credits: <span className="text-blue-600">{status.currentBalance.toLocaleString()}</span>
              </p>
            </div>
          </div>

          {/* Game Container */}
          <div 
            ref={containerRef}
            className="relative mx-auto mb-4 overflow-hidden border-2 border-t-gray-600 border-l-gray-600 border-r-gray-300 border-b-gray-300"
            style={{ 
              width: "100%", 
              height: "400px",
              minHeight: "400px",
              touchAction: "none",
              background: "#008080", // Classic Windows teal background
              position: "relative",
            }}
          >
          {gameState === "idle" && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-center p-4 border-2 border-t-gray-300 border-l-gray-300 border-r-gray-600 border-b-gray-600" style={{ background: '#c0c0c0' }}>
                <p className="text-lg font-bold mb-3" style={{ color: '#000' }}>
                  Ready to play?
                </p>
                <p className="text-xs mb-4" style={{ color: '#000' }}>
                  Hit {status.targetsToWin} targets in {status.timePerTarget}s each
                  <br />
                  Targets get smaller each round!
                </p>
                <button
                  onClick={startGame}
                  disabled={!status.canPlay || loading}
                  className="px-6 py-2 text-xs font-bold transition-all"
                  style={{
                    fontFamily: 'MS Sans Serif, sans-serif',
                    background: status.canPlay && !loading ? '#c0c0c0' : '#808080',
                    color: status.canPlay && !loading ? '#000' : '#808080',
                    border: '2px solid',
                    borderTopColor: status.canPlay && !loading ? '#fff' : '#808080',
                    borderLeftColor: status.canPlay && !loading ? '#fff' : '#808080',
                    borderRightColor: status.canPlay && !loading ? '#808080' : '#606060',
                    borderBottomColor: status.canPlay && !loading ? '#808080' : '#606060',
                    cursor: status.canPlay && !loading ? 'pointer' : 'not-allowed',
                    boxShadow: status.canPlay && !loading ? 'inset -1px -1px 0px #000, inset 1px 1px 0px #fff' : 'none',
                  }}
                  onMouseDown={(e) => {
                    if (status.canPlay && !loading) {
                      e.currentTarget.style.borderTopColor = '#808080';
                      e.currentTarget.style.borderLeftColor = '#808080';
                      e.currentTarget.style.borderRightColor = '#fff';
                      e.currentTarget.style.borderBottomColor = '#fff';
                      e.currentTarget.style.boxShadow = 'inset 1px 1px 0px #000, inset -1px -1px 0px #fff';
                    }
                  }}
                  onMouseUp={(e) => {
                    if (status.canPlay && !loading) {
                      e.currentTarget.style.borderTopColor = '#fff';
                      e.currentTarget.style.borderLeftColor = '#fff';
                      e.currentTarget.style.borderRightColor = '#808080';
                      e.currentTarget.style.borderBottomColor = '#808080';
                      e.currentTarget.style.boxShadow = 'inset -1px -1px 0px #000, inset 1px 1px 0px #fff';
                    }
                  }}
                >
                  {loading ? "Starting..." : `Start Game (${status.cost.toLocaleString()} credits)`}
                </button>
                {!status.canPlay && (
                  <p className="text-xs mt-3 font-bold" style={{ color: '#c00' }}>
                    Insufficient credits. You need {status.cost.toLocaleString()} credits.
                  </p>
                )}
              </div>
            </div>
          )}

          {gameState === "waiting" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-10">
              <div className="text-center p-4 border-2 border-t-gray-300 border-l-gray-300 border-r-gray-600 border-b-gray-600" style={{ background: '#c0c0c0' }}>
                <p className="text-2xl font-bold mb-3" style={{ color: '#000' }}>
                  Get Ready!
                </p>
                <p className="text-lg font-bold" style={{ color: '#000' }}>
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
                className="absolute cursor-pointer transition-all duration-100 active:scale-95 z-10"
                style={{
                  left: `${targetPosition.x - targetSize / 2}px`,
                  top: `${targetPosition.y - targetSize / 2}px`,
                  width: `${targetSize}px`,
                  height: `${targetSize}px`,
                  borderRadius: "50%",
                  background: "#ff0000",
                  border: "3px solid #000",
                  boxShadow: "inset -2px -2px 0px #800000, inset 2px 2px 0px #ff8080",
                }}
              >
                <div 
                  className="absolute inset-0 flex items-center justify-center font-bold text-white"
                  style={{
                    fontSize: `${Math.max(12, targetSize / 8)}px`,
                    fontFamily: 'MS Sans Serif, sans-serif',
                    textShadow: "1px 1px 2px #000",
                    fontWeight: "bold",
                  }}
                >
                  CLICK
                </div>
              </div>

              {/* Timer */}
              <div 
                className="absolute top-2 left-2 px-2 py-1 border-2 border-t-gray-300 border-l-gray-300 border-r-gray-600 border-b-gray-600 z-10"
                style={{
                  background: '#c0c0c0',
                  fontFamily: 'MS Sans Serif, sans-serif',
                }}
              >
                <p className="text-xs font-bold" style={{ color: '#000' }}>
                  Time: {(timeLeft).toFixed(2)}s
                </p>
              </div>

              {/* Progress */}
              <div 
                className="absolute top-2 right-2 px-2 py-1 border-2 border-t-gray-300 border-l-gray-300 border-r-gray-600 border-b-gray-600 z-10"
                style={{
                  background: '#c0c0c0',
                  fontFamily: 'MS Sans Serif, sans-serif',
                }}
              >
                <p className="text-xs font-bold" style={{ color: '#000' }}>
                  {hits} / {status.targetsToWin}
                </p>
              </div>
            </>
          )}

          {gameState === "targetHit" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-10">
              <div className="text-center p-4 border-2 border-t-gray-300 border-l-gray-300 border-r-gray-600 border-b-gray-600" style={{ background: '#c0c0c0' }}>
                <p className="text-3xl font-bold mb-3" style={{ color: '#008000' }}>
                  ✓ Hit!
                </p>
                <p className="text-sm mb-4 font-bold" style={{ color: '#000' }}>
                  {hits} / {status.targetsToWin} targets hit
                </p>
                {hits < status.targetsToWin && (
                  <button
                    onClick={continueToNextTarget}
                    className="px-4 py-2 text-xs font-bold transition-all"
                    style={{
                      fontFamily: 'MS Sans Serif, sans-serif',
                      background: '#c0c0c0',
                      color: '#000',
                      border: '2px solid',
                      borderTopColor: '#fff',
                      borderLeftColor: '#fff',
                      borderRightColor: '#808080',
                      borderBottomColor: '#808080',
                      cursor: 'pointer',
                      boxShadow: 'inset -1px -1px 0px #000, inset 1px 1px 0px #fff',
                    }}
                    onMouseDown={(e) => {
                      e.currentTarget.style.borderTopColor = '#808080';
                      e.currentTarget.style.borderLeftColor = '#808080';
                      e.currentTarget.style.borderRightColor = '#fff';
                      e.currentTarget.style.borderBottomColor = '#fff';
                      e.currentTarget.style.boxShadow = 'inset 1px 1px 0px #000, inset -1px -1px 0px #fff';
                    }}
                    onMouseUp={(e) => {
                      e.currentTarget.style.borderTopColor = '#fff';
                      e.currentTarget.style.borderLeftColor = '#fff';
                      e.currentTarget.style.borderRightColor = '#808080';
                      e.currentTarget.style.borderBottomColor = '#808080';
                      e.currentTarget.style.boxShadow = 'inset -1px -1px 0px #000, inset 1px 1px 0px #fff';
                    }}
                  >
                    Continue to Next Target
                  </button>
                )}
              </div>
            </div>
          )}

          {gameState === "targetMissed" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-10">
              <div className="text-center p-4 border-2 border-t-gray-300 border-l-gray-300 border-r-gray-600 border-b-gray-600" style={{ background: '#c0c0c0' }}>
                <p className="text-3xl font-bold mb-3" style={{ color: '#c00' }}>
                  ✗ Time's Up!
                </p>
                <p className="text-sm mb-4 font-bold" style={{ color: '#000' }}>
                  You hit {hits} / {status.targetsToWin} targets
                </p>
                <button
                  onClick={resetGame}
                  className="px-4 py-2 text-xs font-bold transition-all"
                  style={{
                    fontFamily: 'MS Sans Serif, sans-serif',
                    background: '#c0c0c0',
                    color: '#000',
                    border: '2px solid',
                    borderTopColor: '#fff',
                    borderLeftColor: '#fff',
                    borderRightColor: '#808080',
                    borderBottomColor: '#808080',
                    cursor: 'pointer',
                    boxShadow: 'inset -1px -1px 0px #000, inset 1px 1px 0px #fff',
                  }}
                  onMouseDown={(e) => {
                    e.currentTarget.style.borderTopColor = '#808080';
                    e.currentTarget.style.borderLeftColor = '#808080';
                    e.currentTarget.style.borderRightColor = '#fff';
                    e.currentTarget.style.borderBottomColor = '#fff';
                    e.currentTarget.style.boxShadow = 'inset 1px 1px 0px #000, inset -1px -1px 0px #fff';
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.borderTopColor = '#fff';
                    e.currentTarget.style.borderLeftColor = '#fff';
                    e.currentTarget.style.borderRightColor = '#808080';
                    e.currentTarget.style.borderBottomColor = '#808080';
                    e.currentTarget.style.boxShadow = 'inset -1px -1px 0px #000, inset 1px 1px 0px #fff';
                  }}
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

          {gameState === "won" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-10">
              <div className="text-center p-4 border-2 border-t-gray-300 border-l-gray-300 border-r-gray-600 border-b-gray-600" style={{ background: '#c0c0c0' }}>
                <p className="text-4xl font-bold mb-3" style={{ color: '#008000' }}>
                  🎉 You Won! 🎉
                </p>
                <p className="text-sm mb-2 font-bold" style={{ color: '#000' }}>
                  You Won a Report for 0.001 USDC!
                </p>
                <p className="text-xs mb-4" style={{ color: '#000' }}>
                  You can now get a report for only 0.001 USDC on your next analysis
                </p>
                <button
                  onClick={resetGame}
                  className="px-4 py-2 text-xs font-bold transition-all"
                  style={{
                    fontFamily: 'MS Sans Serif, sans-serif',
                    background: '#c0c0c0',
                    color: '#000',
                    border: '2px solid',
                    borderTopColor: '#fff',
                    borderLeftColor: '#fff',
                    borderRightColor: '#808080',
                    borderBottomColor: '#808080',
                    cursor: 'pointer',
                    boxShadow: 'inset -1px -1px 0px #000, inset 1px 1px 0px #fff',
                  }}
                  onMouseDown={(e) => {
                    e.currentTarget.style.borderTopColor = '#808080';
                    e.currentTarget.style.borderLeftColor = '#808080';
                    e.currentTarget.style.borderRightColor = '#fff';
                    e.currentTarget.style.borderBottomColor = '#fff';
                    e.currentTarget.style.boxShadow = 'inset 1px 1px 0px #000, inset -1px -1px 0px #fff';
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.borderTopColor = '#fff';
                    e.currentTarget.style.borderLeftColor = '#fff';
                    e.currentTarget.style.borderRightColor = '#808080';
                    e.currentTarget.style.borderBottomColor = '#808080';
                    e.currentTarget.style.boxShadow = 'inset -1px -1px 0px #000, inset 1px 1px 0px #fff';
                  }}
                >
                  Play Again
                </button>
              </div>
            </div>
          )}
        </div>

          {/* Game Info */}
          <div className="mt-3 p-2 border-2 border-t-gray-300 border-l-gray-300 border-r-gray-600 border-b-gray-600" style={{ background: '#fff' }}>
            <p className="text-xs font-bold mb-2" style={{ color: '#000' }}>How to Play:</p>
            <ul className="text-xs space-y-1" style={{ color: '#000', fontFamily: 'MS Sans Serif, sans-serif' }}>
              <li>• Click targets as they appear ({status.timePerTarget}s each)</li>
              <li>• Targets get smaller each round</li>
              <li>• Hit all {status.targetsToWin} targets to win a report for 0.001 USDC</li>
              <li>• Entry cost: <span className="font-bold">{status.cost.toLocaleString()}</span> credits</li>
              <li>• Entry reward: <span className="font-bold">+{status.pointsReward}</span> points</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

