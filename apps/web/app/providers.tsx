"use client";

import "@rainbow-me/rainbowkit/styles.css";

import { ReactNode, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  getDefaultConfig,
  RainbowKitProvider,
} from "@rainbow-me/rainbowkit";
import { env } from "@/env.mjs";
import { base } from "wagmi/chains";
import { WagmiProvider } from "wagmi";
import { ThemeProvider } from "@/components/ThemeProvider";

const projectId = env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

if (!projectId || projectId === "demo") {
  console.warn(
    "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not configured. RainbowKit will not be able to connect to wallets in production."
  );
}

const wagmiConfig = getDefaultConfig({
  appName: "xFrora",
  projectId: projectId || "demo",
  chains: [base],
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={client}>
        <RainbowKitProvider modalSize="compact">
          <ThemeProvider>{children}</ThemeProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

