use {
    crate::{errors::ErrorCode, state::*, utils::*},
    anchor_lang::prelude::*,
    anchor_spl::token::{self, Token, TokenAccount, Transfer},
};
  
  #[derive(Accounts)]
  pub struct ExtendUsagesCtx<'info> {
    #[account(constraint = token_manager.state == TokenManagerState::Claimed as u8 @ ErrorCode::InvalidTokenManager)]
    token_manager: Box<Account<'info, TokenManager>>,
  
    #[account(mut, constraint = payment_token_account.mint == token_manager.payment_mint.unwrap() @ ErrorCode::InvalidPaymentTokenAccount)]
    payment_token_account: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = payment_manager_token_account.mint == token_manager.payment_mint.unwrap() && assert_payment_manager(&payment_manager_token_account.owner) @ ErrorCode::InvalidPaymentManagerTokenAccount)]
    payment_manager_token_account: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    payer: Signer<'info>,
    #[account(mut, constraint =
        payer_token_account.owner == payer.key()
        && payer_token_account.mint == token_manager.payment_mint.unwrap()
        @ ErrorCode::InvalidPayerTokenAccount
    )]
    payer_token_account: Box<Account<'info, TokenAccount>>,
  
    token_program: Program<'info, Token>,
  }
  
  pub fn handler(ctx: Context<ExtendUsagesCtx>, payment_amount: u64) -> Result<()> {
    let remaining_accs = &mut ctx.remaining_accounts.iter();
    assert_payment_token_account(&ctx.accounts.payment_token_account, &ctx.accounts.token_manager, remaining_accs)?;
    
    let token_manager = &mut ctx.accounts.token_manager;
    if token_manager.payment_amount == None
      || token_manager.payment_mint == None
      || token_manager.total_usages == None
    {
      return Err(error!(ErrorCode::InvalidInstruction));
    }

    if payment_amount % token_manager.payment_amount.unwrap() != 0 {
      return Err(error!(ErrorCode::InvalidExtensionAmount));
    }
    // floors any u64 decimals
    let usages_to_add = payment_amount * token_manager.total_usages.unwrap() / token_manager.payment_amount.unwrap();
    let new_total_usages = Some(token_manager.total_usages.unwrap() + usages_to_add);    
    if new_total_usages > token_manager.max_usages {
      return Err(error!(ErrorCode::MaxUsagesReached));
    }
  
    let provider_fee = token_manager.payment_amount.unwrap() * (PROVIDER_FEE / FEE_SCALE);
    let recipient_fee = token_manager.payment_amount.unwrap() * (RECIPIENT_FEE / FEE_SCALE);
    if provider_fee + recipient_fee > 0 {
      let cpi_accounts = Transfer {
          from: ctx.accounts.payer_token_account.to_account_info(),
          to: ctx.accounts.payment_manager_token_account.to_account_info(),
          authority: ctx.accounts.payer.to_account_info(),
      };
      let cpi_program = ctx.accounts.token_program.to_account_info();
      let cpi_context = CpiContext::new(cpi_program, cpi_accounts);
      token::transfer(cpi_context, provider_fee + recipient_fee)?;
    }
  
    let cpi_accounts = Transfer {
      from: ctx.accounts.payer_token_account.to_account_info(),
      to: ctx.accounts.payment_token_account.to_account_info(),
      authority: ctx.accounts.payer.to_account_info(),
    };
  
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_context = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_context, payment_amount - recipient_fee)?;
  
    token_manager.total_usages = new_total_usages;
    return Ok(());
  }
  