// src/app/prototype/page.tsx
// Prototype page to showcase event data and death scenes

'use client';

import { useState } from 'react';
import type { AdventurerData, GameLog } from '@/types/game';

export default function PrototypePage() {
  const [gameId, setGameId] = useState('133595');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    adventurer: AdventurerData;
    logs: GameLog[];
  } | null>(null);

  const handleFetch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setData(null);

    try {
      const res = await fetch(`/api/prototype/${gameId}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch game data');
      }
      const response = await res.json();
      setData(response.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isDead = data?.adventurer.health === 0;
  const lastEvent = data?.logs[data.logs.length - 1];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
            🎮 Loot Survivor Saga - Prototype
          </h1>
          <p className="text-gray-400 text-lg">
            Test your adventurer's final moments and generate a comic book
          </p>
        </div>

        {/* Form */}
        <div className="bg-gray-800 border-2 border-gray-700 rounded-lg p-6 mb-8">
          <form onSubmit={handleFetch} className="flex gap-4">
            <input
              type="text"
              value={gameId}
              onChange={(e) => setGameId(e.target.value)}
              placeholder="Enter Game ID (e.g., 133595)"
              className="flex-1 bg-gray-900 border border-gray-600 rounded px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed px-8 py-3 rounded font-bold transition-all"
            >
              {loading ? 'Loading...' : 'Fetch Data'}
            </button>
          </form>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900 border-2 border-red-700 rounded-lg p-4 mb-8">
            <p className="text-red-200 font-semibold">❌ Error: {error}</p>
          </div>
        )}

        {/* Data Display */}
        {data && (
          <div className="space-y-8">
            {/* Adventurer Stats */}
            <div className="bg-gray-800 border-2 border-gray-700 rounded-lg p-6">
              <h2 className="text-2xl font-bold mb-4 text-yellow-400">⚔️ Adventurer Stats</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-900 rounded p-4">
                  <div className="text-gray-400 text-sm mb-1">Health</div>
                  <div className={`text-3xl font-bold ${isDead ? 'text-red-500' : 'text-green-500'}`}>
                    {data.adventurer.health}
                  </div>
                </div>
                <div className="bg-gray-900 rounded p-4">
                  <div className="text-gray-400 text-sm mb-1">Level</div>
                  <div className="text-3xl font-bold text-blue-400">{data.adventurer.level}</div>
                </div>
                <div className="bg-gray-900 rounded p-4">
                  <div className="text-gray-400 text-sm mb-1">XP</div>
                  <div className="text-3xl font-bold text-purple-400">{data.adventurer.xp}</div>
                </div>
                <div className="bg-gray-900 rounded p-4">
                  <div className="text-gray-400 text-sm mb-1">Gold</div>
                  <div className="text-3xl font-bold text-yellow-400">{data.adventurer.gold}</div>
                </div>
              </div>
            </div>

            {/* Death Status */}
            <div className={`border-2 rounded-lg p-6 ${isDead ? 'bg-red-900 border-red-700' : 'bg-green-900 border-green-700'}`}>
              <h2 className="text-2xl font-bold mb-4">
                {isDead ? '💀 DEATH SCENE DETECTED' : '✅ ADVENTURER ALIVE'}
              </h2>
              <p className="text-lg">
                {isDead 
                  ? 'This adventurer has died. We can generate a comic book about their final moments!'
                  : 'This adventurer is still alive. We can generate a comic book about their journey so far!'}
              </p>
            </div>

            {/* Events */}
            <div className="bg-gray-800 border-2 border-gray-700 rounded-lg p-6">
              <h2 className="text-2xl font-bold mb-4 text-yellow-400">📋 Events ({data.logs.length})</h2>
              
              {data.logs.length === 0 ? (
                <div className="bg-gray-900 rounded p-4 text-center text-gray-400">
                  <p>No events found. We can still generate a comic from adventurer stats!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Last Event (Most Important) */}
                  {lastEvent && (
                    <div className="bg-gradient-to-r from-yellow-900 to-orange-900 border-2 border-yellow-700 rounded-lg p-6">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-3xl">
                          {lastEvent.eventType === 'Flee' ? '🏃' : 
                           lastEvent.eventType === 'BeastAttack' ? '🐉' : 
                           lastEvent.eventType === 'Attack' ? '⚔️' : 
                           lastEvent.eventType === 'Discovered' ? '🔍' : 
                           lastEvent.eventType === 'Ambush' ? '🎯' : '❓'}
                        </span>
                        <div>
                          <h3 className="text-xl font-bold">Last Event: {lastEvent.eventType}</h3>
                          <p className="text-gray-300 text-sm">Turn {lastEvent.turnNumber}</p>
                        </div>
                      </div>
                      <div className="bg-black bg-opacity-30 rounded p-4 mt-4">
                        <pre className="text-sm text-gray-300 overflow-x-auto">
                          {JSON.stringify(lastEvent.data, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* All Events List */}
                  <div className="bg-gray-900 rounded p-4">
                    <h3 className="font-bold mb-3 text-yellow-400">All Events:</h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {data.logs.map((log, i) => (
                        <div key={i} className="flex items-center gap-3 p-2 bg-gray-800 rounded">
                          <span className="text-xs text-gray-400 w-12">#{log.turnNumber}</span>
                          <span className="flex-1 font-semibold">{log.eventType}</span>
                          <span className="text-xs text-gray-500">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Comic Book Preview */}
            <div className="bg-gray-800 border-2 border-gray-700 rounded-lg p-6">
              <h2 className="text-2xl font-bold mb-4 text-yellow-400">📖 Comic Book Preview</h2>
              
              {isDead && lastEvent ? (
                <div className="bg-gradient-to-br from-red-900 to-black border-2 border-red-700 rounded-lg p-8 text-center">
                  <div className="text-6xl mb-4">💀</div>
                  <h3 className="text-3xl font-bold mb-4">The Final Battle</h3>
                  <p className="text-xl text-gray-300 mb-6">
                    Level {data.adventurer.level} Adventurer met their end at Turn {lastEvent.turnNumber}
                  </p>
                  <div className="bg-black bg-opacity-50 rounded-lg p-6 mb-6">
                    <p className="text-lg text-gray-200 italic">
                      "The adventurer fought valiantly, but in the end, the beast's final blow was too much..."
                    </p>
                  </div>
                  <div className="text-sm text-gray-400">
                    <p>Event Type: {lastEvent.eventType}</p>
                    <p>Final Stats: {data.adventurer.xp} XP, {data.adventurer.gold} Gold</p>
                  </div>
                </div>
              ) : data.logs.length > 0 ? (
                <div className="bg-gradient-to-br from-blue-900 to-black border-2 border-blue-700 rounded-lg p-8 text-center">
                  <div className="text-6xl mb-4">⚔️</div>
                  <h3 className="text-3xl font-bold mb-4">The Journey Continues</h3>
                  <p className="text-xl text-gray-300 mb-6">
                    Level {data.adventurer.level} Adventurer is still fighting!
                  </p>
                  <div className="bg-black bg-opacity-50 rounded-lg p-6 mb-6">
                    <p className="text-lg text-gray-200 italic">
                      "The adventurer's story is not yet complete. They continue their quest..."
                    </p>
                  </div>
                  <div className="text-sm text-gray-400">
                    <p>Last Event: {lastEvent?.eventType} at Turn {lastEvent?.turnNumber}</p>
                    <p>Current Stats: {data.adventurer.health} HP, {data.adventurer.xp} XP, {data.adventurer.gold} Gold</p>
                  </div>
                </div>
              ) : (
                <div className="bg-gradient-to-br from-gray-900 to-black border-2 border-gray-700 rounded-lg p-8 text-center">
                  <div className="text-6xl mb-4">📜</div>
                  <h3 className="text-3xl font-bold mb-4">Adventurer's Tale</h3>
                  <p className="text-xl text-gray-300 mb-6">
                    Level {data.adventurer.level} Adventurer
                  </p>
                  <div className="bg-black bg-opacity-50 rounded-lg p-6 mb-6">
                    <p className="text-lg text-gray-200 italic">
                      "A story waiting to be told from the adventurer's stats and equipment..."
                    </p>
                  </div>
                  <div className="text-sm text-gray-400">
                    <p>Stats: {data.adventurer.health} HP, {data.adventurer.xp} XP, {data.adventurer.gold} Gold</p>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                onClick={() => {
                  // TODO: Navigate to full comic generation
                  alert('Full comic generation coming soon! This prototype shows the data we can use.');
                }}
                className="flex-1 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 px-8 py-4 rounded-lg font-bold text-lg transition-all"
              >
                🎨 Generate Full Comic Book
              </button>
              <button
                onClick={() => {
                  const shareText = `Check out my Loot Survivor adventurer!\nGame ID: ${gameId}\nLevel: ${data.adventurer.level}\nHealth: ${data.adventurer.health}\nEvents: ${data.logs.length}`;
                  navigator.clipboard.writeText(shareText);
                  alert('Copied to clipboard!');
                }}
                className="px-8 py-4 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold transition-all"
              >
                📋 Share
              </button>
            </div>
          </div>
        )}

        {/* Info Footer */}
        <div className="mt-12 text-center text-gray-500 text-sm">
          <p>This is a prototype. Full comic generation with AI images coming soon!</p>
          <p className="mt-2">
            Currently showing: {data ? 'Event data + Adventurer stats' : 'Enter a Game ID to start'}
          </p>
        </div>
      </div>
    </div>
  );
}

