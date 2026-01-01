// src/app/api/health/route.ts
// Health check endpoint

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/database/supabase';

export async function GET() {
  try {
    // Supabase bağlantısını test et
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        database: error ? 'error' : 'connected',
        bibliotheca: 'ready' // GraphQL public API, her zaman hazır
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'error',
        error: error.message
      },
      { status: 500 }
    );
  }
}








