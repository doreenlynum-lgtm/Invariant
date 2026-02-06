"use client";

import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useState } from "react";

// 部署的合约地址
const PACKAGE_ID = "0xfdd92ba291151a5328e1d6e1eb80047eb42cb8b0121c221cac5bb083bb37862b";

export default function Home() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();

  const [depositAmount, setDepositAmount] = useState("");
  const [vaultData, setVaultData] = useState({
    collateral: "0",
    borrowed: "0",
    ltv: 0,
    hedgePosition: "0",
  });

  // 创建金库
  const handleCreateVault = () => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::vault::create_vault`,
      arguments: [tx.object("0x6")], // Clock
    });

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: (result) => {
          console.log("Vault created:", result);
          alert("金库创建成功！");
        },
        onError: (error) => {
          console.error("Error:", error);
          alert("创建失败: " + error.message);
        },
      }
    );
  };

  // 存款
  const handleDeposit = () => {
    if (!depositAmount) return;

    const amountMist = BigInt(parseFloat(depositAmount) * 1e9);
    const tx = new Transaction();

    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);

    tx.moveCall({
      target: `${PACKAGE_ID}::vault::deposit`,
      arguments: [
        tx.object("VAULT_ID"), // 需要替换为实际的 vault ID
        coin,
        tx.object("0x6"),
      ],
    });

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: (result) => {
          console.log("Deposit success:", result);
          setDepositAmount("");
        },
      }
    );
  };

  return (
    <div className="min-h-screen grid-bg">
      {/* 导航栏 */}
      <nav className="glass fixed top-0 left-0 right-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-orange-500 flex items-center justify-center">
              <span className="text-white font-bold text-lg">AQ</span>
            </div>
            <span className="text-xl font-bold">
              Atomic<span className="text-orange-500">Quant</span>
            </span>
          </div>

          <div className="flex items-center gap-6">
            <a href="#" className="text-gray-300 hover:text-white transition">Dashboard</a>
            <a href="#" className="text-gray-300 hover:text-white transition">金库</a>
            <a href="#" className="text-gray-300 hover:text-white transition">文档</a>
            <ConnectButton />
          </div>
        </div>
      </nav>

      {/* 主内容 */}
      <main className="pt-24 pb-12 px-6">
        <div className="max-w-7xl mx-auto">

          {/* Hero 区域 */}
          <section className="text-center mb-16">
            <h1 className="text-5xl font-bold mb-6">
              <span className="bg-gradient-to-r from-blue-400 via-blue-500 to-orange-500 bg-clip-text text-transparent">
                原子化对冲金库
              </span>
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-8">
              在 Sui 区块链上实现零滑点的抵押借贷与对冲，
              所有操作在单一交易中原子化完成
            </p>

            {!account && (
              <div className="inline-block">
                <ConnectButton />
              </div>
            )}
          </section>

          {/* 统计卡片 */}
          <section className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
            <div className="glass-card p-6 card-hover">
              <div className="stat-label mb-2">总锁仓量 (TVL)</div>
              <div className="stat-value">$1.2M</div>
            </div>
            <div className="glass-card p-6 card-hover">
              <div className="stat-label mb-2">活跃金库</div>
              <div className="stat-value">156</div>
            </div>
            <div className="glass-card p-6 card-hover">
              <div className="stat-label mb-2">SUI 价格</div>
              <div className="stat-value">$3.52</div>
            </div>
            <div className="glass-card p-6 card-hover">
              <div className="stat-label mb-2">最大 LTV</div>
              <div className="text-3xl font-bold text-orange-500">64%</div>
            </div>
          </section>

          {/* 主操作区 */}
          {account && (
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">

              {/* 我的金库 */}
              <div className="lg:col-span-2 glass-card p-8">
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    🏦
                  </span>
                  我的金库
                </h2>

                <div className="grid grid-cols-2 gap-6 mb-8">
                  <div className="bg-gray-800/50 rounded-xl p-5">
                    <div className="text-gray-400 text-sm mb-1">抵押品 (SUI)</div>
                    <div className="text-2xl font-bold">{vaultData.collateral} SUI</div>
                    <div className="text-gray-500 text-sm">≈ $0.00</div>
                  </div>
                  <div className="bg-gray-800/50 rounded-xl p-5">
                    <div className="text-gray-400 text-sm mb-1">已借款 (USDC)</div>
                    <div className="text-2xl font-bold text-orange-400">{vaultData.borrowed} USDC</div>
                  </div>
                </div>

                {/* LTV 进度条 */}
                <div className="mb-8">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-400">当前 LTV</span>
                    <span className={`font-medium ${vaultData.ltv > 60 ? "text-orange-400" : "text-green-400"}`}>
                      {vaultData.ltv}%
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className={`progress-fill ${vaultData.ltv > 70 ? "danger" : vaultData.ltv > 50 ? "warning" : ""}`}
                      style={{ width: `${Math.min(vaultData.ltv, 100)}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>安全</span>
                    <span>64% 最大</span>
                    <span>80% 清算</span>
                  </div>
                </div>

                {/* 对冲头寸 */}
                <div className="bg-gradient-to-r from-blue-900/30 to-orange-900/30 rounded-xl p-5 border border-blue-500/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-gray-400 text-sm mb-1">对冲头寸 (空头)</div>
                      <div className="text-xl font-bold">{vaultData.hedgePosition} SUI</div>
                    </div>
                    <div className="text-right">
                      <div className="text-gray-400 text-sm mb-1">Delta 敞口</div>
                      <div className="text-xl font-bold text-green-400">≈ 0%</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 操作面板 */}
              <div className="glass-card p-8">
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                    ⚡
                  </span>
                  快速操作
                </h2>

                {/* 创建金库按钮 */}
                <button
                  onClick={handleCreateVault}
                  disabled={isPending}
                  className="btn-primary w-full mb-6 disabled:opacity-50"
                >
                  {isPending ? "处理中..." : "创建新金库"}
                </button>

                {/* 存款 */}
                <div className="mb-6">
                  <label className="block text-gray-400 text-sm mb-2">存入 SUI</label>
                  <div className="flex gap-3">
                    <input
                      type="number"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="输入金额"
                      className="input-field flex-1"
                    />
                    <button className="btn-outline px-6">MAX</button>
                  </div>
                </div>

                <button
                  onClick={handleDeposit}
                  disabled={!depositAmount || isPending}
                  className="btn-secondary w-full mb-6 disabled:opacity-50"
                >
                  存款
                </button>

                <div className="border-t border-gray-700 pt-6">
                  <button className="btn-outline w-full mb-3">
                    🛡️ 一键原子对冲
                  </button>
                  <p className="text-gray-500 text-xs text-center">
                    自动执行：存款 → 借款 → 开仓，全部在一笔交易中完成
                  </p>
                </div>
              </div>

            </section>
          )}

          {/* 功能介绍 */}
          <section className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="glass-card p-8 card-hover text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-600/20 flex items-center justify-center text-3xl">
                ⚛️
              </div>
              <h3 className="text-xl font-bold mb-3">原子化交易</h3>
              <p className="text-gray-400">
                所有操作在单一 PTB 中完成，要么全部成功，要么全部回滚，杜绝部分执行风险
              </p>
            </div>

            <div className="glass-card p-8 card-hover text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-orange-500/20 to-orange-600/20 flex items-center justify-center text-3xl">
                📊
              </div>
              <h3 className="text-xl font-bold mb-3">Delta 中性</h3>
              <p className="text-gray-400">
                自动计算最优对冲比例，借款后立即开空头，实现近乎零市场敞口
              </p>
            </div>

            <div className="glass-card p-8 card-hover text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-green-500/20 to-green-600/20 flex items-center justify-center text-3xl">
                🔒
              </div>
              <h3 className="text-xl font-bold mb-3">风险管理</h3>
              <p className="text-gray-400">
                实时 LTV 监控、价格预言机验证、滑点保护、紧急暂停机制
              </p>
            </div>
          </section>

        </div>
      </main>

      {/* 页脚 */}
      <footer className="glass py-8 mt-12">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between text-gray-400 text-sm">
          <div>© 2026 AtomicQuant. Built on Sui.</div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-white transition">GitHub</a>
            <a href="#" className="hover:text-white transition">Twitter</a>
            <a href="#" className="hover:text-white transition">Discord</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
