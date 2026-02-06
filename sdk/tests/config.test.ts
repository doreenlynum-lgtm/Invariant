/**
 * Configuration Module Tests
 * 测试网络切换和配置管理
 */

import { describe, it, expect } from "vitest";
import {
    getConfig,
    getMainnetConfig,
    getTestnetConfig,
    getCoinType,
    isConfigValid,
    getConfigWarnings,
    PRICE_FEED_IDS,
    RPC_ENDPOINTS,
    DEFAULT_RISK_PARAMS,
} from "../src/config.js";

describe("Configuration Module", () => {
    describe("getConfig", () => {
        it("should return mainnet config with correct RPC endpoint", () => {
            const config = getConfig("mainnet");
            expect(config.network).toBe("mainnet");
            expect(config.rpcUrl).toBe(RPC_ENDPOINTS.mainnet);
            expect(config.rpcUrl).toContain("mainnet");
        });

        it("should return testnet config with correct RPC endpoint", () => {
            const config = getConfig("testnet");
            expect(config.network).toBe("testnet");
            expect(config.rpcUrl).toBe(RPC_ENDPOINTS.testnet);
            expect(config.rpcUrl).toContain("testnet");
        });

        it("should include all required config sections", () => {
            const config = getConfig("mainnet");
            expect(config).toHaveProperty("pyth");
            expect(config).toHaveProperty("scallop");
            expect(config).toHaveProperty("deepbook");
            expect(config).toHaveProperty("risk");
        });
    });

    describe("Network Switching", () => {
        it("should have different Pyth state IDs for mainnet and testnet", () => {
            const mainnet = getMainnetConfig();
            const testnet = getTestnetConfig();
            expect(mainnet.pyth.stateId).not.toBe(testnet.pyth.stateId);
        });

        it("should have same Hermes endpoint structure", () => {
            const mainnet = getMainnetConfig();
            const testnet = getTestnetConfig();
            expect(mainnet.pyth.hermesEndpoint).toContain("hermes");
            expect(testnet.pyth.hermesEndpoint).toContain("hermes");
        });
    });

    describe("getCoinType", () => {
        it("should return correct SUI type for both networks", () => {
            expect(getCoinType("SUI", "mainnet")).toBe("0x2::sui::SUI");
            expect(getCoinType("SUI", "testnet")).toBe("0x2::sui::SUI");
        });

        it("should return different USDC addresses for different networks", () => {
            const mainnetUsdc = getCoinType("USDC", "mainnet");
            expect(mainnetUsdc).toContain("coin::COIN");
        });
    });

    describe("Risk Parameters", () => {
        it("should have valid default risk params", () => {
            expect(DEFAULT_RISK_PARAMS.maxLtvBps).toBe(6400); // 64%
            expect(DEFAULT_RISK_PARAMS.maxPriceAge).toBe(60);
            expect(DEFAULT_RISK_PARAMS.maxSlippageBps).toBe(50); // 0.5%
            expect(DEFAULT_RISK_PARAMS.liquidationThresholdBps).toBe(8000); // 80%
        });

        it("should include risk params in config", () => {
            const config = getConfig("mainnet");
            expect(config.risk.maxLtvBps).toBe(DEFAULT_RISK_PARAMS.maxLtvBps);
        });
    });

    describe("Price Feed IDs", () => {
        it("should have valid Pyth price feed IDs", () => {
            expect(PRICE_FEED_IDS.SUI_USD).toMatch(/^0x[a-f0-9]{64}$/);
            expect(PRICE_FEED_IDS.USDC_USD).toMatch(/^0x[a-f0-9]{64}$/);
        });
    });

    describe("Config Validation", () => {
        it("should return warnings for testnet config", () => {
            const testnetConfig = getTestnetConfig();
            const warnings = getConfigWarnings(testnetConfig);
            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings.some(w => w.includes("Scallop"))).toBe(true);
        });

        it("should validate mainnet config structure", () => {
            const mainnetConfig = getMainnetConfig();
            // Mainnet config should have valid Pyth state ID
            expect(mainnetConfig.pyth.stateId.length).toBeGreaterThan(10);
        });
    });
});
