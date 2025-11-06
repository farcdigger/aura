/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow middleware to use Node.js APIs (for x402-next package)
  // Note: This may cause Edge Runtime issues, but x402-next requires Node.js APIs
  experimental: {
    serverComponentsExternalPackages: ['@coinbase/x402'],
  },
  env: {
    NEXT_PUBLIC_CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID || "8453", // Base Mainnet
    NEXT_PUBLIC_CONTRACT_ADDRESS: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0xDFB4e6C3096393fB9f09191191BCc8454b3F4116", // Base Mainnet default
    NEXT_PUBLIC_USDC_CONTRACT_ADDRESS: process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS || "",
    NEXT_PUBLIC_X402_FACILITATOR_URL: process.env.NEXT_PUBLIC_X402_FACILITATOR_URL || "https://router.daydreams.systems",
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "",
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
      
      // Ignore ws and related packages completely in client bundle
      const webpack = require('webpack');
      config.plugins = config.plugins || [];
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^ws$/,
        }),
        new webpack.IgnorePlugin({
          resourceRegExp: /^bufferutil$/,
        }),
        new webpack.IgnorePlugin({
          resourceRegExp: /^utf-8-validate$/,
        })
      );
    }
    
    return config;
  },
};

module.exports = nextConfig;

