import { utils } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";

import {
  COLLATERAL_MANAGER_ADDRESS,
  COLLATERAL_MANAGER_SEED,
} from "./constants";

/**
 * Finds the address of the paid claim approver.
 * @returns
 */
export const findCollateralManagerAddress = async (
  tokenManagerId: PublicKey
): Promise<[PublicKey, number]> => {
  return await PublicKey.findProgramAddress(
    [
      utils.bytes.utf8.encode(COLLATERAL_MANAGER_SEED),
      tokenManagerId.toBuffer(),
    ],
    COLLATERAL_MANAGER_ADDRESS
  );
};
