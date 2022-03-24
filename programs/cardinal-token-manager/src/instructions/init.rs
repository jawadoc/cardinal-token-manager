use {
    crate::{state::*, errors::ErrorCode},
    anchor_lang::{prelude::*},
    anchor_spl::{token::{TokenAccount}}
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitIx {
    mint: Pubkey,
    payment_mint: Option<Pubkey>,
    payment_amount: Option<u64>,
    expiration: Option<i64>,
    duration_seconds: Option<u64>,
    max_expiration: Option<i64>,
    disable_partial_extension: Option<bool>,
    total_usages: Option<u64>,
    max_usages: Option<u64>,
    invalidators: Vec<Pubkey>,
}

#[derive(Accounts)]
#[instruction(ix: InitIx)]
pub struct InitCtx<'info> {
    #[account(
        init_if_needed,
        payer = payer,
        seeds = [TOKEN_MANAGER_SEED.as_bytes(), ix.mint.as_ref()], bump,
        space = token_manager_size(ix.invalidators.len() as usize),
    )]
    token_manager: Box<Account<'info, TokenManager>>,

    #[account(
        init_if_needed,
        payer = payer,
        seeds = [MINT_COUNTER_SEED.as_bytes(), ix.mint.as_ref()], bump,
        space = MINT_COUNTER_SIZE,
    )]
    mint_counter: Box<Account<'info, MintCounter>>,

    #[account(mut)]
    issuer: Signer<'info>,
    #[account(mut)]
    payer: Signer<'info>,
    #[account(mut, constraint =
        issuer_token_account.owner == issuer.key()
        && issuer_token_account.mint == ix.mint
        && issuer_token_account.amount >= 1
        @ ErrorCode::InvalidIssuerTokenAccount
    )]
    issuer_token_account: Box<Account<'info, TokenAccount>>,
    system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitCtx>, ix: InitIx) -> Result<()> {
    if ix.invalidators.len() > MAX_INVALIDATORS {
        return Err(error!(ErrorCode::InvalidIssuerTokenAccount));
    }

    let token_manager = &mut ctx.accounts.token_manager;
    if token_manager.state != TokenManagerState::Initialized as u8 {
        return Err(error!(ErrorCode::InvalidTokenManagerState));
    }

    let mint_counter = &mut ctx.accounts.mint_counter;
    mint_counter.bump = *ctx.bumps.get("mint_counter").unwrap();
    mint_counter.count += 1;
    mint_counter.mint = ix.mint;

    token_manager.bump = *ctx.bumps.get("token_manager").unwrap();
    token_manager.count = mint_counter.count;
    token_manager.num_invalidators = ix.invalidators.len() as u8;
    token_manager.issuer = ctx.accounts.issuer.key();
    token_manager.mint = ix.mint;
    token_manager.state = TokenManagerState::Initialized as u8;
    token_manager.state_changed_at = Clock::get().unwrap().unix_timestamp;

    token_manager.payment_mint = ix.payment_mint;
    token_manager.payment_amount = ix.payment_amount;
    token_manager.expiration = ix.expiration;
    token_manager.duration_seconds = ix.duration_seconds;
    token_manager.max_expiration = ix.max_expiration;
    token_manager.disable_partial_extension = ix.disable_partial_extension;
    token_manager.total_usages = ix.total_usages;
    token_manager.max_usages = ix.max_usages;


    token_manager.claim_approver = None;
    token_manager.invalidators = ix.invalidators;
    // default to itself to avoid someone not setting it
    token_manager.transfer_authority = Some(token_manager.key());
    return Ok(())
}