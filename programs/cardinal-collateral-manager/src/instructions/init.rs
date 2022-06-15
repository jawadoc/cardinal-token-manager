use {
    crate::{errors::ErrorCode, state::*},
    anchor_lang::prelude::*,
    cardinal_token_manager::state::{TokenManager, TokenManagerState},
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitIx {
    pub collateral_mint: Pubkey,
    pub collateral_amount: u64,
    pub payment_manager: Pubkey,
    pub collector: Pubkey,
}

#[derive(Accounts)]
pub struct InitCtx<'info> {
    #[account(constraint = token_manager.state == TokenManagerState::Initialized as u8 @ ErrorCode::InvalidTokenManager)]
    token_manager: Box<Account<'info, TokenManager>>,

    #[account(
        init_if_needed,
        payer = payer,
        space = COLLATERAL_MANAGER_SIZE,
        seeds = [COLLATERAL_MANAGER_SEED.as_bytes(), token_manager.key().as_ref()], bump,
    )]
    collateral_manager: Box<Account<'info, CollateralManager>>,

    #[account(mut, constraint = issuer.key() == token_manager.issuer @ ErrorCode::InvalidIssuer)]
    issuer: Signer<'info>,
    #[account(mut)]
    payer: Signer<'info>,
    system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitCtx>, ix: InitIx) -> Result<()> {
    let collateral_manager = &mut ctx.accounts.collateral_manager;
    collateral_manager.bump = *ctx.bumps.get("collateral_manager").unwrap();
    collateral_manager.collateral_amount = ix.collateral_amount;
    collateral_manager.collateral_mint = ix.collateral_mint;
    collateral_manager.payment_manager = ix.payment_manager;
    collateral_manager.token_manager = ctx.accounts.token_manager.key();
    collateral_manager.collector = ix.collector;
    collateral_manager.state = CollateralManagerState::Initialized as u8;
    Ok(())
}
