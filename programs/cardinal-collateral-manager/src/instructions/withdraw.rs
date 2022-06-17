use {
    crate::{errors::ErrorCode, state::*},
    anchor_lang::{prelude::*, AccountsClose},
    anchor_spl::token::{self, CloseAccount, TokenAccount, Transfer},
    cardinal_token_manager::{state::{TokenManager, TokenManagerKind}, errors::{ErrorCode as cardinal_error}},
};

#[derive(Accounts)]
pub struct InvalidateCtx<'info> {
    token_manager: Box<Account<'info, TokenManager>>,

    #[account(mut, constraint = collateral_manager.state == CollateralManagerState::Deposited as u8 @ ErrorCode::CollateralNotDeposited)]
    collateral_manager: Box<Account<'info, CollateralManager>>,

    #[account(mut, constraint = collateral_token_account.mint == collateral_manager.collateral_mint @ ErrorCode::InvalidPaymentTokenAccount)]
    collateral_token_account: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = recipient_collateral_token_account.mint == collateral_manager.collateral_mint @ ErrorCode::InvalidPaymentTokenAccount)]
    recipient_collateral_token_account: Box<Account<'info, TokenAccount>>,
    // recipient
    #[account(mut, constraint = recipient_token_account.mint == token_manager.mint 
        && recipient_token_account.key() == token_manager.recipient_token_account
        @ ErrorCode::InvalidRecipientTokenAccount)]
    recipient_token_account: Box<Account<'info, TokenAccount>>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut)]
    collector: AccountInfo<'info>,
    // invalidator
    #[account(constraint =
        token_manager.invalidators.contains(&invalidator.key())
        || token_manager.recipient_token_account == invalidator.key()
    )]
    invalidator: Signer<'info>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    token_program: UncheckedAccount<'info>,
}

pub fn handler<'key, 'accounts, 'remaining, 'info>(ctx: Context<'key, 'accounts, 'remaining, 'info, InvalidateCtx<'info>>) -> Result<()> {
    let collateral_manager = &mut ctx.accounts.collateral_manager;
    let token_manager = &ctx.accounts.token_manager;
    let remaining_accs = &mut ctx.remaining_accounts.iter();

    let token_manager_key = ctx.accounts.token_manager.key();
    let collateral_manager_seeds = &[COLLATERAL_MANAGER_SEED.as_bytes(), token_manager_key.as_ref(), &[collateral_manager.bump]];
    let collateral_manager_signer = &[&collateral_manager_seeds[..]];

    // Transfer token back to original owner
    // for managed and edition, token is transferred automatically on invalidate
    if token_manager.kind == TokenManagerKind::Unmanaged as u8 {
        let return_token_account_info = next_account_info(remaining_accs)?;
        let return_token_account = Account::<TokenAccount>::try_from(return_token_account_info)?;

        if token_manager.receipt_mint == None {
            if return_token_account.owner != token_manager.issuer {
                return Err(error!(cardinal_error::InvalidIssuerTokenAccount));
            }
        } else {
            let receipt_token_account_info = next_account_info(remaining_accs)?;
            let receipt_token_account = Account::<TokenAccount>::try_from(receipt_token_account_info)?;
            if !(receipt_token_account.mint == token_manager.receipt_mint.expect("No receipt mint") && receipt_token_account.amount > 0) {
                return Err(error!(cardinal_error::InvalidReceiptMintAccount));
            }
            if receipt_token_account.owner != return_token_account.owner {
                return Err(error!(cardinal_error::InvalidReceiptMintOwner));
            }
        }

        let cpi_accounts = Transfer {
            from: ctx.accounts.recipient_token_account.to_account_info(),
            to: return_token_account_info.to_account_info(),
            authority: token_manager.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_context = CpiContext::new(cpi_program, cpi_accounts).with_signer(collateral_manager_signer);
        token::transfer(cpi_context, token_manager.amount)?;
    }

    // transfer collateral back to recipient
    let cpi_accounts = Transfer {
        from: ctx.accounts.collateral_token_account.to_account_info(),
        to: ctx.accounts.recipient_collateral_token_account.to_account_info(),
        authority: collateral_manager.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_context = CpiContext::new(cpi_program, cpi_accounts).with_signer(collateral_manager_signer);
    token::transfer(cpi_context, collateral_manager.collateral_amount)?;

    collateral_manager.close(ctx.accounts.collector.to_account_info())?;

    // close token_manager_token_account
    let cpi_accounts = CloseAccount {
        account: ctx.accounts.collateral_token_account.to_account_info(),
        destination: ctx.accounts.collector.to_account_info(),
        authority: collateral_manager.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_context = CpiContext::new(cpi_program, cpi_accounts).with_signer(collateral_manager_signer);
    token::close_account(cpi_context)?;

    Ok(())
}
