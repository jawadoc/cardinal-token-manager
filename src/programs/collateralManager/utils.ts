import type { Wallet } from "@saberhq/solana-contrib";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  AccountMeta,
  Connection,
  ParsedAccountData,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import { Keypair } from "@solana/web3.js";

import type { AccountData } from "../..";
import { withFindOrInitAssociatedTokenAccount } from "../..";
import type { TokenManagerData } from "../tokenManager";
import { TokenManagerKind } from "../tokenManager";
import type { CollateralManagerData } from ".";

export const getReturnTokenAccount = async (
  transaction: Transaction,
  connection: Connection,
  wallet: Wallet,
  collateralManagerData: AccountData<CollateralManagerData>,
  tokenManagerData: AccountData<TokenManagerData>,
  allowOwnerOffCurve = true
): Promise<PublicKey> => {
  const { issuer, recipientTokenAccount, kind, amount } =
    tokenManagerData.parsed;
  const checkRecipientTokenAccount = await connection.getParsedAccountInfo(
    recipientTokenAccount
  );
  const token = checkRecipientTokenAccount.value?.data as ParsedAccountData;
  if (kind === TokenManagerKind.Unmanaged) {
    if (
      !(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (
          token.parsed.info.tokenAmount.amount >= amount &&
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          token.parsed.info.delegate ===
            collateralManagerData.pubkey.toBase58() &&
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          token.parsed.info.delegatedAmount.amount >= amount
        )
      )
    ) {
      const issuerCollateralTokenAccount =
        await withFindOrInitAssociatedTokenAccount(
          transaction,
          connection,
          collateralManagerData.parsed.collateralMint,
          issuer,
          wallet.publicKey,
          allowOwnerOffCurve
        );

      console.log(issuerCollateralTokenAccount.toBase58());
      return issuerCollateralTokenAccount;
    }
  }

  console.log(token.parsed);
  const recipientCollateralTokenAccount =
    await withFindOrInitAssociatedTokenAccount(
      transaction,
      connection,
      collateralManagerData.parsed.collateralMint,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      new PublicKey(token.parsed?.info.owner),
      wallet.publicKey,
      allowOwnerOffCurve
    );

  console.log(recipientCollateralTokenAccount.toBase58());
  return recipientCollateralTokenAccount;
};

export const withRemainingAccountsForWithdraw = async (
  transaction: Transaction,
  connection: Connection,
  wallet: Wallet,
  tokenManagerData: AccountData<TokenManagerData>,
  allowOwnerOffCurve = true
): Promise<AccountMeta[]> => {
  const { issuer, mint, receiptMint, kind } = tokenManagerData.parsed;
  if (kind === TokenManagerKind.Unmanaged) {
    if (receiptMint) {
      const receiptMintLargestAccount =
        await connection.getTokenLargestAccounts(receiptMint);

      // get holder of receipt mint
      const receiptTokenAccountId = receiptMintLargestAccount.value[0]?.address;
      if (!receiptTokenAccountId) throw new Error("No token accounts found");
      const receiptMintToken = new Token(
        connection,
        receiptMint,
        TOKEN_PROGRAM_ID,
        Keypair.generate()
      );
      const receiptTokenAccount = await receiptMintToken.getAccountInfo(
        receiptTokenAccountId
      );

      // get ATA for this mint of receipt mint holder
      const returnTokenAccountId = await withFindOrInitAssociatedTokenAccount(
        transaction,
        connection,
        mint,
        receiptTokenAccount.owner,
        wallet.publicKey,
        allowOwnerOffCurve
      );

      return [
        {
          pubkey: returnTokenAccountId,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: receiptTokenAccountId,
          isSigner: false,
          isWritable: true,
        },
      ];
    } else {
      const issuerTokenAccountId = await withFindOrInitAssociatedTokenAccount(
        transaction,
        connection,
        mint,
        issuer,
        wallet.publicKey,
        allowOwnerOffCurve
      );
      return [
        {
          pubkey: issuerTokenAccountId,
          isSigner: false,
          isWritable: true,
        },
      ];
    }
  } else {
    return [];
  }
};
