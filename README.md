# 🛡️ Invariant

[![Sui](https://img.shields.io/badge/Sui-Blockchain-blue)](https://sui.io)
[![Move](https://img.shields.io/badge/Move-Smart%20Contract-green)](https://move-language.github.io/move/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

**High-performance quantitative trading vaults on Sui with on-chain risk management and asset safety.**

---

## 🎯 Problem

Traditional DeFi borrowing exposes users to **price volatility risk**:

- Deposit SUI as collateral → Borrow USDC
- SUI price drops → Position gets **liquidated** 💥
- Users lose their collateral

**Current solutions are fragmented:**
- Users must manually hedge on separate platforms
- Multiple transactions = multiple failure points
- Partial execution risk (deposit succeeds, hedge fails)

---

## 💡 Solution

**Invariant** implements **Delta-Neutral Hedging** in a **single atomic transaction**:

```
┌──────────────────────────────────────────────────────────────┐
│                    ATOMIC TRANSACTION (PTB)                  │
├──────────────┬──────────────┬──────────────┬─────────────────┤
│ 1. Oracle    │ 2. Deposit   │ 3. Borrow    │ 4. Open Short   │
│    Update    │    SUI       │    USDC      │    Position     │
│   (Pyth)     │  (Scallop)   │  (Scallop)   │   (DeepBook)    │
└──────────────┴──────────────┴──────────────┴─────────────────┘

 All 4 operations execute atomically - ALL SUCCEED or ALL FAIL
```

### Financial Logic

```
Δ_Portfolio = Δ_Long_SUI + Δ_Short_SUI ≈ 0 (Delta Neutral)
```

| Position | Asset | Direction | Effect |
|----------|-------|-----------|--------|
| Collateral | SUI | Long +Δ | Gains when SUI ↑ |
| Hedge | SUI | Short -Δ | Gains when SUI ↓ |
| **Net** | - | **≈ 0** | **Protected from price swings** |

---

## 🏗️ Architecture

```
                                 ┌─────────────────────────────┐
                                 │     Frontend (Next.js)      │
                                 │  • Wallet Connect (dApp-kit)│
                                 │  • LTV Dashboard            │
                                 │  • Atomic Hedge UI          │
                                 └─────────────┬───────────────┘
                                               │
                                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SDK (TypeScript)                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ PTBBuilder  │  │ DeepBook    │  │ Oracle      │  │ Config      │        │
│  │ (Atomic TX) │  │ Service     │  │ Service     │  │ Manager     │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────────────┘        │
└─────────┼────────────────┼────────────────┼─────────────────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Sui Blockchain                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ vault.move  │  │risk_manager │  │   Scallop   │  │  DeepBook   │        │
│  │             │  │   .move     │  │  (Lending)  │  │   (CLOB)    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📂 Project Structure

```
sui/
├── move_contracts/           # Sui Move 智能合约
│   ├── sources/
│   │   ├── vault.move        # 金库核心逻辑 (存款/取款/抵押)
│   │   └── risk_manager.move # 风险管理 (LTV/滑点/价格验证)
│   └── Move.toml
│
├── sdk/                      # TypeScript SDK
│   ├── src/
│   │   ├── ptb_builder.ts    # 原子交易构建器 ⭐
│   │   ├── deepbook_service.ts
│   │   ├── oracle_service.ts
│   │   └── config.ts
│   └── tests/                # Vitest 单元测试
│
├── frontend/                 # Next.js 前端
│   └── src/app/
│       ├── page.tsx          # Dashboard + 一键对冲
│       └── globals.css       # Glassmorphism 主题
│
└── README.md
```

---

## ⚡ Quick Start

### Prerequisites

- Node.js 18+
- Sui CLI
- Sui Wallet (Browser Extension)

### 1. Clone & Install

```bash
git clone https://github.com/your-repo/invariant.git
cd invariant

# Install SDK dependencies
cd sdk && npm install

# Install Frontend dependencies  
cd ../frontend && npm install
```

### 2. Run Tests

```bash
# SDK unit tests
cd sdk
npm test

# Move contract tests
cd ../move_contracts
sui move test
```

### 3. Start Frontend

```bash
cd frontend
npm run dev
# Open http://localhost:3000
```

### 4. Connect Wallet & Use

1. Click **Connect Wallet** (Sui Wallet)
2. Click **创建新金库** to create a vault
3. Enter SUI amount and click **一键原子对冲**
4. Approve transaction in wallet

---

## 🔧 Key Features

| Feature | Description |
|---------|-------------|
| **Atomic Hedging** | Deposit + Borrow + Hedge in single TX |
| **Delta Neutral** | Auto-calculated hedge size for zero market exposure |
| **Risk Management** | Configurable LTV, slippage, price age validation |
| **Real-time LTV** | Visual progress bar with warning thresholds |
| **Scallop Integration** | Best lending rates on Sui |
| **DeepBook V3** | Decentralized orderbook for hedge execution |
| **Pyth Oracle** | Real-time price feeds with confidence intervals |

---

## 📊 Risk Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| Max LTV | 64% | Maximum loan-to-value ratio |
| Liquidation Threshold | 80% | LTV at which position can be liquidated |
| Max Slippage | 0.5% | Maximum acceptable slippage on hedge |
| Price Max Age | 60s | Maximum age of price oracle data |

---

## 🚀 Deployed Contracts

### Testnet

| Contract | Address |
|----------|---------|
| Package ID | `0xfdd92ba291151a5328e1d6e1eb80047eb42cb8b0121c221cac5bb083bb37862b` |

[View on SuiScan](https://testnet.suivision.xyz/package/0xfdd92ba291151a5328e1d6e1eb80047eb42cb8b0121c221cac5bb083bb37862b)

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Smart Contracts | **Move** on Sui |
| SDK | **TypeScript** + @mysten/sui |
| Frontend | **Next.js 16** + TailwindCSS |
| Wallet | **Sui dApp Kit** |
| Lending | **Scallop Protocol** |
| DEX | **DeepBook V3** |
| Oracle | **Pyth Network** |
| Testing | **Vitest** + sui move test |

---

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  <b>Built with ❤️ on Sui</b>
</p>
