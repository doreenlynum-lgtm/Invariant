/// Module: vault
/// 金库核心逻辑：处理资产锁定、对象授权与头寸管理
/// 
/// 设计原则 (符合 AGENTS.md):
/// - Sui Native: 使用 Object-centric 模型
/// - 严格的失败模式处理
/// - 与 PTB Builder 配合实现原子化操作

module atomic_quant::vault {
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::sui::SUI;
    use sui::event;
    use sui::clock::{Self, Clock};

    // ========================================================================
    // 错误码
    // ========================================================================
    
    /// 存款金额必须大于零
    const EDepositAmountZero: u64 = 1;
    /// 取款金额超过可用余额
    const EInsufficientBalance: u64 = 2;
    /// 未授权操作
    const EUnauthorized: u64 = 3;
    /// 金库已暂停
    const EVaultPaused: u64 = 4;
    /// LTV 超过安全阈值
    const ELTVExceeded: u64 = 5;
    /// 价格过期
    const EPriceStale: u64 = 6;

    // ========================================================================
    // 常量
    // ========================================================================
    
    /// 最大 LTV (80% 的 80% = 64%)
    const MAX_LTV_BPS: u64 = 6400; // 64% in basis points
    /// 基点单位
    const BPS_DENOMINATOR: u64 = 10000;
    /// 价格最大有效期 (秒)
    const MAX_PRICE_AGE_SECONDS: u64 = 60;

    // ========================================================================
    // 对象定义
    // ========================================================================

    /// 金库对象 - 存储用户资产和头寸信息
    public struct Vault has key, store {
        id: UID,
        /// 所有者地址
        owner: address,
        /// SUI 抵押品余额
        collateral_balance: Balance<SUI>,
        /// 借款金额 (USDC, 6位小数表示)
        borrowed_amount: u64,
        /// 对冲头寸大小 (SUI 数量)
        hedge_position_size: u64,
        /// 创建时间戳
        created_at: u64,
        /// 最后更新时间戳
        last_updated: u64,
        /// 是否暂停
        is_paused: bool,
    }

    /// 金库管理员能力 (AdminCap)
    public struct VaultAdminCap has key, store {
        id: UID,
    }

    /// 金库收据 - 用于追踪存款
    public struct VaultReceipt has key, store {
        id: UID,
        vault_id: ID,
        deposited_amount: u64,
        timestamp: u64,
    }

    // ========================================================================
    // 事件
    // ========================================================================

    /// 存款事件
    public struct DepositEvent has copy, drop {
        vault_id: ID,
        depositor: address,
        amount: u64,
        timestamp: u64,
    }

    /// 取款事件
    public struct WithdrawEvent has copy, drop {
        vault_id: ID,
        withdrawer: address,
        amount: u64,
        timestamp: u64,
    }

    /// 借款事件
    public struct BorrowEvent has copy, drop {
        vault_id: ID,
        borrower: address,
        amount: u64,
        ltv_bps: u64,
        timestamp: u64,
    }

    /// 对冲头寸事件
    public struct HedgePositionEvent has copy, drop {
        vault_id: ID,
        position_size: u64,
        is_open: bool,
        timestamp: u64,
    }

    // ========================================================================
    // 初始化
    // ========================================================================

    /// 模块初始化 - 创建管理员能力
    fun init(ctx: &mut TxContext) {
        let admin_cap = VaultAdminCap {
            id: object::new(ctx),
        };
        transfer::transfer(admin_cap, tx_context::sender(ctx));
    }

    // ========================================================================
    // 入口函数 (Entry Functions)
    // ========================================================================

    /// 创建新金库
    public entry fun create_vault(
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let now = clock::timestamp_ms(clock) / 1000;
        let vault = Vault {
            id: object::new(ctx),
            owner: tx_context::sender(ctx),
            collateral_balance: balance::zero(),
            borrowed_amount: 0,
            hedge_position_size: 0,
            created_at: now,
            last_updated: now,
            is_paused: false,
        };
        transfer::share_object(vault);
    }

    /// 存入 SUI 抵押品
    public entry fun deposit(
        vault: &mut Vault,
        coin: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        // 验证
        assert!(!vault.is_paused, EVaultPaused);
        let amount = coin::value(&coin);
        assert!(amount > 0, EDepositAmountZero);

        // 存入
        let coin_balance = coin::into_balance(coin);
        balance::join(&mut vault.collateral_balance, coin_balance);
        
        // 更新时间戳
        vault.last_updated = clock::timestamp_ms(clock) / 1000;

        // 发出事件
        event::emit(DepositEvent {
            vault_id: object::uid_to_inner(&vault.id),
            depositor: tx_context::sender(ctx),
            amount,
            timestamp: vault.last_updated,
        });
    }

    /// 取出 SUI 抵押品 (需要检查健康因子)
    public entry fun withdraw(
        vault: &mut Vault,
        amount: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        // 验证所有者
        assert!(vault.owner == tx_context::sender(ctx), EUnauthorized);
        assert!(!vault.is_paused, EVaultPaused);
        
        // 检查余额
        let available = balance::value(&vault.collateral_balance);
        assert!(amount <= available, EInsufficientBalance);
        
        // 检查取款后 LTV 是否仍安全
        let remaining = available - amount;
        if (vault.borrowed_amount > 0) {
            // 简化的 LTV 检查 (需要价格预言机)
            // 实际实现中应该使用 risk_manager 模块
            assert!(remaining > 0, ELTVExceeded);
        };

        // 取出
        let withdrawn = balance::split(&mut vault.collateral_balance, amount);
        let coin = coin::from_balance(withdrawn, ctx);
        transfer::public_transfer(coin, tx_context::sender(ctx));

        // 更新时间戳
        vault.last_updated = clock::timestamp_ms(clock) / 1000;

        // 发出事件
        event::emit(WithdrawEvent {
            vault_id: object::uid_to_inner(&vault.id),
            withdrawer: tx_context::sender(ctx),
            amount,
            timestamp: vault.last_updated,
        });
    }

    // ========================================================================
    // PTB 协作函数 (供 PTB Builder 调用)
    // ========================================================================

    /// 记录借款 (由 PTB 在 Scallop 借款后调用)
    public fun record_borrow(
        vault: &mut Vault,
        amount: u64,
        clock: &Clock,
        ctx: &TxContext
    ) {
        assert!(vault.owner == tx_context::sender(ctx), EUnauthorized);
        assert!(!vault.is_paused, EVaultPaused);
        
        // 计算 LTV
        let collateral_value = balance::value(&vault.collateral_balance);
        // 简化: 假设 1 SUI = 1 USD (实际需要预言机)
        let ltv_bps = if (collateral_value > 0) {
            (amount * BPS_DENOMINATOR) / collateral_value
        } else {
            BPS_DENOMINATOR // 100% if no collateral
        };
        assert!(ltv_bps <= MAX_LTV_BPS, ELTVExceeded);

        vault.borrowed_amount = vault.borrowed_amount + amount;
        vault.last_updated = clock::timestamp_ms(clock) / 1000;

        event::emit(BorrowEvent {
            vault_id: object::uid_to_inner(&vault.id),
            borrower: tx_context::sender(ctx),
            amount,
            ltv_bps,
            timestamp: vault.last_updated,
        });
    }

    /// 记录对冲头寸 (由 PTB 在 DeepBook 开仓后调用)
    public fun record_hedge_position(
        vault: &mut Vault,
        position_size: u64,
        is_open: bool,
        clock: &Clock,
        ctx: &TxContext
    ) {
        assert!(vault.owner == tx_context::sender(ctx), EUnauthorized);
        assert!(!vault.is_paused, EVaultPaused);

        if (is_open) {
            vault.hedge_position_size = vault.hedge_position_size + position_size;
        } else {
            vault.hedge_position_size = if (vault.hedge_position_size >= position_size) {
                vault.hedge_position_size - position_size
            } else {
                0
            };
        };
        vault.last_updated = clock::timestamp_ms(clock) / 1000;

        event::emit(HedgePositionEvent {
            vault_id: object::uid_to_inner(&vault.id),
            position_size,
            is_open,
            timestamp: vault.last_updated,
        });
    }

    // ========================================================================
    // 管理员函数
    // ========================================================================

    /// 暂停金库 (紧急情况)
    public entry fun pause_vault(
        _admin: &VaultAdminCap,
        vault: &mut Vault,
        clock: &Clock,
    ) {
        vault.is_paused = true;
        vault.last_updated = clock::timestamp_ms(clock) / 1000;
    }

    /// 恢复金库
    public entry fun unpause_vault(
        _admin: &VaultAdminCap,
        vault: &mut Vault,
        clock: &Clock,
    ) {
        vault.is_paused = false;
        vault.last_updated = clock::timestamp_ms(clock) / 1000;
    }

    // ========================================================================
    // 视图函数
    // ========================================================================

    /// 获取抵押品余额
    public fun get_collateral_balance(vault: &Vault): u64 {
        balance::value(&vault.collateral_balance)
    }

    /// 获取借款金额
    public fun get_borrowed_amount(vault: &Vault): u64 {
        vault.borrowed_amount
    }

    /// 获取对冲头寸大小
    public fun get_hedge_position_size(vault: &Vault): u64 {
        vault.hedge_position_size
    }

    /// 检查金库是否暂停
    public fun is_paused(vault: &Vault): bool {
        vault.is_paused
    }

    /// 获取所有者
    public fun get_owner(vault: &Vault): address {
        vault.owner
    }

    /// 计算当前 LTV (basis points)
    public fun get_current_ltv_bps(vault: &Vault): u64 {
        let collateral = balance::value(&vault.collateral_balance);
        if (collateral == 0) {
            return BPS_DENOMINATOR
        };
        (vault.borrowed_amount * BPS_DENOMINATOR) / collateral
    }

    // ========================================================================
    // 测试辅助函数
    // ========================================================================

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }
}
