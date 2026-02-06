/**
 * Sui-AtomicQuant SDK
 * 金融原子化对冲工具包
 */

// 核心模块
export { PTBBuilder, createPTBBuilder } from "./ptb_builder.js";
export type { AtomicHedgeParams, HedgeCalculation, PTBBuilderConfig } from "./ptb_builder.js";

// 预言机服务
export { OracleService } from "./oracle_service.js";
export type { PriceData, OracleConfig } from "./oracle_service.js";
export { MAINNET_ORACLE_CONFIG } from "./oracle_service.js";

// DeepBook 服务
export { DeepBookService, createDeepBookService, calculateHedgeOrderParams } from "./deepbook_service.js";
export type { LimitOrderParams, OrderResult, OrderSide, OrderType } from "./deepbook_service.js";

// 配置管理
export {
    getConfig,
    getMainnetConfig,
    getTestnetConfig,
    getCoinType,
    isConfigValid,
    getConfigWarnings,
    PRICE_FEED_IDS,
    RPC_ENDPOINTS,
    PYTH_CONFIG,
    SCALLOP_CONFIG,
    DEEPBOOK_CONFIG,
    COIN_TYPES,
    DEFAULT_RISK_PARAMS,
} from "./config.js";
export type {
    NetworkType,
    AtomicQuantConfig,
    PythConfig,
    ScallopConfig,
    DeepBookConfig,
    RiskParams,
} from "./config.js";
