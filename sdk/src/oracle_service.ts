/**
 * Oracle Service - Pyth Network Integration
 * 接入 Pyth 价格预言机，提供实时价格和置信度验证
 */

import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import type { Transaction } from "@mysten/sui/transactions";
import { SuiPythClient, SuiPriceServiceConnection } from "@pythnetwork/pyth-sui-js";

// Pyth Price Feed IDs (Mainnet)
export const PRICE_FEED_IDS = {
    SUI_USD: "0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744",
    USDC_USD: "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
} as const;

// Hermes endpoint for price updates
const HERMES_ENDPOINT = "https://hermes.pyth.network";

export interface PriceData {
    price: number;           // 价格 (已归一化)
    confidence: number;      // 置信区间
    publishTime: number;     // 发布时间戳
    expo: number;            // 指数
}

export interface OracleConfig {
    pythStateId: string;
    wormholeStateId: string;
    maxPriceAge: number;              // 价格最大有效期 (秒)
    maxConfidenceRatio: number;       // 最大置信度/价格比率
}

// Mainnet 配置
export const MAINNET_ORACLE_CONFIG: OracleConfig = {
    pythStateId: "0x1f9310238ee9298fb703c3419030b35b22bb1cc37113e3bb5007c99aec79e5b8",
    wormholeStateId: "0xaeab97f96cf9877fee2883315d459552b2b921edc16d7ceac6eab944dd88919c",
    maxPriceAge: 60,           // 60秒内有效
    maxConfidenceRatio: 0.01,  // 置信度不超过价格的1%
};

export class OracleService {
    private pythClient: SuiPythClient;
    private priceService: SuiPriceServiceConnection;
    private config: OracleConfig;

    constructor(
        suiClient: SuiJsonRpcClient,
        config: OracleConfig = MAINNET_ORACLE_CONFIG
    ) {
        this.config = config;
        this.pythClient = new SuiPythClient(
            suiClient as any, // 类型适配 - Pyth SDK 使用旧版 SuiClient
            config.pythStateId,
            config.wormholeStateId
        );
        this.priceService = new SuiPriceServiceConnection(HERMES_ENDPOINT);
    }

    /**
     * 获取价格更新数据 (用于 PTB)
     */
    async getPriceUpdateData(priceFeedIds: string[]): Promise<Buffer[]> {
        const priceUpdateData = await this.priceService.getPriceFeedsUpdateData(priceFeedIds);
        return priceUpdateData;
    }

    /**
     * 获取当前价格 (通过 HermesClient 的 getLatestPriceFeeds)
     */
    async getCurrentPrice(priceFeedId: string): Promise<PriceData> {
        // SuiPriceServiceConnection 继承自 HermesClient
        // 使用 HermesClient 的 getLatestPriceFeeds 方法
        const priceFeeds = await (this.priceService as any).getLatestPriceFeeds([priceFeedId]);

        if (!priceFeeds || priceFeeds.length === 0) {
            throw new Error(`No price feed found for ${priceFeedId}`);
        }

        const priceFeed = priceFeeds[0];
        const priceObj = priceFeed.getPriceNoOlderThan?.(this.config.maxPriceAge)
            ?? priceFeed.price;

        if (!priceObj) {
            throw new Error(`Price data is stale for ${priceFeedId}`);
        }

        const price = OracleService.normalizePythPrice(BigInt(priceObj.price), priceObj.expo);
        const confidence = OracleService.normalizePythPrice(BigInt(priceObj.conf), priceObj.expo);

        return {
            price,
            confidence,
            publishTime: priceObj.publishTime ?? Math.floor(Date.now() / 1000),
            expo: priceObj.expo,
        };
    }

    /**
     * 将价格更新添加到交易块中
     */
    async addPriceUpdateToTx(
        tx: Transaction,
        priceFeedIds: string[]
    ): Promise<void> {
        const priceUpdateData = await this.getPriceUpdateData(priceFeedIds);
        await this.pythClient.updatePriceFeeds(tx as any, priceUpdateData, priceFeedIds);
    }

    /**
     * 验证价格数据有效性
     */
    validatePriceData(priceData: PriceData): void {
        const now = Math.floor(Date.now() / 1000);
        const age = now - priceData.publishTime;

        // 检查价格过期
        if (age > this.config.maxPriceAge) {
            throw new Error(
                `Price data is stale: ${age}s old (max: ${this.config.maxPriceAge}s)`
            );
        }

        // 检查置信度偏差
        const confidenceRatio = priceData.confidence / priceData.price;
        if (confidenceRatio > this.config.maxConfidenceRatio) {
            throw new Error(
                `Price confidence too wide: ${(confidenceRatio * 100).toFixed(2)}% (max: ${this.config.maxConfidenceRatio * 100}%)`
            );
        }
    }

    /**
     * 解析 Pyth 价格为归一化数值
     */
    static normalizePythPrice(price: bigint, expo: number): number {
        return Number(price) * Math.pow(10, expo);
    }
}
