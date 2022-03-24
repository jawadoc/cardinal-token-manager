use {
    crate::{state::*, errors::ErrorCode},
    anchor_lang::{prelude::*},
    anchor_spl::{token::{TokenAccount}},
};

#[derive(Accounts)]
#[instruction(num_usages: u64)]
pub struct IncrementUsagesCtx<'info> {
    #[account(mut, constraint = token_manager.total_usages == None || token_manager.usages + num_usages <= token_manager.total_usages.unwrap() @ ErrorCode::InsufficientUsages)]
    token_manager: Box<Account<'info, TokenManager>>,

    #[account(constraint = token_manager.recipient_token_account == recipient_token_account.key() @ ErrorCode::InvalidTokenAccount)]
    recipient_token_account: Box<Account<'info, TokenAccount>>,
    #[account(constraint = user.key() == recipient_token_account.owner @ ErrorCode::InvalidUser)]
    user: Signer<'info>,
}

pub fn handler(ctx: Context<IncrementUsagesCtx>, num_usages: u64) -> Result<()> {
    let token_manager = &mut ctx.accounts.token_manager;
    token_manager.usages += num_usages;
    return Ok(())
}