pub mod errors;
pub mod instructions;
pub mod state;

use {anchor_lang::prelude::*, instructions::*};

declare_id!("vpm5Gp95SYVyqwZz5zia5YsUNe7Kd6P7tFCC7GcXGbe");

#[program]
pub mod cardinal_payment_manager {
    use super::*;

    pub fn init(ctx: Context<InitCtx>, ix: InitIx) -> Result<()> {
        init::handler(ctx, ix)
    }

    pub fn manage_payment(ctx: Context<HandlePaymentCtx>, payment_amount: u64) -> Result<()> {
        handle_payment::handler(ctx, payment_amount)
    }

    pub fn close(ctx: Context<CloseCtx>) -> Result<()> {
        close::handler(ctx)
    }
}
