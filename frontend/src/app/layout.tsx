import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AtomicQuant | Sui 原子化对冲金库",
  description: "去中心化金融原子化对冲平台，在 Sui 区块链上实现零滑点抵押借贷对冲",
  keywords: ["Sui", "DeFi", "Atomic", "Hedge", "Vault", "PTB"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
