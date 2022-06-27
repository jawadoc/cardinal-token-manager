import {
  AccountData,
  programs,
  tryGetAccount,
  withFindOrInitAssociatedTokenAccount,
} from "@onchain_org/token-manager";
import {
  collateralManager,
  timeInvalidator,
} from "@onchain_org/token-manager/dist/cjs/programs";
import { TimeInvalidatorData } from "@onchain_org/token-manager/dist/cjs/programs/timeInvalidator";
import {
  TokenManagerData,
  TokenManagerState,
  withRemainingAccountsForReturn,
} from "@onchain_org/token-manager/dist/cjs/programs/tokenManager";
import { shouldTimeInvalidate } from "@onchain_org/token-manager/dist/cjs/programs/timeInvalidator/utils";
import {
  getReturnTokenAccount,
  withRemainingAccountsForWithdraw,
} from "@onchain_org/token-manager/dist/cjs/programs/collateralManager/utils";

import { BN, utils } from "@project-serum/anchor";
import { SignerWallet } from "@saberhq/solana-contrib";
import {
  Connection,
  Keypair,
  sendAndConfirmRawTransaction,
  Transaction,
} from "@solana/web3.js";

import { connectionFor, secondaryConnectionFor } from "../common/connection";

// EBEhYotBqZt4giEDA748BFGE4ALJFESkKoyuHttcZx5t
const wallet = Keypair.fromSecretKey(
  utils.bytes.bs58.decode(process.env.SOLANA_CRANK_KEY || "")
);

const getSolanaClock = async (
  connection: Connection
): Promise<number | null> => {
  const epochInfo = await connection.getEpochInfo();
  const blockTimeInEpoch = await connection.getBlockTime(
    epochInfo.absoluteSlot
  );
  return blockTimeInEpoch;
};

const main = async (cluster: string) => {
  const connection = connectionFor(cluster);
  const startTime = Date.now() / 1000;
  let solanaClock = await getSolanaClock(connection);
  if (!solanaClock) {
    console.log(
      `[Error] Failed to get solana clock falling back to local time (${startTime})`
    );
    solanaClock = startTime;
  }

  const allTimeInvalidators =
    await programs.timeInvalidator.accounts.getAllTimeInvalidators(connection);

  const tokenManagerIds = allTimeInvalidators.map(
    (timeInvalidator) => timeInvalidator.parsed.tokenManager
  );

  const tokenManagers = await programs.tokenManager.accounts.getTokenManagers(
    connection,
    tokenManagerIds
  );

  console.log(
    `--------------- ${wallet.publicKey.toString()} found ${
      allTimeInvalidators.length
    } expired invalidators found on ${cluster} ---------------`
  );

  for (let i = 0; i < allTimeInvalidators.length; i++) {
    const timeInvalidatorData = allTimeInvalidators[i]!;
    try {
      console.log(
        `\n\n\n\n\n--------------- ${i}/${allTimeInvalidators.length}`,
        timeInvalidatorData.pubkey.toString(),
        timeInvalidatorData.parsed.tokenManager.toString(),
        "---------------"
      );

      const tokenManagerData = tokenManagers.find(
        (tokenManager) =>
          tokenManager.pubkey.toString() ===
          timeInvalidatorData.parsed.tokenManager.toString()
      );

      const getPaidClaimApprover = await tryGetAccount(() =>
        programs.claimApprover.accounts.getClaimApprover(
          connection,
          timeInvalidatorData.parsed.tokenManager
        )
      );

      // console.log(getPaidClaimApprover?.parsed.paymentManager.toBase58());
      // console.log(timeInvalidatorData.parsed?.expiration?.toNumber());
      // console.log(
      //   timeInvalidatorData.parsed?.extensionPaymentAmount?.toNumber()
      // );
      // console.log(
      //   timeInvalidatorData.parsed?.extensionDurationSeconds?.toNumber()
      // );
      // console.log(timeInvalidatorData.parsed?.durationSeconds?.toNumber());
      // console.log(timeInvalidatorData.parsed?.maxExpiration?.toNumber());

      // console.log(timeInvalidatorData.pubkey.toBase58());

      const transaction = new Transaction();
      if (!tokenManagerData) {
        transaction.add(
          timeInvalidator.instruction.close(
            connection,
            new SignerWallet(wallet),
            timeInvalidatorData.pubkey,
            timeInvalidatorData.parsed.tokenManager
          )
        );
      } else if (
        shouldTimeInvalidate(
          tokenManagerData,
          timeInvalidatorData,
          solanaClock + (Date.now() / 1000 - startTime)
        )
      ) {
        // Withdraw collateral
        const collateralManagerData = await tryGetAccount(() =>
          collateralManager.accounts.getCollateralManager(
            connection,
            timeInvalidatorData.parsed.tokenManager
          )
        );
        if (collateralManagerData) {
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
            new SignerWallet(wallet),
            collateralManagerData,
            tokenManagerData,
            true
          );

          const remainingAccountsForWithdraw =
            await withRemainingAccountsForWithdraw(
              transaction,
              connection,
              new SignerWallet(wallet),
              tokenManagerData
            );

          transaction.add(
            await collateralManager.instruction.withdraw(
              connection,
              new SignerWallet(wallet),
              timeInvalidatorData.parsed.tokenManager,
              collateralManagerTokenAccountId,
              returnCollateralTokenAccount,
              tokenManagerData?.parsed.recipientTokenAccount,
              remainingAccountsForWithdraw
            )
          );
        }

        console.log("TX length", transaction.instructions.length);
        console.log(timeInvalidatorData.parsed?.expiration?.toNumber());
        console.log(
          timeInvalidatorData.parsed?.extensionPaymentAmount?.toNumber()
        );
        console.log(
          timeInvalidatorData.parsed?.extensionDurationSeconds?.toNumber()
        );
        console.log(timeInvalidatorData.parsed?.durationSeconds?.toNumber());
        console.log(timeInvalidatorData.parsed?.maxExpiration?.toNumber());

        const tokenManagerTokenAccountId =
          await withFindOrInitAssociatedTokenAccount(
            transaction,
            connection,
            tokenManagerData.parsed.mint,
            tokenManagerData.pubkey,
            wallet.publicKey,
            true
          );
        const remainingAccountsForReturn = await withRemainingAccountsForReturn(
          transaction,
          tokenManagerData?.parsed.receiptMint
            ? secondaryConnectionFor(cluster)
            : connection,
          new SignerWallet(wallet),
          tokenManagerData
        );
        transaction.add(
          await timeInvalidator.instruction.invalidate(
            connection,
            new SignerWallet(wallet),
            tokenManagerData.parsed.mint,
            tokenManagerData.pubkey,
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
            new SignerWallet(wallet),
            timeInvalidatorData.pubkey,
            timeInvalidatorData.parsed.tokenManager,
            timeInvalidatorData.parsed.collector
          )
        );
      } else {
        console.log(
          `Skipping this time invalidator for mint (${tokenManagerData.parsed.mint.toString()})`
        );
      }

      if (transaction && transaction.instructions.length > 0) {
        transaction.feePayer = wallet.publicKey;
        transaction.recentBlockhash = (
          await connection.getRecentBlockhash("max")
        ).blockhash;
        transaction.sign(wallet);
        const txid = await sendAndConfirmRawTransaction(
          connection,
          transaction.serialize()
        );
        console.log(
          `Succesfully invalidated time invalidator (${timeInvalidatorData.pubkey.toBase58()}) token manager id (${
            tokenManagerData?.pubkey.toBase58() || ""
          }) with txid (${txid})`
        );
      } else {
        console.log(
          `No transaction for time invalidator (${timeInvalidatorData.pubkey.toBase58()}) token manager id (${
            tokenManagerData?.pubkey.toBase58() || ""
          }) mint (${tokenManagerData?.parsed.mint.toBase58() || ""})`
        );
      }
    } catch (e) {
      console.log(
        `Failed to invalidate time invalidator (${timeInvalidatorData.pubkey.toBase58()})`,
        e
      );
    }
  }
};

export const invalidateAll = async (mainnet = true) => {
  if (mainnet) {
    try {
      await main("mainnet");
    } catch (e) {
      console.log("Failed to invalidate on mainnet: ", e);
    }
  }

  try {
    await main("devnet");
  } catch (e) {
    console.log("Failed to invalidate on devnet: ", e);
  }
};
