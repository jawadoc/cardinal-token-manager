use anchor_lang::prelude::*;

pub const COLLATERAL_MANAGER_SEED: &str = "collateral-manager";
pub const COLLATERAL_MANAGER_SIZE: usize = 8 + std::mem::size_of::<CollateralManager>();
#[account]
pub struct CollateralManager {
    pub bump: u8,
    pub collateral_amount: u64,
    pub collateral_mint: Pubkey,
    pub payment_manager: Pubkey,
    pub token_manager: Pubkey,
    pub collector: Pubkey,
}
