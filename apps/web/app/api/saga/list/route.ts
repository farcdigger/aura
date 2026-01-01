// apps/web/app/api/saga/list/route.ts
// Get list of sagas for a user wallet

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const walletAddress = searchParams.get('wallet');

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      );
    }

    // Import supabase
    const { supabase } = await import('@/lib/saga/database/supabase');

    // Fetch sagas for this wallet, ordered by most recent first
    const { data: sagas, error } = await supabase
      .from('sagas')
      .select('id, game_id, status, story_text, total_pages, created_at, completed_at')
      .eq('user_wallet', walletAddress.toLowerCase())
      .order('created_at', { ascending: false })
      .limit(50); // Limit to last 50 sagas

    if (error) {
      console.error(`[Saga List] Error fetching sagas for wallet ${walletAddress}:`, error);
      return NextResponse.json(
        { error: `Failed to fetch sagas: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      sagas: sagas || [],
      count: sagas?.length || 0
    });
  } catch (error: any) {
    console.error('[Saga List] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

