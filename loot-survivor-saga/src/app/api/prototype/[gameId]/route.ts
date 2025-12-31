// src/app/api/prototype/[gameId]/route.ts
// API route for prototype page to fetch game data

import { NextResponse } from 'next/server';
import { fetchGameData } from '@/lib/blockchain/bibliotheca';

export async function GET(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  try {
    const gameId = params.gameId;
    
    if (!gameId) {
      return NextResponse.json(
        { error: 'Game ID is required' },
        { status: 400 }
      );
    }

    const data = await fetchGameData(gameId);
    
    return NextResponse.json({
      success: true,
      data: {
        adventurer: data.adventurer,
        logs: data.logs,
        isDead: data.adventurer.health === 0,
        lastEvent: data.logs[data.logs.length - 1] || null,
        eventCount: data.logs.length
      }
    });
  } catch (error: any) {
    console.error('[Prototype API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch game data' },
      { status: 500 }
    );
  }
}


