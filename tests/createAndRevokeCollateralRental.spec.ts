import { BN } from "@project-serum/anchor";
import { expectTXTable } from "@saberhq/chai-solana";
import {
  SignerWallet,
  SolanaProvider,
  TransactionEnvelope,
} from "@saberhq/solana-contrib";
import type { Token } from "@solana/spl-token";
import type { PublicKey } from "@solana/web3.js";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";

import { findAta, invalidate, rentals, tryGetAccount } from "../src";
import { collateralManager, tokenManager } from "../src/programs";
import { CollateralManagerState } from "../src/programs/collateralManager";
import {
  TokenManagerKind,
  TokenManagerState,
} from "../src/programs/tokenManager";
import { createMint } from "./utils";
import { getProvider } from "./workspace";

describe("Create and Revoke Collateral Rental", () => {
  const RECIPIENT_START_PAYMENT_AMOUNT = 1000;
  const RENTAL_PAYMENT_AMONT = 10;
  const recipient = Keypair.generate();
  const tokenCreator = Keypair.generate();
  let recipientPaymentTokenAccountId: PublicKey;
  let issuerTokenAccountId: PublicKey;
  let paymentMint: Token;
  let rentalMint: Token;
  //   let expiration: number;

  before(async () => {
    const provider = getProvider();
    const airdropCreator = await provider.connection.requestAirdrop(
      tokenCreator.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropCreator);

    const airdropRecipient = await provider.connection.requestAirdrop(
      recipient.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropRecipient);

    // create payment mint
    [recipientPaymentTokenAccountId, paymentMint] = await createMint(
      provider.connection,
      tokenCreator,
      recipient.publicKey,
      RECIPIENT_START_PAYMENT_AMOUNT
    );

    // create rental mint
    [issuerTokenAccountId, rentalMint] = await createMint(
      provider.connection,
      tokenCreator,
      provider.wallet.publicKey,
      1,
      provider.wallet.publicKey
    );
  });

  it("Create rental with collateral", async () => {
    const provider = getProvider();
    const [transaction, tokenManagerId] = await rentals.createRental(
      provider.connection,
      provider.wallet,
      {
        collateral: {
          collateralAmount: RENTAL_PAYMENT_AMONT,
          collateralMint: paymentMint.publicKey,
        },
        timeInvalidation: {
          durationSeconds: 1000,
          extension: {
            extensionPaymentAmount: 1, // Pay 1 lamport to add 1000 seconds of expiration time
            extensionDurationSeconds: 1000,
            extensionPaymentMint: paymentMint.publicKey,
            disablePartialExtension: true,
          },
        },
        mint: rentalMint.publicKey,
        issuerTokenAccountId: issuerTokenAccountId,
        amount: new BN(1),
        kind: TokenManagerKind.Unmanaged,
      }
    );
    const txEnvelope = new TransactionEnvelope(
      SolanaProvider.init({
        connection: provider.connection,
        wallet: provider.wallet,
        opts: provider.opts,
      }),
      [...transaction.instructions]
    );
    await expectTXTable(txEnvelope, "test", {
      verbosity: "error",
      formatLogs: true,
    }).to.be.fulfilled;

    const tokenManagerData = await tokenManager.accounts.getTokenManager(
      provider.connection,
      tokenManagerId
    );
    expect(tokenManagerData.parsed.state).to.eq(TokenManagerState.Issued);
    expect(tokenManagerData.parsed.amount.toNumber()).to.eq(1);
    expect(tokenManagerData.parsed.mint).to.eqAddress(rentalMint.publicKey);
    expect(tokenManagerData.parsed.invalidators).length.greaterThanOrEqual(1);
    expect(tokenManagerData.parsed.issuer).to.eqAddress(
      provider.wallet.publicKey
    );

    const checkIssuerTokenAccount = await rentalMint.getAccountInfo(
      issuerTokenAccountId
    );
    expect(checkIssuerTokenAccount.amount.toNumber()).to.eq(0);

    // check receipt-index
    const tokenManagers = await tokenManager.accounts.getTokenManagersForIssuer(
      provider.connection,
      provider.wallet.publicKey
    );
    expect(tokenManagers.map((i) => i.pubkey.toString())).to.include(
      tokenManagerId.toString()
    );

    const collateralManagerData =
      await collateralManager.accounts.getCollateralManager(
        provider.connection,
        tokenManagerId
      );
    expect(collateralManagerData.parsed.state).to.eq(
      CollateralManagerState.Initialized
    );
    expect(collateralManagerData.parsed.collateralAmount.toNumber()).to.eq(
      RENTAL_PAYMENT_AMONT
    );
    expect(collateralManagerData.parsed.collateralMint).to.eqAddress(
      paymentMint.publicKey
    );
    expect(collateralManagerData.parsed.tokenManager).to.eqAddress(
      tokenManagerId
    );
  });

  it("Claim rental", async () => {
    const provider = getProvider();

    const tokenManagerId = await tokenManager.pda.tokenManagerAddressFromMint(
      provider.connection,
      rentalMint.publicKey
    );

    const transaction = await rentals.claimRental(
      provider.connection,
      new SignerWallet(recipient),
      tokenManagerId
    );

    const txEnvelope = new TransactionEnvelope(
      SolanaProvider.init({
        connection: provider.connection,
        wallet: new SignerWallet(recipient),
        opts: provider.opts,
      }),
      [...transaction.instructions]
    );

    await expectTXTable(txEnvelope, "test", {
      verbosity: "error",
      formatLogs: true,
    }).to.be.fulfilled;

    const tokenManagerData = await tokenManager.accounts.getTokenManager(
      provider.connection,
      tokenManagerId
    );
    expect(tokenManagerData.parsed.state).to.eq(TokenManagerState.Claimed);
    expect(tokenManagerData.parsed.amount.toNumber()).to.eq(1);

    const checkIssuerTokenAccount = await rentalMint.getAccountInfo(
      issuerTokenAccountId
    );
    expect(checkIssuerTokenAccount.amount.toNumber()).to.eq(0);

    const checkRecipientTokenAccount = await rentalMint.getAccountInfo(
      await findAta(rentalMint.publicKey, recipient.publicKey)
    );
    expect(checkRecipientTokenAccount.amount.toNumber()).to.eq(1);
    expect(checkRecipientTokenAccount.isFrozen).to.eq(false);

    const checkRecipientPaymentTokenAccount = await paymentMint.getAccountInfo(
      recipientPaymentTokenAccountId
    );
    expect(checkRecipientPaymentTokenAccount.amount.toNumber()).to.eq(
      RECIPIENT_START_PAYMENT_AMOUNT - RENTAL_PAYMENT_AMONT
    );

    const collateralManagerData =
      await collateralManager.accounts.getCollateralManager(
        provider.connection,
        tokenManagerId
      );
    expect(collateralManagerData.parsed.state).to.eq(
      CollateralManagerState.Deposited
    );
    const checkCollateralTokenAccount = await paymentMint.getAccountInfo(
      await findAta(
        collateralManagerData.parsed.collateralMint,
        collateralManagerData.pubkey,
        true
      )
    );
    expect(checkCollateralTokenAccount.amount.toNumber()).to.eq(
      RENTAL_PAYMENT_AMONT
    );
  });

  it("Invalidate with revoke", async () => {
    await new Promise((r) => setTimeout(r, 2000));
    const provider = getProvider();

    const checkRecipientTokenAccount = await rentalMint.getAccountInfo(
      await findAta(rentalMint.publicKey, recipient.publicKey)
    );

    expect(checkRecipientTokenAccount.amount.toNumber()).to.eq(1);

    const _checkIssuerTokenAccount = await rentalMint.getAccountInfo(
      issuerTokenAccountId
    );
    // Transfer token from recipient to another account
    await rentalMint.transfer(
      checkRecipientTokenAccount.address,
      _checkIssuerTokenAccount.address,
      recipient,
      [],
      1
    );

    const tokenManagerId = await tokenManager.pda.tokenManagerAddressFromMint(
      provider.connection,
      rentalMint.publicKey
    );

    const transaction = await invalidate(
      provider.connection,
      new SignerWallet(recipient),
      rentalMint.publicKey
    );

    transaction.instructions.map((i) => console.log(i.programId.toBase58()));

    const txEnvelope = new TransactionEnvelope(
      SolanaProvider.init({
        connection: provider.connection,
        wallet: new SignerWallet(recipient),
        opts: provider.opts,
      }),
      [...transaction.instructions]
    );

    await expectTXTable(txEnvelope, "use", {
      verbosity: "error",
      formatLogs: true,
    }).to.be.fulfilled;

    const tokenManagerData = await tryGetAccount(() =>
      tokenManager.accounts.getTokenManager(provider.connection, tokenManagerId)
    );
    expect(tokenManagerData).to.eq(null);

    const checkIssuerTokenAccount = await rentalMint.getAccountInfo(
      issuerTokenAccountId
    );
    expect(checkIssuerTokenAccount.amount.toNumber()).to.eq(1);
  });
});
