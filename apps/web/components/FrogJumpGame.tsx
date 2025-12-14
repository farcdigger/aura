"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAccount } from "wagmi";

interface FrogJumpGameProps {
  onFreeTicketWon?: () => void;
}

interface GameStatus {
  canPlay: boolean;
  hasNFT: boolean;
  cost: number;
  currentBalance: number;
  pointsReward: number;
  scoreForTicket: number;
}

type GameState = "idle" | "playing" | "gameOver";

export default function FrogJumpGame({ onFreeTicketWon }: FrogJumpGameProps) {
  const { address, isConnected } = useAccount();
  const [status, setStatus] = useState<GameStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [gameState, setGameState] = useState<GameState>("idle");
  const [score, setScore] = useState(0);
  const [gameSpeed, setGameSpeed] = useState(2);
  
  // Game canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const gameLoopRef = useRef<number | null>(null);
  
  // Game state
  const frogYRef = useRef(300); // Ground level
  const frogJumpingRef = useRef(false);
  const frogJumpVelocityRef = useRef(0);
  const obstaclesRef = useRef<Array<{ x: number; width: number; height: number }>>([]);
  const lastObstacleTimeRef = useRef(0);
  const gameStartTimeRef = useRef(0);

  const GRAVITY = 0.8;
  const JUMP_STRENGTH = -15;
  const GROUND_Y = 300;
  const FROG_SIZE = 20;
  const OBSTACLE_WIDTH = 30;
  const OBSTACLE_HEIGHT = 50;
  const OBSTACLE_SPAWN_INTERVAL = 2000; // ms
  const CANVAS_WIDTH = 600;
  const CANVAS_HEIGHT = 400;

  // Fetch game status
  const fetchStatus = async () => {
    if (!address) return;

    try {
      const response = await fetch(
        `/api/deep-research/frog-jump?walletAddress=${address}`
      );
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      console.error("Error fetching game status:", error);
    }
  };

  useEffect(() => {
    if (isConnected && address) {
      fetchStatus();
    }
  }, [isConnected, address]);

  // Draw game
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = "#008080"; // Windows teal
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw ground
    ctx.fillStyle = "#654321"; // Brown
    ctx.fillRect(0, GROUND_Y + FROG_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y - FROG_SIZE);

    // Draw obstacles
    ctx.fillStyle = "#000000"; // Black
    obstaclesRef.current.forEach((obstacle) => {
      ctx.fillRect(obstacle.x, GROUND_Y + FROG_SIZE - obstacle.height, obstacle.width, obstacle.height);
    });

    // Draw frog (black pixel art)
    ctx.fillStyle = "#000000";
    const frogX = 50;
    const frogY = frogYRef.current;
    
    // Simple pixel frog (5x5 grid)
    const pixelSize = 4;
    const frogPixels = [
      [0, 1, 1, 1, 0],
      [1, 1, 1, 1, 1],
      [1, 0, 1, 0, 1],
      [1, 1, 1, 1, 1],
      [0, 1, 0, 1, 0],
    ];
    
    for (let row = 0; row < frogPixels.length; row++) {
      for (let col = 0; col < frogPixels[row].length; col++) {
        if (frogPixels[row][col]) {
          ctx.fillRect(
            frogX + col * pixelSize,
            frogY + row * pixelSize,
            pixelSize,
            pixelSize
          );
        }
      }
    }

    // Draw score
    ctx.fillStyle = "#000000";
    ctx.font = "16px 'MS Sans Serif', sans-serif";
    ctx.fillText(`Score: ${score}`, 10, 30);
  }, [score]);

  // Game loop
  const gameLoop = useCallback(() => {
    if (gameState !== "playing") return;

    const now = Date.now();
    const deltaTime = now - gameStartTimeRef.current;

    // Update frog physics
    if (frogJumpingRef.current) {
      frogYRef.current += frogJumpVelocityRef.current;
      frogJumpVelocityRef.current += GRAVITY;

      // Ground collision
      if (frogYRef.current >= GROUND_Y) {
        frogYRef.current = GROUND_Y;
        frogJumpingRef.current = false;
        frogJumpVelocityRef.current = 0;
      }
    }

    // Spawn obstacles
    if (now - lastObstacleTimeRef.current > OBSTACLE_SPAWN_INTERVAL / gameSpeed) {
      obstaclesRef.current.push({
        x: CANVAS_WIDTH,
        width: OBSTACLE_WIDTH,
        height: OBSTACLE_HEIGHT,
      });
      lastObstacleTimeRef.current = now;
    }

    // Update obstacles
    obstaclesRef.current = obstaclesRef.current.map((obstacle) => ({
      ...obstacle,
      x: obstacle.x - (5 * gameSpeed), // Move left
    })).filter((obstacle) => {
      // Remove off-screen obstacles and increment score
      if (obstacle.x + obstacle.width < 0) {
        setScore((prev) => prev + 1);
        return false;
      }
      return true;
    });

    // Collision detection
    const frogX = 50;
    const frogRight = frogX + FROG_SIZE;
    const frogTop = frogYRef.current;
    const frogBottom = frogYRef.current + FROG_SIZE;

    for (const obstacle of obstaclesRef.current) {
      const obstacleLeft = obstacle.x;
      const obstacleRight = obstacle.x + obstacle.width;
      const obstacleTop = GROUND_Y + FROG_SIZE - obstacle.height;
      const obstacleBottom = GROUND_Y + FROG_SIZE;

      if (
        frogRight > obstacleLeft &&
        frogX < obstacleRight &&
        frogBottom > obstacleTop &&
        frogTop < obstacleBottom
      ) {
        // Collision! Game over
        endGame();
        return;
      }
    }

    // Increase speed over time
    const newSpeed = 2 + Math.floor(deltaTime / 10000); // Increase every 10 seconds
    if (newSpeed !== gameSpeed) {
      setGameSpeed(newSpeed);
    }

    // Draw
    draw();

    // Continue loop
    if (gameState === "playing") {
      gameLoopRef.current = requestAnimationFrame(gameLoop);
    }
  }, [gameState, gameSpeed, draw]);

  // Start game loop when playing
  useEffect(() => {
    if (gameState === "playing") {
      gameLoopRef.current = requestAnimationFrame(gameLoop);
    } else {
      if (gameLoopRef.current !== null) {
        cancelAnimationFrame(gameLoopRef.current);
        gameLoopRef.current = null;
      }
    }

    return () => {
      if (gameLoopRef.current !== null) {
        cancelAnimationFrame(gameLoopRef.current);
        gameLoopRef.current = null;
      }
    };
  }, [gameState, gameLoop]);

  // Jump handler
  const jump = useCallback(() => {
    if (gameState !== "playing") return;
    if (frogJumpingRef.current) return; // Can't jump while already jumping

    frogJumpingRef.current = true;
    frogJumpVelocityRef.current = JUMP_STRENGTH;
  }, [gameState]);

  // Handle click/touch
  const handleClick = useCallback(() => {
    if (gameState === "playing") {
      jump();
    }
  }, [gameState, jump]);

  // Start game
  const startGame = async () => {
    if (!address || !status?.canPlay) return;

    setLoading(true);
    try {
      const response = await fetch("/api/deep-research/frog-jump", {
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

      // Reset game state
      setScore(0);
      setGameSpeed(2);
      frogYRef.current = GROUND_Y;
      frogJumpingRef.current = false;
      frogJumpVelocityRef.current = 0;
      obstaclesRef.current = [];
      lastObstacleTimeRef.current = Date.now();
      gameStartTimeRef.current = Date.now();
      
      setGameState("playing");
      setLoading(false);
      
    } catch (error: any) {
      console.error("Error starting game:", error);
      alert("Failed to start game. Please try again.");
      setLoading(false);
    }
  };

  // End game
  const endGame = useCallback(async () => {
    // Stop game loop
    if (gameLoopRef.current !== null) {
      cancelAnimationFrame(gameLoopRef.current);
      gameLoopRef.current = null;
    }

    setGameState("gameOver");

    if (!address) return;

    try {
      const response = await fetch("/api/deep-research/frog-jump", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          walletAddress: address, 
          action: "end",
          score 
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.wonTicket && onFreeTicketWon) {
          onFreeTicketWon();
        }
      }
    } catch (error) {
      console.error("Error ending game:", error);
    }
  }, [address, score, onFreeTicketWon]);

  // Reset game
  const resetGame = () => {
    setGameState("idle");
    setScore(0);
    setGameSpeed(2);
    frogYRef.current = GROUND_Y;
    frogJumpingRef.current = false;
    frogJumpVelocityRef.current = 0;
    obstaclesRef.current = [];
    lastObstacleTimeRef.current = 0;
    gameStartTimeRef.current = 0;
  };

  // Draw on mount and when score changes
  useEffect(() => {
    if (canvasRef.current) {
      draw();
    }
  }, [draw]);

  if (!isConnected || !address) {
    return (
      <div className="p-2" style={{ fontFamily: 'MS Sans Serif, sans-serif' }}>
        <div className="border-2 border-t-gray-300 border-l-gray-300 border-r-gray-600 border-b-gray-600 shadow-lg" style={{ background: '#c0c0c0' }}>
          <div className="flex items-center justify-between px-1 py-0.5" style={{ 
            background: 'linear-gradient(to bottom, #0054e3 0%, #0066ff 50%, #0054e3 100%)',
            borderBottom: '1px solid #000'
          }}>
            <div className="flex items-center gap-1">
              <span className="text-white text-xs font-bold">🐸</span>
              <span className="text-white text-xs font-bold">FROG JUMP</span>
            </div>
          </div>
          <div className="p-3" style={{ background: '#c0c0c0' }}>
            <p className="text-xs" style={{ color: '#000' }}>Please connect your wallet to play</p>
          </div>
        </div>
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
            <span className="text-white text-xs font-bold">🐸</span>
            <span className="text-white text-xs font-bold">FROG JUMP</span>
          </div>
          <div className="flex gap-0.5">
            <button className="w-4 h-4 border border-t-gray-300 border-l-gray-300 border-r-gray-600 border-b-gray-600 bg-gray-300 text-xs font-bold hover:bg-gray-400" style={{ fontSize: '10px' }}>_</button>
            <button className="w-4 h-4 border border-t-gray-300 border-l-gray-300 border-r-gray-600 border-b-gray-600 bg-gray-300 text-xs font-bold hover:bg-gray-400" style={{ fontSize: '10px' }}>□</button>
            <button className="w-4 h-4 border border-t-gray-300 border-l-gray-300 border-r-gray-600 border-b-gray-600 bg-gray-300 text-xs font-bold hover:bg-gray-400" style={{ fontSize: '10px' }}>×</button>
          </div>
        </div>

        {/* Window Content */}
        <div className="p-3" style={{ background: '#c0c0c0' }}>
          <div className="text-center mb-3">
            <p className="text-sm mb-2 font-bold" style={{ color: '#000' }}>
              Jump over obstacles! Score {status?.scoreForTicket || 500}+ to win a report for 0.001 USDC!
            </p>
            
            {/* Balance */}
            <div className="mb-3 p-2 border-2 border-t-gray-600 border-l-gray-600 border-r-gray-300 border-b-gray-300" style={{ background: '#fff', display: 'inline-block' }}>
              <p className="text-xs font-bold" style={{ color: '#000' }}>
                Your Credits: <span className="text-blue-600">{status?.currentBalance.toLocaleString() || 0}</span>
              </p>
            </div>
          </div>

          {/* Game Canvas */}
          <div 
            className="relative mx-auto mb-3 overflow-hidden border-2 border-t-gray-600 border-l-gray-600 border-r-gray-300 border-b-gray-300 cursor-pointer"
            onClick={handleClick}
            onTouchStart={(e) => {
              e.preventDefault();
              handleClick();
            }}
            style={{ 
              width: `${CANVAS_WIDTH}px`,
              height: `${CANVAS_HEIGHT}px`,
              touchAction: "none",
            }}
          >
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              style={{ display: 'block' }}
            />
            
            {/* Game Over Overlay */}
            {gameState === "gameOver" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-10">
                <div className="text-center p-4 border-2 border-t-gray-300 border-l-gray-300 border-r-gray-600 border-b-gray-600" style={{ background: '#c0c0c0' }}>
                  <p className="text-2xl font-bold mb-3" style={{ color: '#c00' }}>
                    Game Over!
                  </p>
                  <p className="text-sm mb-2 font-bold" style={{ color: '#000' }}>
                    Final Score: {score}
                  </p>
                  {score >= (status?.scoreForTicket || 500) ? (
                    <p className="text-xs mb-4" style={{ color: '#008000' }}>
                      🎉 You won a report for 0.001 USDC!
                    </p>
                  ) : (
                    <p className="text-xs mb-4" style={{ color: '#000' }}>
                      Score {(status?.scoreForTicket || 500)}+ to win a report for 0.001 USDC!
                    </p>
                  )}
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

            {/* Idle State */}
            {gameState === "idle" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-10">
                <div className="text-center p-4 border-2 border-t-gray-300 border-l-gray-300 border-r-gray-600 border-b-gray-600" style={{ background: '#c0c0c0' }}>
                  <p className="text-lg font-bold mb-3" style={{ color: '#000' }}>
                    Ready to play?
                  </p>
                  <p className="text-xs mb-4" style={{ color: '#000' }}>
                    Click or tap to jump over obstacles!
                  </p>
                  <button
                    onClick={startGame}
                    disabled={!status?.canPlay || loading}
                    className="px-6 py-2 text-xs font-bold transition-all"
                    style={{
                      fontFamily: 'MS Sans Serif, sans-serif',
                      background: status?.canPlay && !loading ? '#c0c0c0' : '#808080',
                      color: status?.canPlay && !loading ? '#000' : '#808080',
                      border: '2px solid',
                      borderTopColor: status?.canPlay && !loading ? '#fff' : '#808080',
                      borderLeftColor: status?.canPlay && !loading ? '#fff' : '#808080',
                      borderRightColor: status?.canPlay && !loading ? '#808080' : '#606060',
                      borderBottomColor: status?.canPlay && !loading ? '#808080' : '#606060',
                      cursor: status?.canPlay && !loading ? 'pointer' : 'not-allowed',
                      boxShadow: status?.canPlay && !loading ? 'inset -1px -1px 0px #000, inset 1px 1px 0px #fff' : 'none',
                    }}
                    onMouseDown={(e) => {
                      if (status?.canPlay && !loading) {
                        e.currentTarget.style.borderTopColor = '#808080';
                        e.currentTarget.style.borderLeftColor = '#808080';
                        e.currentTarget.style.borderRightColor = '#fff';
                        e.currentTarget.style.borderBottomColor = '#fff';
                        e.currentTarget.style.boxShadow = 'inset 1px 1px 0px #000, inset -1px -1px 0px #fff';
                      }
                    }}
                    onMouseUp={(e) => {
                      if (status?.canPlay && !loading) {
                        e.currentTarget.style.borderTopColor = '#fff';
                        e.currentTarget.style.borderLeftColor = '#fff';
                        e.currentTarget.style.borderRightColor = '#808080';
                        e.currentTarget.style.borderBottomColor = '#808080';
                        e.currentTarget.style.boxShadow = 'inset -1px -1px 0px #000, inset 1px 1px 0px #fff';
                      }
                    }}
                  >
                    {loading ? "Starting..." : `Start Game (${status?.cost.toLocaleString() || 0} credits)`}
                  </button>
                  {!status?.canPlay && (
                    <p className="text-xs mt-3 font-bold" style={{ color: '#c00' }}>
                      Insufficient credits. You need {status?.cost.toLocaleString() || 0} credits.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Game Info */}
          <div className="p-2 border-2 border-t-gray-300 border-l-gray-300 border-r-gray-600 border-b-gray-600" style={{ background: '#fff' }}>
            <p className="text-xs font-bold mb-2" style={{ color: '#000' }}>How to Play:</p>
            <ul className="text-xs space-y-1" style={{ color: '#000', fontFamily: 'MS Sans Serif, sans-serif' }}>
              <li>• Click or tap to make the frog jump</li>
              <li>• Avoid obstacles - game gets faster over time</li>
              <li>• Score {(status?.scoreForTicket || 500)}+ to win a report for 0.001 USDC</li>
              <li>• Entry cost: <span className="font-bold">{status?.cost.toLocaleString() || 0}</span> credits</li>
              <li>• Entry reward: <span className="font-bold">+{status?.pointsReward || 10}</span> points</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

