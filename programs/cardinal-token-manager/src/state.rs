use anchor_lang::prelude::*;
use std::str::FromStr;

#[derive(Clone, Debug, PartialEq, AnchorSerialize, AnchorDeserialize)]
#[repr(u8)]
pub enum TokenManagerState {
    /// Token manager is initialized
    Initialized = 0,
    /// Token is issued
    Issued = 1,
    /// Token is claimed and valid
    Claimed = 2,
    /// Token is invalid
    Invalidated = 3,
}


#[derive(Clone, Debug, PartialEq, AnchorSerialize, AnchorDeserialize)]
#[repr(u8)]
pub enum TokenManagerKind {
    /// Token a managed rental and will use freeze authority to manage the token
    Managed = 1,
    /// Token is unmanaged and can be traded freely until expiration
    Unmanaged = 2,
    /// Token is a metaplex edition and so it uses metaplex program to freeze
    Edition = 3,
}

#[derive(Clone, Debug, PartialEq, AnchorSerialize, AnchorDeserialize)]
#[repr(u8)]
pub enum InvalidationType {
    /// Upon invalidation it will be returned to the issuer
    Return = 1,
    /// Upon invalidation it will remain marked as invalid
    Invalidate = 2,
    /// Upon invalidation the token manager will be deleted and thus the tokens are released
    Release = 3,
}

pub fn token_manager_size(num_invalidators: usize) -> usize {
    return (8 + 1 + 1 + 8 + 1 + 32 + 32 + 8 + 1 + 1 + 8 + 1 + 32 + 33 + 16 + 16 + 16 + 1 + 16 + 16 + 16 + 33 + 33 + 33 + num_invalidators * 32) + 8 as usize
}

pub const MAX_INVALIDATORS: usize = 5;
pub const TOKEN_MANAGER_SEED: &str = "token-manager";
#[account]
pub struct TokenManager {
    // version
    pub version: u8,
    // bump
    pub bump: u8,
    // count
    pub count: u64,
    // number of invalidator assigned to this token manager
    pub num_invalidators: u8,
    // issuer of this token manager
    pub issuer: Pubkey,
    // mint of the tokens in this token manager
    pub mint: Pubkey,
    // amount of tokens in this token manager
    pub amount: u64,
    // kind of token manager
    pub kind: u8,
    // current state of the token manager
    pub state: u8,
    // timestamp for when the token manager state has change
    pub state_changed_at: i64,
    // what happens to the token upon invalidation
    pub invalidation_type: u8,
    // token account currently holding the tokens in the token manager
    pub recipient_token_account: Pubkey,
    
    // mint to accept payments
    pub payment_mint: Option<Pubkey>,
    // amount of payment to accept
    pub payment_amount: Option<u64>,
    // fixed expiration
    pub expiration: Option<i64>,
    // duration after claim at which this will expire
    pub duration_seconds: Option<u64>,
    // max expiration this can be extended to
    pub max_expiration: Option<i64>,
    // whether extension can be done in partial amounts
    pub disable_partial_extension: Option<bool>,

    // number of times this token manager has been used
    pub usages: u64,
    // total usages before invalidation
    pub total_usages: Option<u64>,
    // max usages this token manager can be extended to
    pub max_usages: Option<u64>,

    // the receipt mint from this token manager if it has been claimed
    pub receipt_mint: Option<Pubkey>,
    // the authority to approve claims of this token
    pub claim_approver: Option<Pubkey>,
    // the authority who can approve transfers of this token
    pub transfer_authority: Option<Pubkey>,
    // array of other public keys who can invalidate this token manager
    pub invalidators: Vec<Pubkey>,
}

pub const MINT_MANAGER_SEED: &str = "mint-manager";
pub const MINT_MANAGER_SIZE: usize = 8 + std::mem::size_of::<MintManager>() + 8; 
#[account]
pub struct MintManager {
    pub bump: u8,
    pub initializer: Pubkey,
    pub token_managers: u64,
}

pub const MINT_COUNTER_SEED: &str = "mint-counter";
pub const MINT_COUNTER_SIZE: usize = 8 + std::mem::size_of::<MintCounter>() + 8; 
#[account]
pub struct MintCounter {
    pub bump: u8,
    pub mint: Pubkey,
    pub count: u64,
}

pub const CLAIM_RECEIPT_SEED: &str = "claim-receipt";
pub const CLAIM_RECEIPT_SIZE: usize = 8 + std::mem::size_of::<ClaimReceipt>() + 8; 
#[account]
pub struct ClaimReceipt {
    pub mint_count: u64,
    pub token_manager: Pubkey,
    pub target: Pubkey
}

pub const TRANSFER_RECEIPT_SEED: &str = "transfer-receipt";
pub const TRANSFER_RECEIPT_SIZE: usize = 8 + std::mem::size_of::<TranferReceipt>() + 8; 
#[account]
pub struct TranferReceipt {
    pub mint_count: u64,
    pub token_manager: Pubkey,
    pub target: Pubkey
}

pub const FEE_SCALE: u64 = 10000;
pub const PROVIDER_FEE: u64 = 0;
pub const RECIPIENT_FEE: u64 = 0;
pub fn assert_payment_manager(key: &Pubkey) -> bool {
    let allowed_payment_managers = [
        Pubkey::from_str("crdk1Mw5WzoVNgz8RgHJXzHdwSrJvp4UcGirvtJzB6U").unwrap(),
    ];
    return allowed_payment_managers.contains(key)
}

pub const RECEIPT_MINT_MANAGER_SEED: &str = "receipt-mint-manager";
pub const RECEIPT_MINT_MANAGER_SIZE: usize = 8 + std::mem::size_of::<ReceiptMintManager>() + 8; 
#[account]
pub struct ReceiptMintManager {
    pub bump: u8,
}