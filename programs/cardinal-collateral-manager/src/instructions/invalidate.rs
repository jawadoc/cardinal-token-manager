use {
    crate::{errors::ErrorCode, state::*},
    anchor_lang::prelude::*,
    cardinal_token_manager::{program::CardinalTokenManager, state::TokenManager},
};

#[derive(Accounts)]
pub struct InvalidateCtx<'info> {
    #[account(mut)]
    token_manager: Box<Account<'info, TokenManager>>,

    #[account(mut)]
    collateral_manager: Box<Account<'info, CollateralManager>>,

    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut)]
    invalidator: AccountInfo<'info>,

    // programs
    cardinal_token_manager: Program<'info, CardinalTokenManager>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    token_program: UncheckedAccount<'info>,

    // cpi accounts
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut)]
    token_manager_token_account: UncheckedAccount<'info>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut)]
    mint: UncheckedAccount<'info>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut)]
    recipient_token_account: UncheckedAccount<'info>,
    rent: Sysvar<'info, Rent>,
}

pub fn handler<'key, 'accounts, 'remaining, 'info>(ctx: Context<'key, 'accounts, 'remaining, 'info, InvalidateCtx<'info>>) -> Result<()> {
    let token_manager_key = ctx.accounts.token_manager.key();
    let use_invalidator_seeds = &[COLLATERAL_MANAGER_SEED.as_bytes(), token_manager_key.as_ref(), &[ctx.accounts.collateral_manager.bump]];
    let use_invalidator_signer = &[&use_invalidator_seeds[..]];

    // invalidate
    let cpi_accounts = cardinal_token_manager::cpi::accounts::InvalidateCtx {
        token_manager: ctx.accounts.token_manager.to_account_info(),
        token_manager_token_account: ctx.accounts.token_manager_token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        recipient_token_account: ctx.accounts.recipient_token_account.to_account_info(),
        invalidator: ctx.accounts.collateral_manager.to_account_info(),
        collector: ctx.accounts.invalidator.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        rent: ctx.accounts.rent.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.cardinal_token_manager.to_account_info(), cpi_accounts)
        .with_remaining_accounts(ctx.remaining_accounts.to_vec())
        .with_signer(use_invalidator_signer);
    cardinal_token_manager::cpi::invalidate(cpi_ctx)?;

    Ok(())
}
