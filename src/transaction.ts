import { BN } from "@project-serum/anchor";
import type { Wallet } from "@saberhq/solana-contrib";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import type { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { Keypair } from "@solana/web3.js";

import { findAta } from ".";
import {
  claimApprover,
  collateralManager,
  timeInvalidator,
  tokenManager,
  useInvalidator,
} from "./programs";
import type { ClaimApproverParams } from "./programs/claimApprover/instruction";
import type { CollateralManagerParams } from "./programs/collateralManager/instruction";
import {
  getReturnTokenAccount,
  withRemainingAccountsForWithdraw,
} from "./programs/collateralManager/utils";
import type { TimeInvalidationParams } from "./programs/timeInvalidator/instruction";
import { shouldTimeInvalidate } from "./programs/timeInvalidator/utils";
import type { TokenManagerData } from "./programs/tokenManager";
import {
  InvalidationType,
  TokenManagerKind,
  TokenManagerState,
} from "./programs/tokenManager";
import { tokenManagerAddressFromMint } from "./programs/tokenManager/pda";
import {
  withRemainingAccountsForPayment,
  withRemainingAccountsForReturn,
} from "./programs/tokenManager/utils";
import type { UseInvalidationParams } from "./programs/useInvalidator/instruction";
import type { AccountData } from "./utils";
import { tryGetAccount, withFindOrInitAssociatedTokenAccount } from "./utils";

export type IssueParameters = {
  claimPayment?: ClaimApproverParams;
  collateral?: CollateralManagerParams;
  timeInvalidation?: TimeInvalidationParams;
  useInvalidation?: UseInvalidationParams;
  mint: PublicKey;
  amount?: BN;
  issuerTokenAccountId: PublicKey;
  visibility?: "private" | "public";
  kind?: TokenManagerKind;
  invalidationType?: InvalidationType;
  receiptOptions?: {
    receiptMintKeypair: Keypair;
  };
  customInvalidators?: PublicKey[];
};

/**
 * Main method for issuing any managed token
 * Allows for optional payment, optional usages or expiration and includes a otp for private links
 * @param connection
 * @param wallet
 * @param parameters
 * @returns Transaction, public key for the created token manager and a otp if necessary for private links
 */
export const withIssueToken = async (
  transaction: Transaction,
  connection: Connection,
  wallet: Wallet,
  {
    claimPayment,
    collateral,
    timeInvalidation,
    useInvalidation,
    mint,
    amount = new BN(1),
    issuerTokenAccountId,
    kind = TokenManagerKind.Managed,
    invalidationType = InvalidationType.Return,
    visibility = "public",
    receiptOptions = undefined,
    customInvalidators = undefined,
  }: IssueParameters
): Promise<[Transaction, PublicKey, Keypair | undefined]> => {
  // init token manager
  const numInvalidator =
    (customInvalidators ? customInvalidators.length : 0) +
    (useInvalidation && timeInvalidation
      ? 2
      : useInvalidation || timeInvalidation
      ? 1
      : 0);
  const [tokenManagerIx, tokenManagerId] = await tokenManager.instruction.init(
    connection,
    wallet,
    mint,
    issuerTokenAccountId,
    amount,
    kind,
    invalidationType,
    numInvalidator
  );
  transaction.add(tokenManagerIx);

  //////////////////////////////
  /////// claim approver ///////
  //////////////////////////////
  let otp;
  if (claimPayment) {
    if (visibility === "private") {
      throw new Error("Private links do not currently support payment");
    }
    const [paidClaimApproverIx, paidClaimApproverId] =
      await claimApprover.instruction.init(
        connection,
        wallet,
        tokenManagerId,
        claimPayment
      );
    transaction.add(paidClaimApproverIx);
    transaction.add(
      tokenManager.instruction.setClaimApprover(
        connection,
        wallet,
        tokenManagerId,
        paidClaimApproverId
      )
    );
  } else if (visibility === "private") {
    otp = Keypair.generate();
    transaction.add(
      tokenManager.instruction.setClaimApprover(
        connection,
        wallet,
        tokenManagerId,
        otp.publicKey
      )
    );
  } else if (collateral) {
    const [collateralManagerIx, collateralManagerId] =
      await collateralManager.instruction.init(
        connection,
        wallet,
        tokenManagerId,
        collateral
      );
    transaction.add(collateralManagerIx);
    transaction.add(
      tokenManager.instruction.setClaimApprover(
        connection,
        wallet,
        tokenManagerId,
        collateralManagerId
      )
    );
  }

  //////////////////////////////
  /////// time invalidator /////
  //////////////////////////////
  if (timeInvalidation) {
    const [timeInvalidatorIx, timeInvalidatorId] =
      await timeInvalidator.instruction.init(
        connection,
        wallet,
        tokenManagerId,
        timeInvalidation
      );
    transaction.add(timeInvalidatorIx);
    transaction.add(
      tokenManager.instruction.addInvalidator(
        connection,
        wallet,
        tokenManagerId,
        timeInvalidatorId
      )
    );
  } else {
    const [timeInvalidatorId] =
      await timeInvalidator.pda.findTimeInvalidatorAddress(tokenManagerId);
    const timeInvalidatorData = await tryGetAccount(() =>
      timeInvalidator.accounts.getTimeInvalidator(connection, timeInvalidatorId)
    );
    if (timeInvalidatorData) {
      transaction.add(
        timeInvalidator.instruction.close(
          connection,
          wallet,
          timeInvalidatorId,
          tokenManagerId,
          timeInvalidatorData.parsed.collector
        )
      );
    }
  }

  //////////////////////////////
  /////////// usages ///////////
  //////////////////////////////
  if (useInvalidation) {
    const [useInvalidatorIx, useInvalidatorId] =
      await useInvalidator.instruction.init(
        connection,
        wallet,
        tokenManagerId,
        useInvalidation
      );
    transaction.add(useInvalidatorIx);
    transaction.add(
      tokenManager.instruction.addInvalidator(
        connection,
        wallet,
        tokenManagerId,
        useInvalidatorId
      )
    );
  } else {
    const [useInvalidatorId] =
      await useInvalidator.pda.findUseInvalidatorAddress(tokenManagerId);
    const useInvalidatorData = await tryGetAccount(() =>
      useInvalidator.accounts.getUseInvalidator(connection, useInvalidatorId)
    );
    if (useInvalidatorData) {
      transaction.add(
        useInvalidator.instruction.close(
          connection,
          wallet,
          useInvalidatorId,
          tokenManagerId,
          useInvalidatorData.parsed.collector
        )
      );
    }
  }

  /////////////////////////////////////////
  //////////// custom invalidators ////////
  /////////////////////////////////////////
  if (customInvalidators) {
    for (const invalidator of customInvalidators) {
      transaction.add(
        tokenManager.instruction.addInvalidator(
          connection,
          wallet,
          tokenManagerId,
          invalidator
        )
      );
    }
  }

  if (kind === TokenManagerKind.Managed) {
    const [mintManagerIx, mintManagerId] =
      await tokenManager.instruction.creatMintManager(connection, wallet, mint);

    const mintManagerData = await tryGetAccount(() =>
      tokenManager.accounts.getMintManager(connection, mintManagerId)
    );
    if (!mintManagerData) {
      transaction.add(mintManagerIx);
    }
  }

  // issuer
  const tokenManagerTokenAccountId = await withFindOrInitAssociatedTokenAccount(
    transaction,
    connection,
    mint,
    tokenManagerId,
    wallet.publicKey,
    true
  );

  transaction.add(
    tokenManager.instruction.issue(
      connection,
      wallet,
      tokenManagerId,
      tokenManagerTokenAccountId,
      issuerTokenAccountId
    )
  );

  //////////////////////////////
  //////////// index ///////////
  //////////////////////////////
  if (receiptOptions) {
    const { receiptMintKeypair } = receiptOptions;
    transaction.add(
      await tokenManager.instruction.claimReceiptMint(
        connection,
        wallet,
        "receipt",
        tokenManagerId,
        receiptMintKeypair.publicKey
      )
    );
  }

  transaction.instructions.map((t) => console.log(t.programId.toBase58()));
  // console.log(transaction.instructions)
  return [transaction, tokenManagerId, otp];
};

/**
 * Add claim instructions to a transaction
 * @param transaction
 * @param connection
 * @param wallet
 * @param tokenManagerId
 * @param otpKeypair
 * @returns Transaction with relevent claim instructions added
 */
export const withClaimToken = async (
  transaction: Transaction,
  connection: Connection,
  wallet: Wallet,
  tokenManagerId: PublicKey,
  additionalOptions?: {
    otpKeypair?: Keypair | null;
    payer?: PublicKey;
  }
): Promise<Transaction> => {
  const [tokenManagerData, claimApproverData, collateralManagerData] =
    await Promise.all([
      tokenManager.accounts.getTokenManager(connection, tokenManagerId),
      tryGetAccount(() =>
        claimApprover.accounts.getClaimApprover(connection, tokenManagerId)
      ),
      tryGetAccount(() =>
        collateralManager.accounts.getCollateralManager(
          connection,
          tokenManagerId
        )
      ),
    ]);

  const tokenManagerTokenAccountId = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    tokenManagerData.parsed.mint,
    tokenManagerId,
    true
  );

  const recipientTokenAccountId = await withFindOrInitAssociatedTokenAccount(
    transaction,
    connection,
    tokenManagerData.parsed.mint,
    wallet.publicKey,
    additionalOptions?.payer ?? wallet.publicKey
  );

  let claimReceiptId;
  // pay claim approver
  if (
    claimApproverData &&
    tokenManagerData.parsed.claimApprover &&
    tokenManagerData.parsed.claimApprover.toString() ===
      claimApproverData.pubkey.toString()
  ) {
    const payerTokenAccountId = await findAta(
      claimApproverData.parsed.paymentMint,
      wallet.publicKey
    );

    [claimReceiptId] = await tokenManager.pda.findClaimReceiptId(
      tokenManagerId,
      wallet.publicKey
    );

    const paymentAccounts = await withRemainingAccountsForPayment(
      transaction,
      connection,
      wallet,
      claimApproverData.parsed.paymentMint,
      tokenManagerData.parsed.issuer,
      claimApproverData.parsed.paymentManager,
      tokenManagerData.parsed.receiptMint,
      additionalOptions?.payer ?? wallet.publicKey
    );

    transaction.add(
      await claimApprover.instruction.pay(
        connection,
        wallet,
        tokenManagerId,
        payerTokenAccountId,
        claimApproverData.parsed.paymentManager,
        paymentAccounts
      )
    );
  } else if (
    collateralManagerData &&
    tokenManagerData.parsed.claimApprover &&
    tokenManagerData.parsed.claimApprover.toString() ===
      collateralManagerData.pubkey.toString()
  ) {
    const collateralManagerTokenAccountId =
      await withFindOrInitAssociatedTokenAccount(
        transaction,
        connection,
        collateralManagerData.parsed.collateralMint,
        collateralManagerData.pubkey,
        additionalOptions?.payer ?? wallet.publicKey,
        true
      );

    const payerTokenAccountId = await findAta(
      collateralManagerData.parsed.collateralMint,
      wallet.publicKey
    );

    [claimReceiptId] = await tokenManager.pda.findClaimReceiptId(
      tokenManagerId,
      wallet.publicKey
    );

    const paymentAccounts = await withRemainingAccountsForPayment(
      transaction,
      connection,
      wallet,
      collateralManagerData.parsed.collateralMint,
      tokenManagerData.parsed.issuer,
      collateralManagerData.parsed.paymentManager,
      tokenManagerData.parsed.receiptMint,
      additionalOptions?.payer ?? wallet.publicKey
    );

    transaction.add(
      await collateralManager.instruction.deposit(
        connection,
        wallet,
        tokenManagerId,
        payerTokenAccountId,
        recipientTokenAccountId,
        collateralManagerTokenAccountId,
        collateralManagerData.parsed.paymentManager,
        paymentAccounts
      )
    );
  } else if (tokenManagerData.parsed.claimApprover) {
    if (
      !additionalOptions?.otpKeypair ||
      additionalOptions?.otpKeypair.publicKey.toString() !==
        tokenManagerData.parsed.claimApprover.toString()
    ) {
      throw new Error("Invalid OTP");
    }
    // approve claim request
    const [createClaimReceiptIx, claimReceipt] =
      await tokenManager.instruction.createClaimReceipt(
        connection,
        wallet,
        tokenManagerId,
        additionalOptions?.otpKeypair.publicKey,
        additionalOptions?.payer
      );
    transaction.add(createClaimReceiptIx);
    claimReceiptId = claimReceipt;
  }

  // claim
  transaction.add(
    await tokenManager.instruction.claim(
      connection,
      wallet,
      tokenManagerId,
      tokenManagerData.parsed.kind,
      tokenManagerData.parsed.mint,
      tokenManagerTokenAccountId,
      recipientTokenAccountId,
      claimReceiptId
    )
  );

  return transaction;
};

export const withUnissueToken = async (
  transaction: Transaction,
  connection: Connection,
  wallet: Wallet,
  mintId: PublicKey
): Promise<Transaction> => {
  const tokenManagerId = await tokenManagerAddressFromMint(connection, mintId);

  const tokenManagerTokenAccountId = await findAta(
    mintId,
    tokenManagerId,
    true
  );

  const issuerTokenAccountId = await withFindOrInitAssociatedTokenAccount(
    transaction,
    connection,
    mintId,
    wallet.publicKey,
    wallet.publicKey
  );

  return transaction.add(
    tokenManager.instruction.unissue(
      connection,
      wallet,
      tokenManagerId,
      tokenManagerTokenAccountId,
      issuerTokenAccountId
    )
  );
};

export const withInvalidate = async (
  transaction: Transaction,
  connection: Connection,
  wallet: Wallet,
  mintId: PublicKey,
  UTCNow: number = Date.now() / 1000
): Promise<Transaction> => {
  const tokenManagerId = await tokenManagerAddressFromMint(connection, mintId);

  const [[useInvalidatorId], [timeInvalidatorId]] = await Promise.all([
    useInvalidator.pda.findUseInvalidatorAddress(tokenManagerId),
    timeInvalidator.pda.findTimeInvalidatorAddress(tokenManagerId),
  ]);

  const [
    useInvalidatorData,
    timeInvalidatorData,
    collateralManagerData,
    tokenManagerData,
  ] = await Promise.all([
    tryGetAccount(() =>
      useInvalidator.accounts.getUseInvalidator(connection, useInvalidatorId)
    ),
    tryGetAccount(() =>
      timeInvalidator.accounts.getTimeInvalidator(connection, timeInvalidatorId)
    ),
    tryGetAccount(() =>
      collateralManager.accounts.getCollateralManager(
        connection,
        tokenManagerId
      )
    ),
    tryGetAccount(() =>
      tokenManager.accounts.getTokenManager(connection, tokenManagerId)
    ),
  ]);

  if (!tokenManagerData) return transaction;

  const tokenManagerTokenAccountId = await withFindOrInitAssociatedTokenAccount(
    transaction,
    connection,
    mintId,
    tokenManagerId,
    wallet.publicKey,
    true
  );

  const remainingAccountsForReturn = await withRemainingAccountsForReturn(
    transaction,
    connection,
    wallet,
    tokenManagerData
  );

  let shouldInvalidate = false;
  if (
    useInvalidatorData &&
    useInvalidatorData.parsed.totalUsages &&
    useInvalidatorData.parsed.usages.gte(useInvalidatorData.parsed.totalUsages)
  ) {
    shouldInvalidate = true;
    transaction.add(
      await useInvalidator.instruction.invalidate(
        connection,
        wallet,
        mintId,
        tokenManagerId,
        tokenManagerData.parsed.kind,
        tokenManagerData.parsed.state,
        tokenManagerTokenAccountId,
        tokenManagerData?.parsed.recipientTokenAccount,
        remainingAccountsForReturn
      )
    );
    transaction.add(
      useInvalidator.instruction.close(
        connection,
        wallet,
        useInvalidatorId,
        tokenManagerId,
        useInvalidatorData.parsed.collector
      )
    );
  } else if (
    timeInvalidatorData &&
    shouldTimeInvalidate(tokenManagerData, timeInvalidatorData, UTCNow)
  ) {
    shouldInvalidate = true;
    transaction.add(
      await timeInvalidator.instruction.invalidate(
        connection,
        wallet,
        mintId,
        tokenManagerId,
        tokenManagerData.parsed.kind,
        tokenManagerData.parsed.state,
        tokenManagerTokenAccountId,
        tokenManagerData?.parsed.recipientTokenAccount,
        remainingAccountsForReturn
      )
    );
    transaction.add(
      timeInvalidator.instruction.close(
        connection,
        wallet,
        timeInvalidatorData.pubkey,
        timeInvalidatorData.parsed.tokenManager,
        timeInvalidatorData.parsed.collector
      )
    );
  } else if (
    tokenManagerData.parsed.invalidators.some((inv) =>
      inv.equals(wallet.publicKey)
    ) ||
    tokenManagerData.parsed.invalidationType === InvalidationType.Return ||
    tokenManagerData.parsed.invalidationType === InvalidationType.Reissue
  ) {
    shouldInvalidate = true;
    transaction.add(
      await tokenManager.instruction.invalidate(
        connection,
        wallet,
        mintId,
        tokenManagerId,
        tokenManagerData.parsed.kind,
        tokenManagerData.parsed.state,
        tokenManagerTokenAccountId,
        tokenManagerData?.parsed.recipientTokenAccount,
        remainingAccountsForReturn
      )
    );
  }

  // If we have collateral and we can invalidate, withdraw collateral
  if (collateralManagerData && shouldInvalidate) {
    const collateralManagerTokenAccountId =
      await withFindOrInitAssociatedTokenAccount(
        transaction,
        connection,
        collateralManagerData.parsed.collateralMint,
        collateralManagerData.pubkey,
        wallet.publicKey,
        true
      );

    const returnCollateralTokenAccount = await getReturnTokenAccount(
      transaction,
      connection,
      wallet,
      collateralManagerData,
      tokenManagerData,
      true
    );

    const remainingAccountsForWithdraw = await withRemainingAccountsForWithdraw(
      transaction,
      connection,
      wallet,
      tokenManagerData
    );

    transaction.instructions.splice(
      0,
      0,
      await collateralManager.instruction.withdraw(
        connection,
        wallet,
        tokenManagerId,
        collateralManagerTokenAccountId,
        returnCollateralTokenAccount,
        tokenManagerData?.parsed.recipientTokenAccount,
        remainingAccountsForWithdraw
      )
    );
    // transaction.add(
    //   await collateralManager.instruction.withdraw(
    //     connection,
    //     wallet,
    //     tokenManagerId,
    //     collateralManagerTokenAccountId,
    //     returnCollateralTokenAccount,
    //     tokenManagerData?.parsed.recipientTokenAccount,
    //     remainingAccountsForWithdraw
    //   )
    // );
  }
  return transaction;
};

export const withReturn = async (
  transaction: Transaction,
  connection: Connection,
  wallet: Wallet,
  tokenManagerData: AccountData<TokenManagerData>
): Promise<Transaction> => {
  const tokenManagerTokenAccountId = await withFindOrInitAssociatedTokenAccount(
    transaction,
    connection,
    tokenManagerData.parsed.mint,
    tokenManagerData.pubkey,
    wallet.publicKey,
    true
  );
  const remainingAccountsForReturn = await withRemainingAccountsForReturn(
    transaction,
    connection,
    wallet,
    tokenManagerData
  );

  transaction.add(
    await tokenManager.instruction.invalidate(
      connection,
      wallet,
      tokenManagerData.parsed.mint,
      tokenManagerData.pubkey,
      tokenManagerData.parsed.kind,
      tokenManagerData.parsed.state,
      tokenManagerTokenAccountId,
      tokenManagerData?.parsed.recipientTokenAccount,
      remainingAccountsForReturn
    )
  );
  return transaction;
};

export const withUse = async (
  transaction: Transaction,
  connection: Connection,
  wallet: Wallet,
  mintId: PublicKey,
  usages: number,
  collector?: PublicKey
): Promise<Transaction> => {
  const tokenManagerId = await tokenManagerAddressFromMint(connection, mintId);

  const [useInvalidatorId] = await useInvalidator.pda.findUseInvalidatorAddress(
    tokenManagerId
  );

  const [useInvalidatorData, tokenManagerData] = await Promise.all([
    tryGetAccount(() =>
      useInvalidator.accounts.getUseInvalidator(connection, useInvalidatorId)
    ),
    tryGetAccount(() =>
      tokenManager.accounts.getTokenManager(connection, tokenManagerId)
    ),
  ]);

  if (!useInvalidatorData) {
    // init
    const [InitTx] = await useInvalidator.instruction.init(
      connection,
      wallet,
      tokenManagerId,
      { collector: collector }
    );
    transaction.add(InitTx);
  }

  if (!tokenManagerData?.parsed.recipientTokenAccount)
    throw new Error("Token manager has not been claimed");

  // use
  transaction.add(
    await useInvalidator.instruction.incrementUsages(
      connection,
      wallet,
      tokenManagerId,
      tokenManagerData?.parsed.recipientTokenAccount,
      usages
    )
  );

  if (
    useInvalidatorData?.parsed.totalUsages &&
    useInvalidatorData?.parsed.usages
      .add(new BN(usages))
      .gte(useInvalidatorData?.parsed.totalUsages)
  ) {
    const tokenManagerTokenAccountId =
      await withFindOrInitAssociatedTokenAccount(
        transaction,
        connection,
        mintId,
        tokenManagerId,
        wallet.publicKey,
        true
      );

    const remainingAccountsForReturn = await withRemainingAccountsForReturn(
      transaction,
      connection,
      wallet,
      tokenManagerData
    );

    transaction.add(
      await useInvalidator.instruction.invalidate(
        connection,
        wallet,
        mintId,
        tokenManagerId,
        tokenManagerData.parsed.kind,
        tokenManagerData.parsed.state,
        tokenManagerTokenAccountId,
        tokenManagerData?.parsed.recipientTokenAccount,
        remainingAccountsForReturn
      )
    );
    transaction.add(
      useInvalidator.instruction.close(
        connection,
        wallet,
        useInvalidatorId,
        tokenManagerId,
        useInvalidatorData.parsed.collector
      )
    );
  }
  return transaction;
};

export const withExtendExpiration = async (
  transaction: Transaction,
  connection: Connection,
  wallet: Wallet,
  tokenManagerId: PublicKey,
  secondsToAdd: number
): Promise<Transaction> => {
  const [timeInvalidatorId] =
    await timeInvalidator.pda.findTimeInvalidatorAddress(tokenManagerId);
  const [timeInvalidatorData, tokenManagerData] = await Promise.all([
    timeInvalidator.accounts.getTimeInvalidator(connection, timeInvalidatorId),
    tokenManager.accounts.getTokenManager(connection, tokenManagerId),
  ]);

  if (timeInvalidatorData && timeInvalidatorData.parsed.extensionPaymentMint) {
    const payerTokenAccountId = await findAta(
      timeInvalidatorData.parsed.extensionPaymentMint,
      wallet.publicKey
    );

    const paymentAccounts = await withRemainingAccountsForPayment(
      transaction,
      connection,
      wallet,
      timeInvalidatorData.parsed.extensionPaymentMint,
      tokenManagerData.parsed.issuer,
      timeInvalidatorData.parsed.paymentManager,
      tokenManagerData.parsed.receiptMint
    );

    transaction.add(
      timeInvalidator.instruction.extendExpiration(
        connection,
        wallet,
        tokenManagerId,
        timeInvalidatorData.parsed.paymentManager,
        payerTokenAccountId,
        timeInvalidatorId,
        secondsToAdd,
        paymentAccounts
      )
    );
  } else {
    console.log("No payment mint");
  }

  return transaction;
};

export const withExtendUsages = async (
  transaction: Transaction,
  connection: Connection,
  wallet: Wallet,
  tokenManagerId: PublicKey,
  usagesToAdd: number
): Promise<Transaction> => {
  const [useInvalidatorId] = await useInvalidator.pda.findUseInvalidatorAddress(
    tokenManagerId
  );
  const [useInvalidatorData, tokenManagerData] = await Promise.all([
    useInvalidator.accounts.getUseInvalidator(connection, useInvalidatorId),
    tokenManager.accounts.getTokenManager(connection, tokenManagerId),
  ]);

  if (useInvalidatorData && useInvalidatorData.parsed.extensionPaymentMint) {
    const payerTokenAccountId = await withFindOrInitAssociatedTokenAccount(
      transaction,
      connection,
      useInvalidatorData.parsed.extensionPaymentMint,
      wallet.publicKey,
      wallet.publicKey
    );

    const paymentAccounts = await withRemainingAccountsForPayment(
      transaction,
      connection,
      wallet,
      useInvalidatorData.parsed.extensionPaymentMint,
      tokenManagerData.parsed.issuer,
      useInvalidatorData.parsed.paymentManager,
      tokenManagerData.parsed.receiptMint
    );

    transaction.add(
      useInvalidator.instruction.extendUsages(
        connection,
        wallet,
        tokenManagerId,
        useInvalidatorData.parsed.paymentManager,
        payerTokenAccountId,
        useInvalidatorId,
        usagesToAdd,
        paymentAccounts
      )
    );
  }

  return transaction;
};

export const withResetExpiration = async (
  transaction: Transaction,
  connection: Connection,
  wallet: Wallet,
  tokenManagerId: PublicKey
): Promise<Transaction> => {
  const [timeInvalidatorId] =
    await timeInvalidator.pda.findTimeInvalidatorAddress(tokenManagerId);
  const [tokenManagerData] = await Promise.all([
    tokenManager.accounts.getTokenManager(connection, tokenManagerId),
  ]);

  if (tokenManagerData.parsed.state === TokenManagerState.Issued) {
    transaction.add(
      timeInvalidator.instruction.resetExpiration(
        connection,
        wallet,
        tokenManagerId,
        timeInvalidatorId
      )
    );
  } else {
    console.log("Token Manager not in state issued to reset expiration");
  }

  return transaction;
};
