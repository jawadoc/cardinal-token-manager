import { AnchorProvider, BN, Program } from "@project-serum/anchor";
import type { Wallet } from "@saberhq/solana-contrib";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type {
  AccountMeta,
  Connection,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import { SystemProgram } from "@solana/web3.js";

import {
  DEFAULT_PAYMENT_MANAGER_NAME,
  PAYMENT_MANAGER_ADDRESS,
} from "../paymentManager";
import { findPaymentManagerAddress } from "../paymentManager/pda";
import { CRANK_KEY, TOKEN_MANAGER_ADDRESS } from "../tokenManager";
import { findClaimReceiptId } from "../tokenManager/pda";
import type { COLLATERAL_MANAGER_PROGRAM } from "./constants";
import {
  COLLATERAL_MANAGER_ADDRESS,
  COLLATERAL_MANAGER_IDL,
} from "./constants";
import { findCollateralManagerAddress } from "./pda";

export type CollateralManagerParams = {
  collateralMint: PublicKey;
  collateralAmount: number;
  collector?: PublicKey;
  paymentManager?: PublicKey;
};

export const init = async (
  connection: Connection,
  wallet: Wallet,
  tokenManagerId: PublicKey,
  params: CollateralManagerParams
): Promise<[TransactionInstruction, PublicKey]> => {
  const provider = new AnchorProvider(connection, wallet, {});

  const collateralManagerProgram = new Program<COLLATERAL_MANAGER_PROGRAM>(
    COLLATERAL_MANAGER_IDL,
    COLLATERAL_MANAGER_ADDRESS,
    provider
  );

  const [collateralManagerId, _collateralManagerBump] =
    await findCollateralManagerAddress(tokenManagerId);

  const [defaultPaymentManagerId] = await findPaymentManagerAddress(
    DEFAULT_PAYMENT_MANAGER_NAME
  );

  return [
    collateralManagerProgram.instruction.init(
      {
        collateralMint: params.collateralMint,
        collateralAmount: new BN(params.collateralAmount),
        collector: params.collector || CRANK_KEY,
        paymentManager: params.paymentManager || defaultPaymentManagerId,
      },
      {
        accounts: {
          tokenManager: tokenManagerId,
          collateralManager: collateralManagerId,
          issuer: wallet.publicKey,
          payer: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        },
      }
    ),
    collateralManagerId,
  ];
};

export const deposit = async (
  connection: Connection,
  wallet: Wallet,
  tokenManagerId: PublicKey,
  payerTokenAccountId: PublicKey,
  paymentManager: PublicKey,
  paymentAccounts: [PublicKey, PublicKey, AccountMeta[]]
): Promise<TransactionInstruction> => {
  const provider = new AnchorProvider(connection, wallet, {});

  const collateralManagerProgram = new Program<COLLATERAL_MANAGER_PROGRAM>(
    COLLATERAL_MANAGER_IDL,
    COLLATERAL_MANAGER_ADDRESS,
    provider
  );

  const [claimReceiptId, _claimReceiptBump] = await findClaimReceiptId(
    tokenManagerId,
    wallet.publicKey
  );

  const [collateralManagerId] = await findCollateralManagerAddress(
    tokenManagerId
  );
  const [paymentTokenAccountId, feeCollectorTokenAccount, remainingAccounts] =
    paymentAccounts;
  return collateralManagerProgram.instruction.deposit({
    accounts: {
      tokenManager: tokenManagerId,
      collateralTokenAccount: paymentTokenAccountId,
      feeCollectorTokenAccount: feeCollectorTokenAccount,
      paymentManager: paymentManager,
      collateralManager: collateralManagerId,
      payer: wallet.publicKey,
      payerCollateralTokenAccount: payerTokenAccountId,
      recipientTokenAccount: payerTokenAccountId,
      claimReceipt: claimReceiptId,
      cardinalTokenManager: TOKEN_MANAGER_ADDRESS,
      cardinalPaymentManager: PAYMENT_MANAGER_ADDRESS,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    },
    remainingAccounts,
  });
};

export const withdraw = async (
  connection: Connection,
  wallet: Wallet,
  tokenManagerId: PublicKey,
  collateralTokenAccountId: PublicKey,
  recipientTokenAccountId: PublicKey
): Promise<TransactionInstruction> => {
  const provider = new AnchorProvider(connection, wallet, {});
  const collateralManagerProgram = new Program<COLLATERAL_MANAGER_PROGRAM>(
    COLLATERAL_MANAGER_IDL,
    COLLATERAL_MANAGER_ADDRESS,
    provider
  );

  const [collateralManagerId] = await findCollateralManagerAddress(
    tokenManagerId
  );
  return collateralManagerProgram.instruction.withdraw({
    accounts: {
      tokenManager: tokenManagerId,
      collateralManager: collateralManagerId,
      collateralTokenAccount: collateralTokenAccountId,
      recipientCollateralTokenAccount: recipientTokenAccountId,
      invalidator: wallet.publicKey,
      collector: CRANK_KEY,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
  });
};

export const close = (
  connection: Connection,
  wallet: Wallet,
  collateralManagerId: PublicKey,
  tokenManagerId: PublicKey,
  collector?: PublicKey
): TransactionInstruction => {
  const provider = new AnchorProvider(connection, wallet, {});

  const collateralManagerProgram = new Program<COLLATERAL_MANAGER_PROGRAM>(
    COLLATERAL_MANAGER_IDL,
    COLLATERAL_MANAGER_ADDRESS,
    provider
  );

  return collateralManagerProgram.instruction.close({
    accounts: {
      tokenManager: tokenManagerId,
      collateralManager: collateralManagerId,
      collector: collector || CRANK_KEY,
      closer: wallet.publicKey,
    },
  });
};
