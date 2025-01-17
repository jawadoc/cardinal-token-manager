use {
    crate::{errors::ErrorCode, state::*},
    anchor_lang::prelude::*,
    anchor_spl::token::{self, Token, TokenAccount, Transfer, Approve},
    cardinal_payment_manager::program::CardinalPaymentManager,
    cardinal_token_manager::{state::{TokenManager, TokenManagerKind}, program::CardinalTokenManager, utils::assert_payment_token_account},
};

#[derive(Accounts)]
pub struct DepositCtx<'info> {
    #[account(constraint = collateral_manager.key() == token_manager.claim_approver.expect("No claim approver found") @ ErrorCode::InvalidTokenManager)]
    token_manager: Box<Account<'info, TokenManager>>,

    #[account(mut, constraint = collateral_token_account.mint == collateral_manager.collateral_mint 
        && collateral_token_account.owner == collateral_manager.key()
        @ ErrorCode::InvalidPaymentTokenAccount)]
    collateral_token_account: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = fee_collector_token_account.mint == collateral_manager.collateral_mint @ ErrorCode::InvalidPaymentMint)]
    fee_collector_token_account: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    collateral_manager: Box<Account<'info, CollateralManager>>,

    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut, constraint = payment_manager.key() == collateral_manager.payment_manager @ ErrorCode::InvalidPaymentManager)]
    payment_manager: UncheckedAccount<'info>,

    #[account(mut)]
    payer: Signer<'info>,
    #[account(mut, constraint =
        payer_collateral_token_account.owner == payer.key()
        && payer_collateral_token_account.mint == collateral_manager.collateral_mint
        @ ErrorCode::InvalidPayerTokenAccount
    )]
    payer_collateral_token_account: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint =
        recipient_token_account.owner == payer.key()
        && recipient_token_account.mint == token_manager.mint
        @ ErrorCode::InvalidRecipientTokenAccount
    )]
    recipient_token_account: Box<Account<'info, TokenAccount>>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut)]
    claim_receipt: UncheckedAccount<'info>,

    cardinal_payment_manager: Program<'info, CardinalPaymentManager>,
    cardinal_token_manager: Program<'info, CardinalTokenManager>,

    token_program: Program<'info, Token>,
    system_program: Program<'info, System>,
}

pub fn handler<'key, 'accounts, 'remaining, 'info>(ctx: Context<'key, 'accounts, 'remaining, 'info, DepositCtx<'info>>) -> Result<()> {
    let remaining_accs = &mut ctx.remaining_accounts.iter();

    let collateral_manager = &mut ctx.accounts.collateral_manager;
    let token_manager = &ctx.accounts.token_manager;

    if ctx.accounts.payment_manager.owner.key() == ctx.accounts.cardinal_payment_manager.key() {
        let cpi_accounts = cardinal_payment_manager::cpi::accounts::HandlePaymentCtx {
            payment_manager: ctx.accounts.payment_manager.to_account_info(),
            payer_token_account: ctx.accounts.payer_collateral_token_account.to_account_info(),
            fee_collector_token_account: ctx.accounts.fee_collector_token_account.to_account_info(),
            payment_token_account: ctx.accounts.collateral_token_account.to_account_info(),
            payer: ctx.accounts.payer.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.cardinal_payment_manager.to_account_info(), cpi_accounts);
        cardinal_payment_manager::cpi::manage_payment(cpi_ctx, collateral_manager.collateral_amount)?;
    } else {
        let cpi_accounts = Transfer {
            from: ctx.accounts.payer_collateral_token_account.to_account_info(),
            to: ctx.accounts.collateral_token_account.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_context = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_context, collateral_manager.collateral_amount)?;
    }

    // set account delegate of recipient token account to token manager PDA in case of unmanaged token
    if token_manager.kind == TokenManagerKind::Unmanaged as u8 {
        let cpi_accounts = Approve {
            to: ctx.accounts.recipient_token_account.to_account_info(),
            delegate: collateral_manager.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_context = CpiContext::new(cpi_program, cpi_accounts);
        token::approve(cpi_context, token_manager.amount)?;
    }
    
    let token_manager_key = ctx.accounts.token_manager.key();
    let collateral_manager_seeds = &[COLLATERAL_MANAGER_SEED.as_bytes(), token_manager_key.as_ref(), &[collateral_manager.bump]];
    let claim_approver_signer = &[&collateral_manager_seeds[..]];

    // generate claim receipt
    let cpi_accounts = cardinal_token_manager::cpi::accounts::CreateClaimReceiptCtx {
        token_manager: ctx.accounts.token_manager.to_account_info(),
        claim_approver: collateral_manager.to_account_info(),
        claim_receipt: ctx.accounts.claim_receipt.to_account_info(),
        payer: ctx.accounts.payer.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.cardinal_token_manager.to_account_info(), cpi_accounts).with_signer(claim_approver_signer);
    cardinal_token_manager::cpi::create_claim_receipt(cpi_ctx, ctx.accounts.payer.key())?;

    collateral_manager.state = CollateralManagerState::Deposited as u8;
    Ok(())
}
