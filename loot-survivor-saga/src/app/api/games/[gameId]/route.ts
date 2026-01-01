// src/app/api/games/[gameId]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { fetchGameData } from '@/lib/blockchain/bibliotheca';
import { supabase } from '@/lib/database/supabase';

export async function GET(
  req: NextRequest,
  { params }: { params: { gameId: string } }
) {
  const { gameId } = params;

  try {
    // 1. Cache kontrolü (Veritabanında var mı?)
    const { data: cached, error } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single();

    if (cached && !error) {
      // Cache'den 24 saatten eskiyse yenile
      const cacheAge = Date.now() - new Date(cached.fetched_at).getTime();
      if (cacheAge < 24 * 60 * 60 * 1000) {
        return NextResponse.json(cached);
      }
    }

    // 2. Blockchain'den çek
    const gameData = await fetchGameData(gameId);

    // 3. Veritabanına kaydet
    const gameRecord = {
      id: gameId,
      user_wallet: gameData.adventurer.owner,
      adventurer_name: gameData.adventurer.name,
      level: gameData.adventurer.level,
      total_turns: gameData.logs.length,
      final_score: gameData.adventurer.xp,
      is_dead: gameData.adventurer.health === 0,
      raw_data: { adventurer: gameData.adventurer, logs: gameData.logs },
      fetched_at: new Date().toISOString()
    };

    await supabase
      .from('games')
      .upsert(gameRecord, { onConflict: 'id' });

    return NextResponse.json(gameRecord);

  } catch (error: any) {
    console.error('Game fetch error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}








