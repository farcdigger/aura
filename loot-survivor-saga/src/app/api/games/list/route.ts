// src/app/api/games/list/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { fetchUserGames } from '@/lib/blockchain/bibliotheca';
import { supabase } from '@/lib/database/supabase';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const walletAddress = searchParams.get('wallet');

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Missing wallet address parameter' },
        { status: 400 }
      );
    }

    // 1. Önce veritabanından cache'lenmiş oyunları çek
    const { data: cachedGames, error: dbError } = await supabase
      .from('games')
      .select('id, adventurer_name, level, total_turns, final_score, is_dead, fetched_at')
      .eq('user_wallet', walletAddress.toLowerCase())
      .order('fetched_at', { ascending: false })
      .limit(50);

    // 2. Bibliotheca'dan da çek (Fresh data)
    let freshGames: any[] = [];
    try {
      freshGames = await fetchUserGames(walletAddress);
    } catch (error: any) {
      console.error('Bibliotheca fetch error:', error.message);
      // Hata olsa bile cache'den devam et
    }

    // 3. Fresh games'leri veritabanına kaydet (async, blocking değil)
    if (freshGames.length > 0) {
      const gameRecords = freshGames.map(game => ({
        id: game.id,
        user_wallet: walletAddress.toLowerCase(),
        adventurer_name: game.name,
        level: game.level,
        total_turns: 0, // GraphQL'den gelmiyor, sonra doldurulacak
        final_score: game.xp,
        is_dead: !!game.diedAt,
        raw_data: game,
        fetched_at: new Date().toISOString()
      }));

      // Upsert (ignore conflicts)
      supabase
        .from('games')
        .upsert(gameRecords, { onConflict: 'id' })
        .then(() => console.log('Games cached successfully'))
        .catch(err => console.error('Cache error:', err));
    }

    // 4. Response: Cache + Fresh birleştir (duplicate'leri kaldır)
    const allGames = [
      ...(cachedGames || []),
      ...freshGames.map(g => ({
        id: g.id,
        adventurer_name: g.name,
        level: g.level,
        total_turns: 0,
        final_score: g.xp,
        is_dead: !!g.diedAt
      }))
    ];

    // Duplicate'leri kaldır (id'ye göre)
    const uniqueGames = Array.from(
      new Map(allGames.map(game => [game.id, game])).values()
    );

    return NextResponse.json({
      games: uniqueGames,
      total: uniqueGames.length,
      cached: cachedGames?.length || 0,
      fresh: freshGames.length
    });

  } catch (error: any) {
    console.error('Games list error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}








