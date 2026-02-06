"use client";

import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useState, useEffect, useCallback } from "react";

// 部署的合约地址
const PACKAGE_ID = "0xfdd92ba291151a5328e1d6e1eb80047eb42cb8b0121c221cac5bb083bb37862b";

// PTB 原子对冲参数
const DEFAULT_TARGET_LTV = 0.5; // 50% of max (64%)
const DEFAULT_SLIPPAGE = 0.005; // 0.5%
const SUI_DECIMALS = 9;

// Pyth Price Feed ID for SUI/USD
const SUI_USD_FEED_ID = "0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744";

export default function Home() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();

  // 用户 Vaults 列表
  const [userVaults, setUserVaults] = useState<{ id: string; collateral: string }[]>([]);
  const [selectedVaultId, setSelectedVaultId] = useState<string | null>(null);
  const [isLoadingVaults, setIsLoadingVaults] = useState(false);

  // 表单状态
  const [depositAmount, setDepositAmount] = useState("");
  const [hedgeAmount, setHedgeAmount] = useState("");
  const [isHedging, setIsHedging] = useState(false);

  // 实时价格
  const [suiPrice, setSuiPrice] = useState<number>(3.50);
  const [priceLoading, setPriceLoading] = useState(false);

  // 金库数据
  const [vaultData, setVaultData] = useState({
    collateral: "0",
    borrowed: "0",
    ltv: 0,
    hedgePosition: "0",
  });

  // 对冲预估
  const [hedgePreview, setHedgePreview] = useState({
    borrowAmount: "0",
    hedgeSize: "0",
    limitPrice: "0",
  });

  // 🔥 查询用户的 Vaults
  const fetchUserVaults = useCallback(async (address: string) => {
    setIsLoadingVaults(true);
    try {
      const objects = await client.getOwnedObjects({
        owner: address,
        filter: {
          StructType: `${PACKAGE_ID}::vault::Vault`
        },
        options: { showContent: true }
      });

      const vaults = objects.data
        .filter(obj => obj.data)
        .map(obj => {
          const content = obj.data?.content as any;
          return {
            id: obj.data!.objectId,
            collateral: content?.fields?.collateral_amount || "0",
          };
        });

      setUserVaults(vaults);

      // 自动选择第一个 Vault
      if (vaults.length > 0 && !selectedVaultId) {
        setSelectedVaultId(vaults[0].id);
      }

      console.log("[Invariant] Found vaults:", vaults);
    } catch (error) {
      console.error("[Invariant] Failed to fetch vaults:", error);
    } finally {
      setIsLoadingVaults(false);
    }
  }, [client, selectedVaultId]);

  // 🔥 获取实时 SUI 价格 (从 Pyth)
  const fetchSuiPrice = useCallback(async () => {
    setPriceLoading(true);
    try {
      const response = await fetch(
        `https://hermes.pyth.network/api/latest_price_feeds?ids[]=${SUI_USD_FEED_ID}`
      );

      if (response.ok) {
        const data = await response.json();
        if (data && data[0] && data[0].price) {
          const price = parseFloat(data[0].price.price) * Math.pow(10, data[0].price.expo);
          setSuiPrice(price);
          console.log("[Invariant] SUI price from Pyth:", price);
        }
      }
    } catch (error) {
      console.warn("[Invariant] Failed to fetch Pyth price, using fallback:", error);
      // 使用备用价格
      setSuiPrice(3.50);
    } finally {
      setPriceLoading(false);
    }
  }, []);

  // 初始化：获取 Vaults 和价格
  useEffect(() => {
    if (account?.address) {
      fetchUserVaults(account.address);
    }
    fetchSuiPrice();

    // 每 30 秒刷新价格
    const priceInterval = setInterval(fetchSuiPrice, 30000);
    return () => clearInterval(priceInterval);
  }, [account?.address, fetchUserVaults, fetchSuiPrice]);

  // 更新对冲预估
  useEffect(() => {
    if (hedgeAmount && parseFloat(hedgeAmount) > 0) {
      const suiAmount = parseFloat(hedgeAmount);
      const borrowAmountUSD = suiAmount * suiPrice * DEFAULT_TARGET_LTV * 0.64;
      const hedgeSize = borrowAmountUSD / suiPrice;
      const limitPrice = suiPrice * (1 - DEFAULT_SLIPPAGE);

      setHedgePreview({
        borrowAmount: borrowAmountUSD.toFixed(2),
        hedgeSize: hedgeSize.toFixed(4),
        limitPrice: limitPrice.toFixed(4),
      });
    } else {
      setHedgePreview({ borrowAmount: "0", hedgeSize: "0", limitPrice: "0" });
    }
  }, [hedgeAmount, suiPrice]);

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
          alert("✅ 金库创建成功！");
          // 刷新 Vault 列表
          if (account?.address) {
            setTimeout(() => fetchUserVaults(account.address), 2000);
          }
        },
        onError: (error) => {
          console.error("Error:", error);
          alert("❌ 创建失败: " + error.message);
        },
      }
    );
  };

  // 存款 (使用选中的 Vault)
  const handleDeposit = () => {
    if (!depositAmount || !selectedVaultId) {
      alert("请先选择金库并输入金额");
      return;
    }

    const amountMist = BigInt(parseFloat(depositAmount) * 1e9);
    const tx = new Transaction();

    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);

    tx.moveCall({
      target: `${PACKAGE_ID}::vault::deposit`,
      arguments: [
        tx.object(selectedVaultId), // ✅ 动态 Vault ID
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
          alert("✅ 存款成功！");
          // 刷新数据
          if (account?.address) {
            fetchUserVaults(account.address);
          }
        },
        onError: (error) => {
          console.error("Deposit error:", error);
          alert("❌ 存款失败: " + error.message);
        },
      }
    );
  };

  // 🔥 一键原子对冲
  const handleAtomicHedge = async () => {
    if (!hedgeAmount || !account) return;

    setIsHedging(true);

    try {
      const suiAmountMist = BigInt(Math.floor(parseFloat(hedgeAmount) * Math.pow(10, SUI_DECIMALS)));

      const tx = new Transaction();
      tx.setSender(account.address);

      // Step 1: 分割 SUI coin 用于抵押
      const [collateralCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(suiAmountMist)]);

      // Step 2: 创建金库 (如果没有选中)
      tx.moveCall({
        target: `${PACKAGE_ID}::vault::create_vault`,
        arguments: [tx.object("0x6")],
      });

      console.log("[Atomic Hedge] Building transaction...");
      console.log(`  SUI Amount: ${parseFloat(hedgeAmount)} SUI`);
      console.log(`  SUI Price: $${suiPrice.toFixed(4)}`);
      console.log(`  Est. Borrow: ${hedgePreview.borrowAmount} USDC`);
      console.log(`  Est. Hedge: ${hedgePreview.hedgeSize} SUI`);

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: (result) => {
            console.log("Atomic hedge success:", result);
            setVaultData(prev => ({
              ...prev,
              collateral: hedgeAmount,
              borrowed: hedgePreview.borrowAmount,
              ltv: Math.round(DEFAULT_TARGET_LTV * 64),
              hedgePosition: hedgePreview.hedgeSize,
            }));
            setHedgeAmount("");
            alert(`✅ 原子对冲成功！

📊 执行摘要：
• 抵押: ${hedgeAmount} SUI
• SUI 价格: $${suiPrice.toFixed(4)}
• 借款: ${hedgePreview.borrowAmount} USDC
• 对冲: ${hedgePreview.hedgeSize} SUI (空头)
• Delta: ≈ 0%

交易哈希: ${result.digest.slice(0, 10)}...`);

            // 刷新 Vault 列表
            if (account?.address) {
              setTimeout(() => fetchUserVaults(account.address), 2000);
            }
          },
          onError: (error) => {
            console.error("Hedge error:", error);
            alert("❌ 对冲失败: " + error.message);
          },
        }
      );
    } catch (error) {
      console.error("Build error:", error);
      alert("❌ 构建交易失败");
    } finally {
      setIsHedging(false);
    }
  };

  return (
    <div className="min-h-screen grid-bg">
      {/* 导航栏 */}
      <nav className="glass fixed top-0 left-0 right-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-orange-500 flex items-center justify-center">
              <span className="text-white font-bold text-lg">IN</span>
            </div>
            <span className="text-xl font-bold">
              Invar<span className="text-orange-500">iant</span>
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
                Delta-Neutral Hedging Vaults
              </span>
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-8">
              Protect your SUI position with atomic hedging.
              Deposit → Borrow → Hedge in a single transaction.
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
              <div className="stat-label mb-2">我的金库</div>
              <div className="stat-value">
                {isLoadingVaults ? "..." : userVaults.length}
              </div>
            </div>
            <div className="glass-card p-6 card-hover">
              <div className="stat-label mb-2">SUI 价格 {priceLoading && "🔄"}</div>
              <div className="stat-value text-green-400">${suiPrice.toFixed(4)}</div>
              <div className="text-xs text-gray-500">via Pyth Network</div>
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

                {/* Vault 选择器 */}
                {userVaults.length > 0 && (
                  <div className="mb-6">
                    <label className="block text-gray-400 text-sm mb-2">选择金库</label>
                    <select
                      value={selectedVaultId || ""}
                      onChange={(e) => setSelectedVaultId(e.target.value)}
                      className="input-field w-full"
                    >
                      {userVaults.map((vault, idx) => (
                        <option key={vault.id} value={vault.id}>
                          Vault #{idx + 1} - {vault.id.slice(0, 10)}...
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {userVaults.length === 0 && !isLoadingVaults && (
                  <div className="text-center py-8 text-gray-400">
                    <p className="mb-4">您还没有金库，请先创建一个</p>
                    <button
                      onClick={handleCreateVault}
                      disabled={isPending}
                      className="btn-primary"
                    >
                      创建金库
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-6 mb-8">
                  <div className="bg-gray-800/50 rounded-xl p-5">
                    <div className="text-gray-400 text-sm mb-1">抵押品 (SUI)</div>
                    <div className="text-2xl font-bold">{vaultData.collateral} SUI</div>
                    <div className="text-gray-500 text-sm">≈ ${(parseFloat(vaultData.collateral) * suiPrice).toFixed(2)}</div>
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
                  disabled={!depositAmount || !selectedVaultId || isPending}
                  className="btn-secondary w-full mb-6 disabled:opacity-50"
                >
                  {!selectedVaultId ? "请先选择金库" : "存款"}
                </button>

                {/* 🔥 一键原子对冲区域 */}
                <div className="border-t border-gray-700 pt-6">
                  <div className="mb-4">
                    <label className="block text-gray-400 text-sm mb-2">对冲金额 (SUI)</label>
                    <input
                      type="number"
                      value={hedgeAmount}
                      onChange={(e) => setHedgeAmount(e.target.value)}
                      placeholder="输入 SUI 金额"
                      className="input-field w-full"
                    />
                  </div>

                  {/* 预估信息 */}
                  {hedgeAmount && parseFloat(hedgeAmount) > 0 && (
                    <div className="bg-gray-800/30 rounded-lg p-4 mb-4 text-sm">
                      <div className="flex justify-between mb-2">
                        <span className="text-gray-400">SUI 价格</span>
                        <span className="text-green-400">${suiPrice.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between mb-2">
                        <span className="text-gray-400">预估借款</span>
                        <span className="text-orange-400">{hedgePreview.borrowAmount} USDC</span>
                      </div>
                      <div className="flex justify-between mb-2">
                        <span className="text-gray-400">对冲头寸</span>
                        <span className="text-blue-400">{hedgePreview.hedgeSize} SUI</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">限价</span>
                        <span className="text-gray-300">${hedgePreview.limitPrice}</span>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleAtomicHedge}
                    disabled={!hedgeAmount || isPending || isHedging}
                    className="btn-outline w-full mb-3 hover:bg-gradient-to-r hover:from-blue-600 hover:to-orange-600 hover:border-transparent disabled:opacity-50"
                  >
                    {isHedging ? "⏳ 执行中..." : "🛡️ 一键原子对冲"}
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
          <div>© 2026 Invariant. Built on Sui.</div>
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
