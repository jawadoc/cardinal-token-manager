import {
  AnchorProvider,
  BorshAccountsCoder,
  Program,
} from "@project-serum/anchor";
import type { Connection, PublicKey } from "@solana/web3.js";

import type { AccountData } from "../../utils";
import type {
  COLLATERAL_MANAGER_PROGRAM,
  CollateralManagerData,
} from "./constants";
import {
  COLLATERAL_MANAGER_ADDRESS,
  COLLATERAL_MANAGER_IDL,
} from "./constants";
import { findCollateralManagerAddress } from "./pda";

// TODO fix types
export const getCollateralManager = async (
  connection: Connection,
  tokenManagerId: PublicKey
): Promise<AccountData<CollateralManagerData>> => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const provider = new AnchorProvider(connection, null, {});
  const collateralManagerProgram = new Program<COLLATERAL_MANAGER_PROGRAM>(
    COLLATERAL_MANAGER_IDL,
    COLLATERAL_MANAGER_ADDRESS,
    provider
  );

  const [collateralManagerId] = await findCollateralManagerAddress(
    tokenManagerId
  );

  const parsed = await collateralManagerProgram.account.collateralManager.fetch(
    collateralManagerId
  );
  return {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    parsed,
    pubkey: collateralManagerId,
  };
};

export const getCollateralManagers = async (
  connection: Connection,
  collateralManagerIds: PublicKey[]
): Promise<AccountData<CollateralManagerData>[]> => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const provider = new AnchorProvider(connection, null, {});
  const collateralManagerProgram = new Program<COLLATERAL_MANAGER_PROGRAM>(
    COLLATERAL_MANAGER_IDL,
    COLLATERAL_MANAGER_ADDRESS,
    provider
  );

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  let collateralManagers = [];
  try {
    collateralManagers =
      await collateralManagerProgram.account.collateralManager.fetchMultiple(
        collateralManagerIds
      );
  } catch (e) {
    console.log(e);
  }
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  return collateralManagers.map((tm, i) => ({
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    parsed: tm,
    pubkey: collateralManagerIds[i],
  }));
};

export const getAllCollateralManagers = async (
  connection: Connection
): Promise<AccountData<CollateralManagerData>[]> => {
  const programAccounts = await connection.getProgramAccounts(
    COLLATERAL_MANAGER_ADDRESS
  );

  const collateralManagers: AccountData<CollateralManagerData>[] = [];
  const coder = new BorshAccountsCoder(COLLATERAL_MANAGER_IDL);
  programAccounts.forEach((account) => {
    try {
      const collateralManagerData: CollateralManagerData = coder.decode(
        "collateralManager",
        account.account.data
      );
      collateralManagers.push({
        ...account,
        parsed: collateralManagerData,
      });
    } catch (e) {
      console.log(`Failed to decode collateral manager data`);
    }
  });
  return collateralManagers;
};
