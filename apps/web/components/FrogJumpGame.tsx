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
  totalScore?: number;
}

type GameState = "idle" | "playing" | "gameOver";

export default function FrogJumpGame({ onFreeTicketWon }: FrogJumpGameProps) {
  const { address, isConnected } = useAccount();
  const [status, setStatus] = useState<GameStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [gameState, setGameState] = useState<GameState>("idle");
  const [score, setScore] = useState(0);
  const [gameSpeed, setGameSpeed] = useState(1.2); // Slower starting speed
  const [totalScore, setTotalScore] = useState(0);
  const [redeeming, setRedeeming] = useState(false);
  
  // Game canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const gameLoopRef = useRef<number | null>(null);
  
  // Game state
  const frogYRef = useRef(300); // Ground level
  const frogJumpingRef = useRef(false);
  const frogJumpVelocityRef = useRef(0);
  const canDoubleJumpRef = useRef(false); // Can double jump in air
  const obstaclesRef = useRef<Array<{ x: number; width: number; height: number }>>([]);
  const cloudsRef = useRef<Array<{ x: number; y: number; size: number }>>([]);
  const bonusPointsRef = useRef<Array<{ x: number; y: number; size: number }>>([]); // +2 bonus points in air
  const lastObstacleTimeRef = useRef(0);
  const gameStartTimeRef = useRef(0);
  const nextObstacleIntervalRef = useRef(2500); // Random interval
  const consecutiveObstaclesRef = useRef(0); // Track consecutive obstacles for bonus

  const GRAVITY = 0.7; // Slightly reduced gravity
  const JUMP_STRENGTH = -14; // Slightly reduced jump strength
  const DOUBLE_JUMP_STRENGTH = -7; // Half jump strength for double jump
  const GROUND_Y = 300;
  const FROG_SIZE = 20;
  const OBSTACLE_WIDTH = 30;
  const OBSTACLE_HEIGHT = 50;
  const MIN_OBSTACLE_INTERVAL = 2000; // ms - minimum time between obstacles
  const MAX_OBSTACLE_INTERVAL = 4000; // ms - maximum time between obstacles
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
        setTotalScore(data.totalScore || 0);
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

    // Clear canvas - Sky gradient
    const skyGradient = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    skyGradient.addColorStop(0, "#87CEEB"); // Sky blue
    skyGradient.addColorStop(1, "#E0F6FF"); // Light blue
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, GROUND_Y + FROG_SIZE);

    // Draw clouds
    ctx.fillStyle = "#FFFFFF";
    cloudsRef.current.forEach((cloud) => {
      ctx.beginPath();
      ctx.arc(cloud.x, cloud.y, cloud.size, 0, Math.PI * 2);
      ctx.arc(cloud.x + cloud.size * 0.6, cloud.y, cloud.size * 0.8, 0, Math.PI * 2);
      ctx.arc(cloud.x + cloud.size * 1.2, cloud.y, cloud.size * 0.7, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw bonus points (+2)
    bonusPointsRef.current.forEach((bonus) => {
      ctx.fillStyle = "#FFD700"; // Gold color
      ctx.beginPath();
      ctx.arc(bonus.x, bonus.y, bonus.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#FFA500";
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Draw +2 text
      ctx.fillStyle = "#000000";
      ctx.font = "bold 12px 'MS Sans Serif', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("+2", bonus.x, bonus.y);
    });

    // Draw ground with grass
    ctx.fillStyle = "#8B7355"; // Brown ground
    ctx.fillRect(0, GROUND_Y + FROG_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y - FROG_SIZE);
    
    // Draw grass line
    ctx.fillStyle = "#228B22"; // Forest green
    ctx.fillRect(0, GROUND_Y + FROG_SIZE - 2, CANVAS_WIDTH, 2);

    // Draw obstacles (cactus style)
    obstaclesRef.current.forEach((obstacle) => {
      const x = obstacle.x;
      const y = GROUND_Y + FROG_SIZE - obstacle.height;
      
      // Main body
      ctx.fillStyle = "#2D5016"; // Dark green
      ctx.fillRect(x + 10, y, 10, obstacle.height);
      
      // Left arm
      ctx.fillRect(x, y + obstacle.height * 0.3, 8, 8);
      
      // Right arm
      ctx.fillRect(x + 22, y + obstacle.height * 0.5, 8, 8);
      
      // Top
      ctx.fillRect(x + 8, y - 5, 14, 8);
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

    // Draw score and total score
    ctx.fillStyle = "#000000";
    ctx.font = "bold 16px 'MS Sans Serif', sans-serif";
    ctx.fillText(`Score: ${score}`, 10, 25);
    ctx.font = "14px 'MS Sans Serif', sans-serif";
    ctx.fillText(`Total: ${totalScore} / ${status?.scoreForTicket || 500}`, 10, 45);
    
    // Progress bar for total score
    if (status?.scoreForTicket) {
      const progress = Math.min(totalScore / status.scoreForTicket, 1);
      const barWidth = 200;
      const barHeight = 8;
      const barX = 10;
      const barY = 55;
      
      // Background
      ctx.fillStyle = "#CCCCCC";
      ctx.fillRect(barX, barY, barWidth, barHeight);
      
      // Progress
      ctx.fillStyle = progress >= 1 ? "#00AA00" : "#0066CC";
      ctx.fillRect(barX, barY, barWidth * progress, barHeight);
      
      // Border
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barWidth, barHeight);
    }
  }, [score, totalScore, status]);

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
        canDoubleJumpRef.current = false; // Reset double jump on ground
      }
    }

    // Update bonus points
    bonusPointsRef.current = bonusPointsRef.current.map((bonus) => ({
      ...bonus,
      x: bonus.x - (3 * gameSpeed), // Move left with obstacles
    })).filter((bonus) => {
      // Check collision with frog
      const frogX = 50;
      const frogY = frogYRef.current;
      const distance = Math.sqrt(
        Math.pow(bonus.x - (frogX + FROG_SIZE / 2), 2) + 
        Math.pow(bonus.y - (frogY + FROG_SIZE / 2), 2)
      );
      
      if (distance < bonus.size + FROG_SIZE / 2) {
        // Collected bonus point!
        setScore((prev) => prev + 2);
        return false;
      }
      
      return bonus.x + bonus.size > 0; // Keep if on screen
    });

    // Spawn obstacles with random intervals and bonus patterns
    if (now - lastObstacleTimeRef.current > nextObstacleIntervalRef.current / gameSpeed) {
      // Decide if we should spawn consecutive obstacles (bonus pattern)
      const shouldSpawnConsecutive = Math.random() < 0.15; // 15% chance
      const consecutiveCount = shouldSpawnConsecutive 
        ? (gameSpeed > 2 ? (Math.random() < 0.5 ? 2 : 3) : 2) // 2 or 3 obstacles based on speed
        : 1;
      
      const gapBetweenConsecutive = 80; // Small gap between consecutive obstacles
      
      for (let i = 0; i < consecutiveCount; i++) {
        obstaclesRef.current.push({
          x: CANVAS_WIDTH + (i * (OBSTACLE_WIDTH + gapBetweenConsecutive)),
          width: OBSTACLE_WIDTH,
          height: OBSTACLE_HEIGHT,
        });
      }
      
      lastObstacleTimeRef.current = now;
      
      // Random interval for next obstacle (longer if we just spawned consecutive)
      if (shouldSpawnConsecutive) {
        nextObstacleIntervalRef.current = MIN_OBSTACLE_INTERVAL + 
          Math.random() * (MAX_OBSTACLE_INTERVAL - MIN_OBSTACLE_INTERVAL);
      } else {
        nextObstacleIntervalRef.current = MIN_OBSTACLE_INTERVAL + 
          Math.random() * (MAX_OBSTACLE_INTERVAL - MIN_OBSTACLE_INTERVAL);
      }
      
      // Spawn bonus point (+2) occasionally (20% chance, in air)
      if (Math.random() < 0.2) {
        bonusPointsRef.current.push({
          x: CANVAS_WIDTH + 100,
          y: 150 + Math.random() * 100, // Random height in air
          size: 15,
        });
      }
    }

    // Spawn clouds
    if (Math.random() < 0.002) { // Low probability
      cloudsRef.current.push({
        x: CANVAS_WIDTH,
        y: 50 + Math.random() * 150,
        size: 20 + Math.random() * 30,
      });
    }

    // Update clouds
    cloudsRef.current = cloudsRef.current.map((cloud) => ({
      ...cloud,
      x: cloud.x - (1 * gameSpeed), // Slow cloud movement
    })).filter((cloud) => cloud.x + cloud.size * 2 > 0);

    // Update obstacles - slower movement
    obstaclesRef.current = obstaclesRef.current.map((obstacle) => ({
      ...obstacle,
      x: obstacle.x - (3 * gameSpeed), // Slower movement
    })).filter((obstacle) => {
      // Remove off-screen obstacles and increment score (1 point per obstacle)
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

    // Increase speed over time - slower progression
    const newSpeed = 1.2 + Math.floor(deltaTime / 20000) * 0.3; // Increase every 20 seconds by 0.3
    if (Math.abs(newSpeed - gameSpeed) > 0.1) {
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
    
    // Ground jump
    if (!frogJumpingRef.current || frogYRef.current >= GROUND_Y - 1) {
      frogJumpingRef.current = true;
      frogJumpVelocityRef.current = JUMP_STRENGTH;
      canDoubleJumpRef.current = true; // Enable double jump
    } 
    // Double jump (in air)
    else if (canDoubleJumpRef.current && frogJumpingRef.current) {
      frogJumpVelocityRef.current = DOUBLE_JUMP_STRENGTH; // Half jump strength
      canDoubleJumpRef.current = false; // Can only double jump once
    }
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
      setGameSpeed(1.2);
      frogYRef.current = GROUND_Y;
      frogJumpingRef.current = false;
      frogJumpVelocityRef.current = 0;
      canDoubleJumpRef.current = false;
      obstaclesRef.current = [];
      cloudsRef.current = [];
      bonusPointsRef.current = [];
      consecutiveObstaclesRef.current = 0;
      lastObstacleTimeRef.current = Date.now();
      gameStartTimeRef.current = Date.now();
      nextObstacleIntervalRef.current = MIN_OBSTACLE_INTERVAL + 
        Math.random() * (MAX_OBSTACLE_INTERVAL - MIN_OBSTACLE_INTERVAL);
      
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
        setTotalScore(data.totalScore || totalScore);
        // Refresh status to get updated totalScore
        fetchStatus();
      }
    } catch (error) {
      console.error("Error ending game:", error);
    }
  }, [address, score, onFreeTicketWon]);

  // Reset game
  const resetGame = () => {
    setGameState("idle");
    setScore(0);
    setGameSpeed(1.2);
    frogYRef.current = GROUND_Y;
    frogJumpingRef.current = false;
    frogJumpVelocityRef.current = 0;
    canDoubleJumpRef.current = false;
    obstaclesRef.current = [];
    cloudsRef.current = [];
    bonusPointsRef.current = [];
    consecutiveObstaclesRef.current = 0;
    lastObstacleTimeRef.current = 0;
    gameStartTimeRef.current = 0;
    nextObstacleIntervalRef.current = MIN_OBSTACLE_INTERVAL + 
      Math.random() * (MAX_OBSTACLE_INTERVAL - MIN_OBSTACLE_INTERVAL);
  };

  // Redeem ticket
  const redeemTicket = async () => {
    if (!address || totalScore < (status?.scoreForTicket || 500) || redeeming) return;

    setRedeeming(true);
    try {
      const response = await fetch("/api/deep-research/frog-jump/redeem-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.message || "Failed to redeem ticket");
        setRedeeming(false);
        return;
      }

      const data = await response.json();
      setTotalScore(data.totalScore || 0);
      alert(data.message || "Successfully redeemed ticket!");
      
      if (onFreeTicketWon) {
        onFreeTicketWon();
      }

      // Refresh status
      fetchStatus();
      setRedeeming(false);
    } catch (error: any) {
      console.error("Error redeeming ticket:", error);
      alert("Failed to redeem ticket. Please try again.");
      setRedeeming(false);
    }
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
    <div className="p-1 sm:p-2" style={{ fontFamily: 'MS Sans Serif, sans-serif' }}>
      {/* Windows XP Style Window */}
      <div className="border-2 border-t-gray-300 border-l-gray-300 border-r-gray-600 border-b-gray-600 shadow-lg w-full" style={{ background: '#c0c0c0' }}>
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
        <div className="p-2 sm:p-3" style={{ background: '#c0c0c0' }}>
          <div className="text-center mb-2 sm:mb-3">
            <p className="text-xs sm:text-sm mb-2 font-bold" style={{ color: '#000' }}>
              Jump over obstacles! Reach {status?.scoreForTicket || 1000} total score to redeem a report for 0.001 USDC!
            </p>
            {totalScore > 0 && (
              <div className="mb-2 space-y-2">
                <div className="p-2 border-2 border-t-gray-600 border-l-gray-600 border-r-gray-300 border-b-gray-300" style={{ background: '#fff', display: 'inline-block' }}>
                <p className="text-xs font-bold" style={{ color: '#000' }}>
                  Total Score: <span className="text-blue-600">{totalScore}</span> / {(status?.scoreForTicket || 1000)}
                </p>
                </div>
                {totalScore >= (status?.scoreForTicket || 500) && (
                  <button
                    onClick={redeemTicket}
                    disabled={redeeming}
                    className="px-4 py-2 text-xs font-bold transition-all"
                    style={{
                      fontFamily: 'MS Sans Serif, sans-serif',
                      background: redeeming ? '#808080' : '#c0c0c0',
                      color: redeeming ? '#808080' : '#000',
                      border: '2px solid',
                      borderTopColor: redeeming ? '#808080' : '#fff',
                      borderLeftColor: redeeming ? '#808080' : '#fff',
                      borderRightColor: redeeming ? '#606060' : '#808080',
                      borderBottomColor: redeeming ? '#606060' : '#808080',
                      cursor: redeeming ? 'not-allowed' : 'pointer',
                      boxShadow: redeeming ? 'none' : 'inset -1px -1px 0px #000, inset 1px 1px 0px #fff',
                    }}
                    onMouseDown={(e) => {
                      if (!redeeming) {
                        e.currentTarget.style.borderTopColor = '#808080';
                        e.currentTarget.style.borderLeftColor = '#808080';
                        e.currentTarget.style.borderRightColor = '#fff';
                        e.currentTarget.style.borderBottomColor = '#fff';
                        e.currentTarget.style.boxShadow = 'inset 1px 1px 0px #000, inset -1px -1px 0px #fff';
                      }
                    }}
                    onMouseUp={(e) => {
                      if (!redeeming) {
                        e.currentTarget.style.borderTopColor = '#fff';
                        e.currentTarget.style.borderLeftColor = '#fff';
                        e.currentTarget.style.borderRightColor = '#808080';
                        e.currentTarget.style.borderBottomColor = '#808080';
                        e.currentTarget.style.boxShadow = 'inset -1px -1px 0px #000, inset 1px 1px 0px #fff';
                      }
                    }}
                  >
                    {redeeming ? "Redeeming..." : `Redeem ${status?.scoreForTicket || 1000} Points for 0.001 USDC Ticket`}
                  </button>
                )}
              </div>
            )}
            
            {/* Balance */}
            <div className="mb-3 p-2 border-2 border-t-gray-600 border-l-gray-600 border-r-gray-300 border-b-gray-300" style={{ background: '#fff', display: 'inline-block' }}>
              <p className="text-xs font-bold" style={{ color: '#000' }}>
                Your Credits: <span className="text-blue-600">{status?.currentBalance.toLocaleString() || 0}</span>
              </p>
            </div>
          </div>

          {/* Game Canvas */}
          <div 
            className="relative mx-auto mb-2 sm:mb-3 overflow-hidden border-2 border-t-gray-600 border-l-gray-600 border-r-gray-300 border-b-gray-300 cursor-pointer"
            onClick={handleClick}
            onTouchStart={(e) => {
              e.preventDefault();
              handleClick();
            }}
            style={{ 
              width: "100%",
              maxWidth: `${CANVAS_WIDTH}px`,
              aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`,
              touchAction: "none",
            }}
          >
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              style={{ 
                display: 'block',
                width: '100%',
                height: '100%',
              }}
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
                  <p className="text-xs mb-2 font-bold" style={{ color: '#000' }}>
                    Total Score: {totalScore} / {(status?.scoreForTicket || 1000)}
                  </p>
                  {totalScore >= (status?.scoreForTicket || 1000) ? (
                    <p className="text-xs mb-2" style={{ color: '#008000' }}>
                      🎉 You can redeem a report for 0.001 USDC!
                    </p>
                  ) : (
                    <p className="text-xs mb-4" style={{ color: '#000' }}>
                      Reach {(status?.scoreForTicket || 1000)} total score to redeem a report for 0.001 USDC!
                    </p>
                  )}
                  {totalScore >= (status?.scoreForTicket || 1000) && (
                    <button
                      onClick={redeemTicket}
                      disabled={redeeming}
                      className="px-4 py-2 text-xs font-bold transition-all mb-4"
                      style={{
                        fontFamily: 'MS Sans Serif, sans-serif',
                        background: redeeming ? '#808080' : '#c0c0c0',
                        color: redeeming ? '#808080' : '#000',
                        border: '2px solid',
                        borderTopColor: redeeming ? '#808080' : '#fff',
                        borderLeftColor: redeeming ? '#808080' : '#fff',
                        borderRightColor: redeeming ? '#606060' : '#808080',
                        borderBottomColor: redeeming ? '#606060' : '#808080',
                        cursor: redeeming ? 'not-allowed' : 'pointer',
                        boxShadow: redeeming ? 'none' : 'inset -1px -1px 0px #000, inset 1px 1px 0px #fff',
                      }}
                      onMouseDown={(e) => {
                        if (!redeeming) {
                          e.currentTarget.style.borderTopColor = '#808080';
                          e.currentTarget.style.borderLeftColor = '#808080';
                          e.currentTarget.style.borderRightColor = '#fff';
                          e.currentTarget.style.borderBottomColor = '#fff';
                          e.currentTarget.style.boxShadow = 'inset 1px 1px 0px #000, inset -1px -1px 0px #fff';
                        }
                      }}
                      onMouseUp={(e) => {
                        if (!redeeming) {
                          e.currentTarget.style.borderTopColor = '#fff';
                          e.currentTarget.style.borderLeftColor = '#fff';
                          e.currentTarget.style.borderRightColor = '#808080';
                          e.currentTarget.style.borderBottomColor = '#808080';
                          e.currentTarget.style.boxShadow = 'inset -1px -1px 0px #000, inset 1px 1px 0px #fff';
                        }
                      }}
                    >
                      {redeeming ? "Redeeming..." : `Redeem ${status?.scoreForTicket || 1000} Points for Ticket`}
                    </button>
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
              <li>• Click or tap to jump - double tap in air for double jump!</li>
              <li>• Collect +2 bonus points in the air for extra score</li>
              <li>• Sometimes 2-3 obstacles come together (bonus pattern)</li>
              <li>• Avoid obstacles - game gets faster over time</li>
              <li>• Reach {(status?.scoreForTicket || 1000)} total score to redeem a report for 0.001 USDC</li>
              <li>• Entry cost: <span className="font-bold">{status?.cost.toLocaleString() || 0}</span> credits</li>
              <li>• Entry reward: <span className="font-bold">+{status?.pointsReward || 10}</span> points</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

