// apps/web/app/api/saga/generate/route.ts
// Proxy to loot-survivor-saga API
// In production, both apps are on the same domain (xfroranft.xyz)
// So we can use relative path or environment variable

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Get saga API URL from environment or use default
    // In production (same domain): Both apps are on xfroranft.xyz, so use relative path
    // In development: Try localhost:3001 (default saga app port) or use environment variable
    let sagaApiUrl: string;
    
    if (process.env.NEXT_PUBLIC_SAGA_API_URL) {
      // Explicitly set via environment variable
      sagaApiUrl = `${process.env.NEXT_PUBLIC_SAGA_API_URL}/api/saga/generate`;
    } else if (process.env.NODE_ENV === 'production') {
      // Production: Same domain, use relative path
      sagaApiUrl = '/api/saga/generate';
    } else {
      // Development: Default to localhost:3001 (saga app default port)
      sagaApiUrl = 'http://localhost:3001/api/saga/generate';
    }
    
    console.log('[Saga Generate Proxy] Forwarding to:', sagaApiUrl);
    
    // Forward the request to saga API
    const response = await fetch(sagaApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
      }
      
      console.error('[Saga Generate Proxy] Error response:', errorData);
      return NextResponse.json(
        { error: errorData.error || 'Failed to generate saga' },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    return NextResponse.json(data);
    
  } catch (error: any) {
    console.error('[Saga Generate Proxy] Error:', error);
    
    // If it's a network error (saga API not reachable), provide helpful message
    if (error.message?.includes('fetch') || error.code === 'ECONNREFUSED') {
      return NextResponse.json(
        { 
          error: 'Saga API is not reachable. Please make sure the saga application is running.',
          hint: process.env.NODE_ENV === 'production' 
            ? 'In production, ensure both apps are deployed on the same domain.'
            : 'In development, ensure saga app is running on port 3001 or set NEXT_PUBLIC_SAGA_API_URL.'
        },
        { status: 503 } // Service Unavailable
      );
    }
    
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

