"use client";

import { createNetworkConfig, SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@mysten/dapp-kit/dist/index.css";

// 使用 getJsonRpcFullnodeUrl 获取正确的 RPC URL
const { networkConfig } = createNetworkConfig({
    testnet: { url: getJsonRpcFullnodeUrl("testnet") },
    mainnet: { url: getJsonRpcFullnodeUrl("mainnet") },
});

const queryClient = new QueryClient();

export default function Providers({ children }: { children: React.ReactNode }) {
    return (
        <QueryClientProvider client={queryClient}>
            <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
                <WalletProvider autoConnect>{children}</WalletProvider>
            </SuiClientProvider>
        </QueryClientProvider>
    );
}
