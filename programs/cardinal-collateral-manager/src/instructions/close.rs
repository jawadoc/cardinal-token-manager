use {
    crate::{errors::ErrorCode, state::*},
    anchor_lang::{prelude::*, AccountsClose},
    cardinal_token_manager::state::{InvalidationType, TokenManager, TokenManagerState},
};

#[derive(Accounts)]
pub struct CloseCtx<'info> {
    /// CHECK: This is not dangerous because we expect it to potentially be empty
    #[account(constraint = token_manager.key() == collateral_manager.token_manager @ ErrorCode::InvalidTokenManager)]
    token_manager: UncheckedAccount<'info>,

    #[account(mut)]
    collateral_manager: Box<Account<'info, CollateralManager>>,

    #[account(mut, constraint = collector.key() == collateral_manager.collector @ ErrorCode::InvalidCollector)]
    /// CHECK: This is not dangerous because this is just the pubkey that collects the closing account lamports
    collector: UncheckedAccount<'info>,

    #[account(mut)]
    closer: Signer<'info>,
}

pub fn handler(ctx: Context<CloseCtx>) -> Result<()> {
    if ctx.accounts.token_manager.data_is_empty() {
        ctx.accounts.collateral_manager.close(ctx.accounts.collector.to_account_info())?;
    } else {
        let token_manager = Account::<TokenManager>::try_from(&ctx.accounts.token_manager)?;
        if token_manager.state == TokenManagerState::Initialized as u8 && ctx.accounts.closer.key() == token_manager.issuer {
            ctx.accounts.collateral_manager.close(ctx.accounts.collector.to_account_info())?;
        }
        if token_manager.state == TokenManagerState::Invalidated as u8 && token_manager.kind != InvalidationType::Invalidate as u8 {
            ctx.accounts.collateral_manager.close(ctx.accounts.collector.to_account_info())?;
        }
    }
    Ok(())
}
