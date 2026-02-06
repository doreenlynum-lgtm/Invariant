/**
 * Configuration Management - 网络切换与协议地址管理
 * 支持 mainnet/testnet 切换，统一管理所有协议地址
 */

// ============================================================================
// 已部署合约地址
// ============================================================================

/** Testnet 部署的包地址 */
export const TESTNET_PACKAGE_ID = "0xfdd92ba291151a5328e1d6e1eb80047eb42cb8b0121c221cac5bb083bb37862b";

/** Mainnet 部署的包地址 (待部署) */
export const MAINNET_PACKAGE_ID = "0x...";


// ============================================================================
// 网络类型
// ============================================================================

export type NetworkType = "mainnet" | "testnet";

// ============================================================================
// RPC 端点
// ============================================================================

export const RPC_ENDPOINTS = {
    mainnet: "https://fullnode.mainnet.sui.io:443",
    testnet: "https://fullnode.testnet.sui.io:443",
} as const;

// ============================================================================
// Pyth Oracle 配置
// ============================================================================

export interface PythConfig {
    stateId: string;
    wormholeStateId: string;
    hermesEndpoint: string;
}

export const PYTH_CONFIG: Record<NetworkType, PythConfig> = {
    mainnet: {
        stateId: "0x1f9310238ee9298fb703c3419030b35b22bb1cc37113e3bb5007c99aec79e5b8",
        wormholeStateId: "0xaeab97f96cf9877fee2883315d459552b2b921edc16d7ceac6eab944dd88919c",
        hermesEndpoint: "https://hermes.pyth.network",
    },
    testnet: {
        stateId: "0x2c0f6f2a83b38a0e6ead4f48f0f1bcb9d5c6d8f1c3e5a7b9d0e2f4a6b8c0d2e4", // Placeholder
        wormholeStateId: "0x3d1e7f3a94c49b1e7b5f2c4d6e8f0a2b4c6d8e0f2a4b6c8d0e2f4a6b8c0d2e4f", // Placeholder
        hermesEndpoint: "https://hermes-beta.pyth.network",
    },
};

// ============================================================================
// Pyth Price Feed IDs (跨网络通用)
// ============================================================================

export const PRICE_FEED_IDS = {
    /** SUI/USD 价格 */
    SUI_USD: "0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744",
    /** USDC/USD 价格 */
    USDC_USD: "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
    /** ETH/USD 价格 */
    ETH_USD: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
    /** BTC/USD 价格 */
    BTC_USD: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
} as const;

// ============================================================================
// Scallop 配置
// ============================================================================

export interface ScallopConfig {
    addressId: string;
    marketId: string;
}

export const SCALLOP_CONFIG: Record<NetworkType, ScallopConfig> = {
    mainnet: {
        addressId: "67c44a103fe1b8c454eb9699",
        marketId: "0x...", // 填入实际市场 ID
    },
    testnet: {
        // Scallop 目前仅支持 mainnet
        // Testnet 需要使用 mock 服务
        addressId: "testnet-placeholder",
        marketId: "testnet-placeholder",
    },
};

// ============================================================================
// DeepBook V3 配置
// ============================================================================

export interface DeepBookConfig {
    /** SUI/USDC 交易池 ID */
    suiUsdcPoolId: string;
    /** 包 ID */
    packageId: string;
    /** 最小订单大小 (SUI 最小单位) */
    minOrderSize: bigint;
    /** 价格精度 */
    priceDecimals: number;
    /** 数量精度 */
    quantityDecimals: number;
}

export const DEEPBOOK_CONFIG: Record<NetworkType, DeepBookConfig> = {
    mainnet: {
        suiUsdcPoolId: "0x...", // 实际 Pool ID (需要从链上查询)
        packageId: "0xdee9",    // DeepBook V3 官方包
        minOrderSize: 1000000000n, // 1 SUI
        priceDecimals: 9,
        quantityDecimals: 9,
    },
    testnet: {
        suiUsdcPoolId: "0x...", // Testnet Pool ID
        packageId: "0xdee9",
        minOrderSize: 100000000n, // 0.1 SUI (testnet 允许更小)
        priceDecimals: 9,
        quantityDecimals: 9,
    },
};

// ============================================================================
// Coin 类型定义
// ============================================================================

export const COIN_TYPES = {
    SUI: "0x2::sui::SUI",
    USDC: {
        mainnet: "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
        testnet: "0x...", // Testnet USDC 地址
    },
    USDT: {
        mainnet: "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN",
        testnet: "0x...",
    },
} as const;

// ============================================================================
// 风险参数默认值
// ============================================================================

export interface RiskParams {
    /** 最大 LTV (basis points, 6400 = 64%) */
    maxLtvBps: number;
    /** 价格最大有效期 (秒) */
    maxPriceAge: number;
    /** 最大价格置信度比率 (basis points, 100 = 1%) */
    maxConfidenceRatioBps: number;
    /** 最大滑点 (basis points, 50 = 0.5%) */
    maxSlippageBps: number;
    /** 清算阈值 (basis points, 8000 = 80%) */
    liquidationThresholdBps: number;
}

export const DEFAULT_RISK_PARAMS: RiskParams = {
    maxLtvBps: 6400,           // 64%
    maxPriceAge: 60,           // 60 seconds
    maxConfidenceRatioBps: 100, // 1%
    maxSlippageBps: 50,        // 0.5%
    liquidationThresholdBps: 8000, // 80%
};

// ============================================================================
// 统一配置对象
// ============================================================================

export interface AtomicQuantConfig {
    network: NetworkType;
    rpcUrl: string;
    pyth: PythConfig;
    scallop: ScallopConfig;
    deepbook: DeepBookConfig;
    risk: RiskParams;
}

/**
 * 获取指定网络的完整配置
 */
export function getConfig(network: NetworkType): AtomicQuantConfig {
    return {
        network,
        rpcUrl: RPC_ENDPOINTS[network],
        pyth: PYTH_CONFIG[network],
        scallop: SCALLOP_CONFIG[network],
        deepbook: DEEPBOOK_CONFIG[network],
        risk: DEFAULT_RISK_PARAMS,
    };
}

/**
 * 获取 Mainnet 配置
 */
export function getMainnetConfig(): AtomicQuantConfig {
    return getConfig("mainnet");
}

/**
 * 获取 Testnet 配置
 */
export function getTestnetConfig(): AtomicQuantConfig {
    return getConfig("testnet");
}

/**
 * 获取 Coin 类型地址
 */
export function getCoinType(
    coin: "SUI" | "USDC" | "USDT",
    network: NetworkType
): string {
    if (coin === "SUI") {
        return COIN_TYPES.SUI;
    }
    return COIN_TYPES[coin][network];
}

// ============================================================================
// 配置验证
// ============================================================================

/**
 * 检查配置是否有效 (非占位符)
 */
export function isConfigValid(config: AtomicQuantConfig): boolean {
    const checks = [
        config.pyth.stateId.length > 10,
        config.scallop.addressId !== "testnet-placeholder",
        config.deepbook.suiUsdcPoolId.length > 10,
    ];
    return checks.every(Boolean);
}

/**
 * 获取配置警告信息
 */
export function getConfigWarnings(config: AtomicQuantConfig): string[] {
    const warnings: string[] = [];

    if (config.network === "testnet") {
        warnings.push("Scallop SDK 仅支持 mainnet，testnet 需要 mock 服务");
        warnings.push("DeepBook Pool ID 可能需要更新");
    }

    if (config.deepbook.suiUsdcPoolId === "0x...") {
        warnings.push("DeepBook Pool ID 未配置，需要从链上查询");
    }

    return warnings;
}
