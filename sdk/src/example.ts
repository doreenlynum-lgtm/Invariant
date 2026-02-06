/**
 * Example: Atomic Hedge PTB Construction
 * 演示如何构建原子化对冲交易
 */

import { createPTBBuilder, type AtomicHedgeParams } from "./index.js";

async function main() {
    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║           Sui-AtomicQuant PTB Builder Demo                   ║");
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    // =========================================================================
    // 金融逻辑伪代码推演 (符合 AGENTS.md: Logic First)
    // =========================================================================
    console.log("📊 Financial Logic Derivation:");
    console.log("─".repeat(60));
    console.log(`
  Given:
    - Deposit: 100 SUI
    - Current Price: $3.50/SUI
    - Target LTV: 80% of max (conservative)
    - Slippage Tolerance: 0.5%

  Step 1: DEPOSIT to Scallop (Collateral)
    └─ Delta_Long = +100 SUI

  Step 2: BORROW USDC
    └─ Borrow Amount = 100 * $3.50 * 0.8 = $280 USDC

  Step 3: OPEN SHORT on DeepBook
    └─ Hedge Size = $280 / $3.50 = 80 SUI
    └─ Delta_Short = -80 SUI

  Result:
    └─ Delta_Portfolio = +100 - 80 = +20 SUI (partially hedged)
    └─ Note: Full hedge requires 100% LTV (not safe)
`);
    console.log("─".repeat(60) + "\n");

    // =========================================================================
    // PTB Construction
    // =========================================================================
    console.log("🔧 Initializing PTB Builder...\n");

    try {
        const ptbBuilder = await createPTBBuilder("mainnet");

        const hedgeParams: AtomicHedgeParams = {
            suiAmount: BigInt(100 * 10 ** 9), // 100 SUI in MIST
            targetLTV: 0.64, // 80% of Scallop's max 80% LTV
            slippageTolerance: 0.005, // 0.5%
            priceDeviationThreshold: 0.02, // 2%
        };

        console.log("📝 Building atomic hedge PTB...\n");

        // 注意: 实际使用需要真实的 coin ID 和 obligation ID
        const tx = await ptbBuilder.buildAtomicHedgePTB(
            hedgeParams,
            "0x...sender_address...", // 替换为实际地址
            "0x...sui_coin_id...",    // 替换为实际 SUI coin object ID
            "0x...obligation_id..."   // 替换为 Scallop obligation ID
        );

        // 检查 PTB 结构
        await ptbBuilder.inspectPTB(tx);

        console.log("\n✅ PTB construction successful!");
        console.log("   Next: Sign and execute with sui.signAndExecuteTransaction()");

    } catch (error) {
        console.error("❌ Error:", error);
    }
}

main().catch(console.error);
