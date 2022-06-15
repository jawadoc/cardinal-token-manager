use anchor_lang::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, AnchorSerialize, AnchorDeserialize)]
#[repr(u8)]
pub enum CollateralManagerState {
    /// Collateral manager is initialized
    Initialized = 0,
    /// Collateral is deposited
    Deposited = 1,
    /// Collateral is invalidated
    Invalidated = 2,
}

pub const COLLATERAL_MANAGER_SEED: &str = "collateral-manager";
pub const COLLATERAL_MANAGER_SIZE: usize = 8 + std::mem::size_of::<CollateralManager>();
#[account]
pub struct CollateralManager {
    pub bump: u8,
    pub token_manager: Pubkey,
    pub collateral_amount: u64,
    pub collateral_mint: Pubkey,
    pub payment_manager: Pubkey,
    pub collector: Pubkey,
    pub state: u8,
}
