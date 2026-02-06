/**
 * DeepBook Service Tests
 * 测试对冲参数计算和价格转换
 */

import { describe, it, expect } from "vitest";
import {
    DeepBookService,
    createDeepBookService,
    calculateHedgeOrderParams,
} from "../src/deepbook_service.js";

describe("DeepBook Service", () => {
    describe("createDeepBookService", () => {
        it("should create service for mainnet", () => {
            const service = createDeepBookService("mainnet");
            expect(service).toBeInstanceOf(DeepBookService);
        });

        it("should create service for testnet", () => {
            const service = createDeepBookService("testnet");
            expect(service).toBeInstanceOf(DeepBookService);
        });
    });

    describe("Price Conversion", () => {
        it("should convert price to DeepBook format", () => {
            const service = createDeepBookService("mainnet");
            const price = 3.50; // $3.50
            const dbPrice = service.priceToDeepBookFormat(price);
            expect(dbPrice).toBe(3500000000n); // 3.5 * 10^9
        });

        it("should convert quantity to DeepBook format", () => {
            const service = createDeepBookService("mainnet");
            const quantity = 100; // 100 SUI
            const dbQuantity = service.quantityToDeepBookFormat(quantity);
            expect(dbQuantity).toBe(100000000000n); // 100 * 10^9
        });

        it("should convert back from DeepBook format", () => {
            const service = createDeepBookService("mainnet");
            const dbPrice = 3500000000n;
            const price = service.priceFromDeepBookFormat(dbPrice);
            expect(price).toBe(3.5);
        });

        it("should handle decimal prices correctly", () => {
            const service = createDeepBookService("mainnet");
            const price = 3.456789;
            const dbPrice = service.priceToDeepBookFormat(price);
            const backPrice = service.priceFromDeepBookFormat(dbPrice);
            expect(backPrice).toBeCloseTo(price, 6);
        });
    });

    describe("Hedge Price Calculation", () => {
        it("should calculate sell price with slippage (lower)", () => {
            const service = createDeepBookService("mainnet");
            const marketPrice = 3.50;
            const slippageBps = 50; // 0.5%

            const hedgePrice = service.calculateHedgePrice(marketPrice, "sell", slippageBps);
            expect(hedgePrice).toBe(3.50 * (1 - 0.005)); // 3.4825
            expect(hedgePrice).toBeLessThan(marketPrice);
        });

        it("should calculate buy price with slippage (higher)", () => {
            const service = createDeepBookService("mainnet");
            const marketPrice = 3.50;
            const slippageBps = 50; // 0.5%

            const hedgePrice = service.calculateHedgePrice(marketPrice, "buy", slippageBps);
            expect(hedgePrice).toBe(3.50 * (1 + 0.005)); // 3.5175
            expect(hedgePrice).toBeGreaterThan(marketPrice);
        });
    });

    describe("Order Validation", () => {
        it("should reject orders below minimum size", () => {
            const service = createDeepBookService("mainnet");
            const minSize = service.getMinOrderSize();

            expect(() => {
                service.validateOrderParams(minSize - 1n, 1000000000n);
            }).toThrow();
        });

        it("should accept orders at or above minimum size", () => {
            const service = createDeepBookService("mainnet");
            const minSize = service.getMinOrderSize();

            expect(() => {
                service.validateOrderParams(minSize, 1000000000n);
            }).not.toThrow();
        });

        it("should reject zero or negative price", () => {
            const service = createDeepBookService("mainnet");
            const minSize = service.getMinOrderSize();

            expect(() => {
                service.validateOrderParams(minSize, 0n);
            }).toThrow();
        });
    });

    describe("Service Availability", () => {
        it("should report unavailable when pool ID not configured", () => {
            const service = createDeepBookService("mainnet");
            // Current config has placeholder "0x..."
            expect(service.isAvailable()).toBe(false);
        });
    });
});

describe("calculateHedgeOrderParams", () => {
    it("should calculate hedge size correctly", () => {
        const borrowAmountUsdc = 350; // $350 borrowed
        const currentPrice = 3.50; // $3.50 per SUI

        const params = calculateHedgeOrderParams(borrowAmountUsdc, currentPrice);

        expect(params.hedgeSize).toBe(100); // 350 / 3.5 = 100 SUI
        expect(params.side).toBe("sell"); // Short = sell
    });

    it("should apply slippage to limit price", () => {
        const borrowAmountUsdc = 350;
        const currentPrice = 3.50;
        const slippageBps = 50; // 0.5%

        const params = calculateHedgeOrderParams(borrowAmountUsdc, currentPrice, slippageBps);

        const expectedLimitPrice = 3.50 * (1 - 0.005); // 3.4825
        expect(params.limitPrice).toBeCloseTo(expectedLimitPrice, 4);
    });

    it("should handle different price levels", () => {
        const testCases = [
            { borrow: 1000, price: 5.00, expectedSize: 200 },
            { borrow: 500, price: 2.50, expectedSize: 200 },
            { borrow: 175, price: 3.50, expectedSize: 50 },
        ];

        testCases.forEach(({ borrow, price, expectedSize }) => {
            const params = calculateHedgeOrderParams(borrow, price);
            expect(params.hedgeSize).toBeCloseTo(expectedSize, 2);
        });
    });
});
