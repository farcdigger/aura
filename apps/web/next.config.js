/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID || "8453", // Base Mainnet
    NEXT_PUBLIC_CONTRACT_ADDRESS: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "",
    NEXT_PUBLIC_USDC_CONTRACT_ADDRESS: process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS || "",
    NEXT_PUBLIC_X402_FACILITATOR_URL: process.env.NEXT_PUBLIC_X402_FACILITATOR_URL || "https://router.daydreams.systems",
  },
  webpack: (config, { isServer }) => {
    // Exclude Node.js-only modules from client-side bundle
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        path: false,
        events: false,
        buffer: false,
        util: false,
      };
      
      // Exclude ws (WebSocket) and other Node.js-only packages from client bundle
      config.externals = config.externals || [];
      config.externals.push({
        'ws': 'commonjs ws',
        'bufferutil': 'commonjs bufferutil',
        'utf-8-validate': 'commonjs utf-8-validate',
      });
    }
    
    return config;
  },
};

module.exports = nextConfig;

