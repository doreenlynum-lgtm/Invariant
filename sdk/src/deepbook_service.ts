/**
 * DeepBook V3 Integration - 去中心化订单簿对接
 * 实现限价单开仓/平仓，与 PTB Builder 协作
 */

import { Transaction } from "@mysten/sui/transactions";
import type { DeepBookConfig } from "./config.js";
import { DEEPBOOK_CONFIG, COIN_TYPES, type NetworkType } from "./config.js";

// SuiClient type (using any for SDK version compatibility)
type SuiClientLike = {
    getOwnedObjects: (params: any) => Promise<any>;
};

// ============================================================================
// 类型定义
// ============================================================================

/** 订单方向 */
export type OrderSide = "buy" | "sell";

/** 订单类型 */
export type OrderType = "limit" | "market";

/** 限价单参数 */
export interface LimitOrderParams {
    /** 交易池 ID */
    poolId: string;
    /** 方向 (buy/sell) */
    side: OrderSide;
    /** 价格 (归一化后的数值) */
    price: number;
    /** 数量 (SUI 数量，归一化) */
    quantity: number;
    /** 是否为 Post-Only (仅做市) */
    postOnly?: boolean;
    /** 有效期 (毫秒时间戳，0 = GTC) */
    expireTimestamp?: number;
}

/** 订单结果 */
export interface OrderResult {
    /** 订单 ID */
    orderId: string;
    /** 成交价格 */
    filledPrice: number;
    /** 成交数量 */
    filledQuantity: number;
    /** 订单状态 */
    status: "filled" | "partial" | "open" | "cancelled";
}

// ============================================================================
// DeepBook Service
// ============================================================================

export class DeepBookService {
    private config: DeepBookConfig;
    private network: NetworkType;
    private client?: SuiClientLike;
    private accountCapId?: string;

    constructor(network: NetworkType = "mainnet", client?: SuiClientLike) {
        this.config = DEEPBOOK_CONFIG[network];
        this.network = network;
        this.client = client;
    }

    /**
     * 设置 Sui Client (用于查询 AccountCap)
     */
    setClient(client: SuiClientLike): void {
        this.client = client;
    }

    /**
     * 设置 AccountCap ID (外部提供)
     */
    setAccountCapId(accountCapId: string): void {
        this.accountCapId = accountCapId;
    }

    /**
     * 查询用户的 DeepBook AccountCap
     */
    async fetchAccountCap(ownerAddress: string): Promise<string | null> {
        if (!this.client) {
            console.warn("[DeepBookService] No client set, cannot fetch AccountCap");
            return null;
        }

        try {
            const objects = await this.client.getOwnedObjects({
                owner: ownerAddress,
                filter: {
                    StructType: `${this.config.packageId}::clob_v2::AccountCap`
                },
                options: { showContent: true }
            });

            if (objects.data.length > 0 && objects.data[0].data) {
                this.accountCapId = objects.data[0].data.objectId;
                return this.accountCapId ?? null;
            }
        } catch (error) {
            console.warn("[DeepBookService] Failed to fetch AccountCap:", error);
        }

        return null;
    }

    /**
     * 确保 AccountCap 存在 (查询或创建)
     * 返回是否需要在交易中创建新的 AccountCap
     */
    async ensureAccountCap(
        tx: Transaction,
        ownerAddress: string
    ): Promise<{ needsCreation: boolean; accountCapId?: string }> {
        // 如果已经设置，直接返回
        if (this.accountCapId) {
            return { needsCreation: false, accountCapId: this.accountCapId };
        }

        // 尝试从链上查询
        const existingCap = await this.fetchAccountCap(ownerAddress);
        if (existingCap) {
            return { needsCreation: false, accountCapId: existingCap };
        }

        // 需要在交易中创建
        console.log("[DeepBookService] AccountCap not found, adding creation to TX");
        this.addCreateAccount(tx);
        return { needsCreation: true };
    }

    // ==========================================================================
    // PTB 协作函数 (在 Transaction 中添加操作)
    // ==========================================================================

    /**
     * 添加限价卖单到 PTB (对冲开仓)
     * 
     * DeepBook V3 限价单结构:
     * - place_limit_order(pool, price, quantity, is_bid, ...)
     */
    addLimitSellOrder(
        tx: Transaction,
        params: {
            poolId: string;
            price: bigint;         // 价格 (带精度)
            quantity: bigint;      // 数量 (SUI 最小单位)
            baseCoin: any;         // SUI coin 对象
        }
    ): void {
        const { poolId, price, quantity, baseCoin } = params;

        // DeepBook V3 place_limit_order 调用
        // 注意: 这是简化版本，实际需要完整的 Move 调用参数
        tx.moveCall({
            target: `${this.config.packageId}::clob_v2::place_limit_order`,
            typeArguments: [
                COIN_TYPES.SUI,
                this.getQuoteCoinType(),
            ],
            arguments: [
                tx.object(poolId),
                tx.pure.u64(price),      // 价格
                tx.pure.u64(quantity),   // 数量
                tx.pure.bool(false),     // is_bid = false (卖单)
                tx.pure.u64(0),          // expire_timestamp (0 = GTC)
                tx.pure.u8(0),           // restriction (0 = no restriction)
                tx.object("0x6"),        // Clock
                tx.object(this.getAccountCapId()), // AccountCap (需要创建)
            ],
        });
    }

    /**
     * 添加限价买单到 PTB (对冲平仓)
     */
    addLimitBuyOrder(
        tx: Transaction,
        params: {
            poolId: string;
            price: bigint;
            quantity: bigint;
            quoteCoin: any;        // USDC coin 对象
        }
    ): void {
        const { poolId, price, quantity, quoteCoin } = params;

        tx.moveCall({
            target: `${this.config.packageId}::clob_v2::place_limit_order`,
            typeArguments: [
                COIN_TYPES.SUI,
                this.getQuoteCoinType(),
            ],
            arguments: [
                tx.object(poolId),
                tx.pure.u64(price),
                tx.pure.u64(quantity),
                tx.pure.bool(true),      // is_bid = true (买单)
                tx.pure.u64(0),
                tx.pure.u8(0),
                tx.object("0x6"),
                tx.object(this.getAccountCapId()),
            ],
        });
    }

    /**
     * 创建 DeepBook 账户 (用于下单)
     */
    addCreateAccount(tx: Transaction): void {
        tx.moveCall({
            target: `${this.config.packageId}::clob_v2::create_account`,
            typeArguments: [],
            arguments: [
                tx.object("0x6"), // Clock
            ],
        });
    }

    // ==========================================================================
    // 价格转换工具
    // ==========================================================================

    /**
     * 将价格转换为 DeepBook 格式
     * DeepBook V3 使用 float-style 价格: price * 10^priceDecimals
     */
    priceToDeepBookFormat(price: number): bigint {
        return BigInt(Math.floor(price * Math.pow(10, this.config.priceDecimals)));
    }

    /**
     * 将数量转换为 DeepBook 格式
     */
    quantityToDeepBookFormat(quantity: number): bigint {
        return BigInt(Math.floor(quantity * Math.pow(10, this.config.quantityDecimals)));
    }

    /**
     * 从 DeepBook 格式转换价格
     */
    priceFromDeepBookFormat(price: bigint): number {
        return Number(price) / Math.pow(10, this.config.priceDecimals);
    }

    /**
     * 计算对冲限价 (考虑滑点)
     * 
     * 对于卖单 (开空头): limitPrice = marketPrice * (1 - slippage)
     * 对于买单 (平空头): limitPrice = marketPrice * (1 + slippage)
     */
    calculateHedgePrice(
        marketPrice: number,
        side: OrderSide,
        slippageBps: number
    ): number {
        const slippageMultiplier = slippageBps / 10000;

        if (side === "sell") {
            // 卖单: 最低接受价格
            return marketPrice * (1 - slippageMultiplier);
        } else {
            // 买单: 最高愿意支付价格
            return marketPrice * (1 + slippageMultiplier);
        }
    }

    // ==========================================================================
    // 配置获取
    // ==========================================================================

    /** 获取 SUI/USDC 池 ID */
    getSuiUsdcPoolId(): string {
        return this.config.suiUsdcPoolId;
    }

    /** 获取最小订单大小 */
    getMinOrderSize(): bigint {
        return this.config.minOrderSize;
    }

    /** 获取报价币类型 */
    private getQuoteCoinType(): string {
        return COIN_TYPES.USDC[this.network];
    }

    /** 获取 AccountCap ID */
    private getAccountCapId(): string {
        if (this.accountCapId) {
            return this.accountCapId;
        }
        // 如果没有设置，返回占位符（但会在调用前被 ensureAccountCap 处理）
        console.warn("[DeepBookService] AccountCap not set, transaction may fail");
        return "0x...";
    }

    /** 获取已设置的 AccountCap ID (外部使用) */
    getAccountCapIdOrNull(): string | undefined {
        return this.accountCapId;
    }

    // ==========================================================================
    // 验证工具
    // ==========================================================================

    /** 验证订单参数 */
    validateOrderParams(quantity: bigint, price: bigint): void {
        if (quantity < this.config.minOrderSize) {
            throw new Error(
                `Order quantity ${quantity} below minimum ${this.config.minOrderSize}`
            );
        }
        if (price <= 0n) {
            throw new Error("Price must be positive");
        }
    }

    /** 检查服务是否可用 (配置有效) */
    isAvailable(): boolean {
        return (
            this.config.suiUsdcPoolId.length > 10 &&
            this.config.suiUsdcPoolId !== "0x..."
        );
    }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 创建 DeepBook Service 实例
 */
export function createDeepBookService(
    network: NetworkType = "mainnet"
): DeepBookService {
    return new DeepBookService(network);
}

/**
 * 计算完整对冲参数
 * 
 * 输入: 借款金额 (USDC)、当前价格、滑点
 * 输出: 对冲头寸大小、限价
 */
export function calculateHedgeOrderParams(
    borrowAmountUsdc: number,
    currentPrice: number,
    slippageBps: number = 50
): {
    hedgeSize: number;
    limitPrice: number;
    side: OrderSide;
} {
    // 对冲大小 = 借款金额 / 当前价格
    const hedgeSize = borrowAmountUsdc / currentPrice;

    // 限价 (考虑滑点，卖单价格略低于市场价)
    const limitPrice = currentPrice * (1 - slippageBps / 10000);

    return {
        hedgeSize,
        limitPrice,
        side: "sell", // 开空头 = 卖出
    };
}
