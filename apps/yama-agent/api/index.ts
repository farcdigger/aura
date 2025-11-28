import type { VercelRequest, VercelResponse } from '@vercel/node';

// Dynamically import the agent app
let app: any = null;
let appLoadError: string | null = null;

async function getApp() {
  if (app) return app;
  
  try {
    // In Vercel, we need to use absolute path from project root
    // Vercel sets process.cwd() to the project root
    const projectRoot = process.cwd();
    console.log('[Vercel] Project root:', projectRoot);
    console.log('[Vercel] __dirname:', __dirname);
    
    // Try different import strategies
    const importStrategies = [
      // Strategy 1: Direct relative import from api folder
      async () => {
        const path = '../src/lib/agent.js';
        console.log('[Vercel] Trying relative path:', path);
        return await import(path);
      },
      // Strategy 2: Absolute path using process.cwd()
      async () => {
        const path = `${projectRoot}/src/lib/agent.js`;
        console.log('[Vercel] Trying absolute path:', path);
        return await import(path);
      },
      // Strategy 3: Without .js extension
      async () => {
        const path = '../src/lib/agent';
        console.log('[Vercel] Trying without extension:', path);
        return await import(path);
      },
      // Strategy 4: From apps/yama-agent
      async () => {
        const path = `${projectRoot}/apps/yama-agent/src/lib/agent.js`;
        console.log('[Vercel] Trying monorepo path:', path);
        return await import(path);
      },
    ];
    
    for (let i = 0; i < importStrategies.length; i++) {
      try {
        console.log(`[Vercel] Attempting strategy ${i + 1}...`);
        const agentModule = await importStrategies[i]();
        app = agentModule.app;
        if (app) {
          console.log(`[Vercel] ✅ Successfully loaded agent using strategy ${i + 1}`);
          return app;
        }
      } catch (err: any) {
        console.log(`[Vercel] Strategy ${i + 1} failed:`, err.message);
        continue;
      }
    }
    
    appLoadError = 'Could not load agent from any path';
    throw new Error(appLoadError);
  } catch (error: any) {
    appLoadError = error.message;
    console.error('[Vercel] Failed to load agent:', error);
    throw error;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Health check
  if (req.url === '/health') {
    return res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  }

  // Load app dynamically
  try {
    app = await getApp();
  } catch (error: any) {
    return res.status(500).json({ 
      error: 'Agent not initialized',
      message: 'Failed to load agent module',
      details: error.message,
      cwd: process.cwd(),
      dirname: __dirname,
      loadError: appLoadError
    });
  }

  try {
    // Build full URL
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const url = `${protocol}://${host}${req.url}`;

    console.log(`[Vercel] ${req.method} ${url}`);

    // Convert Vercel request to Web Request
    const headers: Record<string, string> = {};
    Object.entries(req.headers).forEach(([key, value]) => {
      if (value) {
        headers[key] = Array.isArray(value) ? value[0] : value;
      }
    });

    const request = new Request(url, {
      method: req.method || 'GET',
      headers: new Headers(headers),
      body: req.method !== 'GET' && req.method !== 'HEAD' && req.body
        ? JSON.stringify(req.body)
        : undefined,
    });

    // Call the Hono app
    const response = await app.fetch(request);

    // Convert Response back to Vercel response
    const contentType = response.headers.get('content-type') || 'application/json';
    
    // Set status and headers
    res.status(response.status);
    response.headers.forEach((value: string, key: string) => {
      res.setHeader(key, value);
    });

    // Handle different content types
    if (contentType.includes('application/json')) {
      const json = await response.json();
      return res.json(json);
    } else if (contentType.includes('text/')) {
      const text = await response.text();
      return res.send(text);
    } else {
      const buffer = await response.arrayBuffer();
      return res.send(Buffer.from(buffer));
    }
  } catch (error: any) {
    console.error('[Vercel] Handler error:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

