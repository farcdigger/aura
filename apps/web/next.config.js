/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID || "84532", // Base Sepolia
    NEXT_PUBLIC_CONTRACT_ADDRESS: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "",
    NEXT_PUBLIC_USDC_CONTRACT_ADDRESS: process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS || "",
  },
};

module.exports = nextConfig;

