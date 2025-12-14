"use client";

import { useState } from "react";
import SpeedClickGame from "./SpeedClickGame";
import FrogJumpGame from "./FrogJumpGame";
import FrogJumpLeaderboard from "./FrogJumpLeaderboard";

type GameSelection = "menu" | "speed-click" | "frog-jump" | "leaderboard";

interface GameMenuProps {
  onFreeTicketWon?: () => void;
  onGameStateChange?: (isPlaying: boolean) => void;
}

export default function GameMenu({ onFreeTicketWon, onGameStateChange }: GameMenuProps) {
  const [selectedGame, setSelectedGame] = useState<GameSelection>("menu");

  const handleBackToMenu = () => {
    setSelectedGame("menu");
  };

  if (selectedGame === "speed-click") {
    return (
      <div className="space-y-3">
        {/* Back Button */}
        <button
          onClick={handleBackToMenu}
          className="px-3 py-1 text-xs font-bold transition-all"
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
          ← Back to Menu
        </button>
        <SpeedClickGame 
          onFreeTicketWon={onFreeTicketWon}
          onGameStateChange={onGameStateChange}
        />
      </div>
    );
  }

  if (selectedGame === "frog-jump") {
    return (
      <div className="space-y-3">
        {/* Back Button */}
        <button
          onClick={handleBackToMenu}
          className="px-3 py-1 text-xs font-bold transition-all"
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
          ← Back to Menu
        </button>
        <FrogJumpGame 
          onFreeTicketWon={onFreeTicketWon}
          onGameStateChange={onGameStateChange}
        />
      </div>
    );
  }

  if (selectedGame === "leaderboard") {
    return (
      <div className="space-y-3">
        {/* Back Button */}
        <button
          onClick={handleBackToMenu}
          className="px-3 py-1 text-xs font-bold transition-all"
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
          ← Back to Menu
        </button>
        <FrogJumpLeaderboard />
      </div>
    );
  }

  // Main Menu
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
            <span className="text-white text-xs font-bold">🎮</span>
            <span className="text-white text-xs font-bold">GAME MENU</span>
          </div>
          <div className="flex gap-0.5">
            <button className="w-4 h-4 border border-t-gray-300 border-l-gray-300 border-r-gray-600 border-b-gray-600 bg-gray-300 text-xs font-bold hover:bg-gray-400" style={{ fontSize: '10px' }}>_</button>
            <button className="w-4 h-4 border border-t-gray-300 border-l-gray-300 border-r-gray-600 border-b-gray-600 bg-gray-300 text-xs font-bold hover:bg-gray-400" style={{ fontSize: '10px' }}>□</button>
            <button className="w-4 h-4 border border-t-gray-300 border-l-gray-300 border-r-gray-600 border-b-gray-600 bg-gray-300 text-xs font-bold hover:bg-gray-400" style={{ fontSize: '10px' }}>×</button>
          </div>
        </div>

        {/* Window Content */}
        <div className="p-2 sm:p-4" style={{ background: '#c0c0c0' }}>
          <h2 className="text-base sm:text-lg font-bold mb-3 sm:mb-4 text-center" style={{ color: '#000' }}>Select a Game</h2>
          
          <div className="space-y-2 sm:space-y-3">
            {/* Speed Click Game */}
            <button
              onClick={() => setSelectedGame("speed-click")}
              className="w-full p-3 sm:p-4 text-left transition-all"
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
              onMouseLeave={(e) => {
                e.currentTarget.style.borderTopColor = '#fff';
                e.currentTarget.style.borderLeftColor = '#fff';
                e.currentTarget.style.borderRightColor = '#808080';
                e.currentTarget.style.borderBottomColor = '#808080';
                e.currentTarget.style.boxShadow = 'inset -1px -1px 0px #000, inset 1px 1px 0px #fff';
              }}
            >
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="text-xl sm:text-2xl">🎯</span>
                <div>
                  <div className="font-bold text-xs sm:text-sm">Speed Click Challenge</div>
                  <div className="text-xs" style={{ color: '#666' }}>
                    Hit 7 targets in 0.4s each • Win a report for 0.001 USDC
                  </div>
                </div>
              </div>
            </button>

            {/* Frog Jump Game */}
            <button
              onClick={() => setSelectedGame("frog-jump")}
              className="w-full p-3 sm:p-4 text-left transition-all"
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
              onMouseLeave={(e) => {
                e.currentTarget.style.borderTopColor = '#fff';
                e.currentTarget.style.borderLeftColor = '#fff';
                e.currentTarget.style.borderRightColor = '#808080';
                e.currentTarget.style.borderBottomColor = '#808080';
                e.currentTarget.style.boxShadow = 'inset -1px -1px 0px #000, inset 1px 1px 0px #fff';
              }}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">🐸</span>
                <div>
                  <div className="font-bold text-sm">Frog Jump</div>
                  <div className="text-xs" style={{ color: '#666' }}>
                    Jump over obstacles • Score 500+ to win a report for 0.001 USDC
                  </div>
                </div>
              </div>
            </button>

            {/* Leaderboard */}
            <button
              onClick={() => setSelectedGame("leaderboard")}
              className="w-full p-3 sm:p-4 text-left transition-all"
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
              onMouseLeave={(e) => {
                e.currentTarget.style.borderTopColor = '#fff';
                e.currentTarget.style.borderLeftColor = '#fff';
                e.currentTarget.style.borderRightColor = '#808080';
                e.currentTarget.style.borderBottomColor = '#808080';
                e.currentTarget.style.boxShadow = 'inset -1px -1px 0px #000, inset 1px 1px 0px #fff';
              }}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">🏆</span>
                <div>
                  <div className="font-bold text-sm">Leaderboard</div>
                  <div className="text-xs" style={{ color: '#666' }}>
                    View top scores for Frog Jump game
                  </div>
                </div>
              </div>
            </button>
          </div>

          {/* Info */}
          <div className="mt-3 sm:mt-4 p-2 sm:p-3 border-2 border-t-gray-300 border-l-gray-300 border-r-gray-600 border-b-gray-600" style={{ background: '#fff' }}>
            <p className="text-xs font-bold mb-1" style={{ color: '#000' }}>Game Info:</p>
            <ul className="text-xs space-y-0.5 sm:space-y-1" style={{ color: '#000' }}>
              <li>• Entry cost: <span className="font-bold">20,000 credits</span> per game</li>
              <li>• Entry reward: <span className="font-bold">+10 points</span> per game</li>
              <li>• Win condition: Complete game objectives to earn a report for 0.001 USDC</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

