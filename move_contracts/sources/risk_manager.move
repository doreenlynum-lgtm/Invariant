/// Module: risk_manager
/// 风险参数校验模块：LTV 验证、价格预言机偏差检测、紧急暂停机制
/// 
/// 设计原则 (符合 AGENTS.md):
/// - 严格的 failure_modes 处理
/// - 价格预言机偏差检测
/// - 滑点保护

module atomic_quant::risk_manager {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use sui::clock::{Self, Clock};

    // ========================================================================
    // 错误码
    // ========================================================================
    
    /// LTV 超过最大允许值
    const ELTVExceeded: u64 = 100;
    /// 价格置信度过低
    const EPriceConfidenceTooWide: u64 = 101;
    /// 价格过期
    const EPriceStale: u64 = 102;
    /// 滑点超过容忍度
    const ESlippageExceeded: u64 = 103;
    /// 系统暂停中
    const ESystemPaused: u64 = 104;
    /// 未授权操作
    const EUnauthorized: u64 = 105;
    /// 头寸过大
    const EPositionTooLarge: u64 = 106;

    // ========================================================================
    // 常量
    // ========================================================================
    
    /// 基点单位
    const BPS_DENOMINATOR: u64 = 10000;
    /// 默认最大 LTV (64% = 6400 bps)
    const DEFAULT_MAX_LTV_BPS: u64 = 6400;
    /// 默认价格最大有效期 (60秒)
    const DEFAULT_MAX_PRICE_AGE: u64 = 60;
    /// 默认最大价格置信度比率 (1% = 100 bps)
    const DEFAULT_MAX_CONFIDENCE_RATIO_BPS: u64 = 100;
    /// 默认最大滑点 (0.5% = 50 bps)
    const DEFAULT_MAX_SLIPPAGE_BPS: u64 = 50;

    // ========================================================================
    // 对象定义
    // ========================================================================

    /// 风险参数配置对象
    public struct RiskConfig has key, store {
        id: UID,
        /// 最大 LTV (basis points)
        max_ltv_bps: u64,
        /// 价格最大有效期 (秒)
        max_price_age: u64,
        /// 最大价格置信度比率 (basis points)
        max_confidence_ratio_bps: u64,
        /// 最大滑点 (basis points)
        max_slippage_bps: u64,
        /// 最大单笔头寸 (SUI 最小单位)
        max_position_size: u64,
        /// 系统是否暂停
        is_system_paused: bool,
        /// 最后更新时间
        last_updated: u64,
    }

    /// 风险管理员能力
    public struct RiskAdminCap has key, store {
        id: UID,
    }

    /// 价格数据结构 (用于验证)
    public struct PriceData has copy, drop, store {
        /// 价格 (带 expo 的原始值)
        price: u64,
        /// 置信区间
        confidence: u64,
        /// 指数
        expo: u8,
        /// 发布时间戳
        publish_time: u64,
    }

    // ========================================================================
    // 事件
    // ========================================================================

    /// 风险参数更新事件
    public struct RiskConfigUpdatedEvent has copy, drop {
        max_ltv_bps: u64,
        max_price_age: u64,
        max_slippage_bps: u64,
        timestamp: u64,
    }

    /// 风险检查失败事件
    public struct RiskCheckFailedEvent has copy, drop {
        check_type: vector<u8>,
        actual_value: u64,
        threshold: u64,
        timestamp: u64,
    }

    /// 系统暂停事件
    public struct SystemPausedEvent has copy, drop {
        is_paused: bool,
        reason: vector<u8>,
        timestamp: u64,
    }

    // ========================================================================
    // 初始化
    // ========================================================================

    /// 模块初始化 - 创建默认风险配置和管理员能力
    fun init(ctx: &mut TxContext) {
        // 创建管理员能力
        let admin_cap = RiskAdminCap {
            id: object::new(ctx),
        };
        transfer::transfer(admin_cap, tx_context::sender(ctx));

        // 创建共享的风险配置
        let risk_config = RiskConfig {
            id: object::new(ctx),
            max_ltv_bps: DEFAULT_MAX_LTV_BPS,
            max_price_age: DEFAULT_MAX_PRICE_AGE,
            max_confidence_ratio_bps: DEFAULT_MAX_CONFIDENCE_RATIO_BPS,
            max_slippage_bps: DEFAULT_MAX_SLIPPAGE_BPS,
            max_position_size: 1000000000000, // 1000 SUI
            is_system_paused: false,
            last_updated: 0,
        };
        transfer::share_object(risk_config);
    }

    // ========================================================================
    // 核心验证函数
    // ========================================================================

    /// 验证 LTV 是否在安全范围内
    /// 返回 true 表示安全，false 表示风险过高
    public fun validate_ltv(
        config: &RiskConfig,
        collateral_value: u64,
        borrow_value: u64,
        clock: &Clock,
    ): bool {
        // 系统暂停检查
        assert!(!config.is_system_paused, ESystemPaused);

        if (collateral_value == 0) {
            return borrow_value == 0
        };

        let ltv_bps = (borrow_value * BPS_DENOMINATOR) / collateral_value;
        
        if (ltv_bps > config.max_ltv_bps) {
            event::emit(RiskCheckFailedEvent {
                check_type: b"LTV_EXCEEDED",
                actual_value: ltv_bps,
                threshold: config.max_ltv_bps,
                timestamp: clock::timestamp_ms(clock) / 1000,
            });
            return false
        };
        
        true
    }

    /// 严格的 LTV 验证 (失败则 abort)
    public fun assert_ltv_safe(
        config: &RiskConfig,
        collateral_value: u64,
        borrow_value: u64,
        clock: &Clock,
    ) {
        assert!(
            validate_ltv(config, collateral_value, borrow_value, clock),
            ELTVExceeded
        );
    }

    /// 验证价格数据有效性
    public fun validate_price_data(
        config: &RiskConfig,
        price_data: &PriceData,
        clock: &Clock,
    ): bool {
        assert!(!config.is_system_paused, ESystemPaused);

        let now = clock::timestamp_ms(clock) / 1000;
        
        // 检查价格是否过期
        if (now > price_data.publish_time + config.max_price_age) {
            event::emit(RiskCheckFailedEvent {
                check_type: b"PRICE_STALE",
                actual_value: now - price_data.publish_time,
                threshold: config.max_price_age,
                timestamp: now,
            });
            return false
        };

        // 检查置信度
        if (price_data.price > 0) {
            let confidence_ratio = (price_data.confidence * BPS_DENOMINATOR) / price_data.price;
            if (confidence_ratio > config.max_confidence_ratio_bps) {
                event::emit(RiskCheckFailedEvent {
                    check_type: b"PRICE_CONFIDENCE_TOO_WIDE",
                    actual_value: confidence_ratio,
                    threshold: config.max_confidence_ratio_bps,
                    timestamp: now,
                });
                return false
            };
        };

        true
    }

    /// 严格的价格验证 (失败则 abort)
    public fun assert_price_valid(
        config: &RiskConfig,
        price_data: &PriceData,
        clock: &Clock,
    ) {
        let now = clock::timestamp_ms(clock) / 1000;
        
        // 价格过期检查
        assert!(
            now <= price_data.publish_time + config.max_price_age,
            EPriceStale
        );
        
        // 置信度检查
        if (price_data.price > 0) {
            let confidence_ratio = (price_data.confidence * BPS_DENOMINATOR) / price_data.price;
            assert!(
                confidence_ratio <= config.max_confidence_ratio_bps,
                EPriceConfidenceTooWide
            );
        };
    }

    /// 验证滑点
    public fun validate_slippage(
        config: &RiskConfig,
        expected_price: u64,
        actual_price: u64,
        clock: &Clock,
    ): bool {
        assert!(!config.is_system_paused, ESystemPaused);

        if (expected_price == 0) {
            return actual_price == 0
        };

        // 计算滑点 (basis points)
        let slippage_bps = if (actual_price >= expected_price) {
            ((actual_price - expected_price) * BPS_DENOMINATOR) / expected_price
        } else {
            ((expected_price - actual_price) * BPS_DENOMINATOR) / expected_price
        };

        if (slippage_bps > config.max_slippage_bps) {
            event::emit(RiskCheckFailedEvent {
                check_type: b"SLIPPAGE_EXCEEDED",
                actual_value: slippage_bps,
                threshold: config.max_slippage_bps,
                timestamp: clock::timestamp_ms(clock) / 1000,
            });
            return false
        };

        true
    }

    /// 严格的滑点验证 (失败则 abort)
    public fun assert_slippage_acceptable(
        config: &RiskConfig,
        expected_price: u64,
        actual_price: u64,
        clock: &Clock,
    ) {
        assert!(
            validate_slippage(config, expected_price, actual_price, clock),
            ESlippageExceeded
        );
    }

    /// 验证头寸大小
    public fun validate_position_size(
        config: &RiskConfig,
        position_size: u64,
        clock: &Clock,
    ): bool {
        assert!(!config.is_system_paused, ESystemPaused);

        if (position_size > config.max_position_size) {
            event::emit(RiskCheckFailedEvent {
                check_type: b"POSITION_TOO_LARGE",
                actual_value: position_size,
                threshold: config.max_position_size,
                timestamp: clock::timestamp_ms(clock) / 1000,
            });
            return false
        };

        true
    }

    // ========================================================================
    // 管理员函数
    // ========================================================================

    /// 更新风险参数
    public entry fun update_risk_params(
        _admin: &RiskAdminCap,
        config: &mut RiskConfig,
        max_ltv_bps: u64,
        max_price_age: u64,
        max_slippage_bps: u64,
        max_position_size: u64,
        clock: &Clock,
    ) {
        config.max_ltv_bps = max_ltv_bps;
        config.max_price_age = max_price_age;
        config.max_slippage_bps = max_slippage_bps;
        config.max_position_size = max_position_size;
        config.last_updated = clock::timestamp_ms(clock) / 1000;

        event::emit(RiskConfigUpdatedEvent {
            max_ltv_bps,
            max_price_age,
            max_slippage_bps,
            timestamp: config.last_updated,
        });
    }

    /// 紧急暂停系统
    public entry fun emergency_pause(
        _admin: &RiskAdminCap,
        config: &mut RiskConfig,
        reason: vector<u8>,
        clock: &Clock,
    ) {
        config.is_system_paused = true;
        config.last_updated = clock::timestamp_ms(clock) / 1000;

        event::emit(SystemPausedEvent {
            is_paused: true,
            reason,
            timestamp: config.last_updated,
        });
    }

    /// 恢复系统
    public entry fun resume_system(
        _admin: &RiskAdminCap,
        config: &mut RiskConfig,
        clock: &Clock,
    ) {
        config.is_system_paused = false;
        config.last_updated = clock::timestamp_ms(clock) / 1000;

        event::emit(SystemPausedEvent {
            is_paused: false,
            reason: b"RESUMED",
            timestamp: config.last_updated,
        });
    }

    // ========================================================================
    // 视图函数
    // ========================================================================

    /// 获取最大 LTV
    public fun get_max_ltv_bps(config: &RiskConfig): u64 {
        config.max_ltv_bps
    }

    /// 获取价格最大有效期
    public fun get_max_price_age(config: &RiskConfig): u64 {
        config.max_price_age
    }

    /// 获取最大滑点
    public fun get_max_slippage_bps(config: &RiskConfig): u64 {
        config.max_slippage_bps
    }

    /// 检查系统是否暂停
    public fun is_system_paused(config: &RiskConfig): bool {
        config.is_system_paused
    }

    /// 创建价格数据结构 (用于测试和外部调用)
    public fun create_price_data(
        price: u64,
        confidence: u64,
        expo: u8,
        publish_time: u64,
    ): PriceData {
        PriceData {
            price,
            confidence,
            expo,
            publish_time,
        }
    }

    // ========================================================================
    // 测试辅助函数
    // ========================================================================

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }
}
