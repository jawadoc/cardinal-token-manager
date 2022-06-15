import type { AnchorTypes } from "@saberhq/anchor-contrib";
import { PublicKey } from "@solana/web3.js";

import * as COLLATERAL_MANAGER_TYPES from "../../idl/cardinal_collateral_manager";

export const COLLATERAL_MANAGER_ADDRESS = new PublicKey(
  "vcmVnNNod8qTzr3n3WDkDSaSckJF9xYVU8hmtdSjWuX"
);

export const COLLATERAL_MANAGER_SEED = "collateral-manager";

export const COLLATERAL_MANAGER_IDL = COLLATERAL_MANAGER_TYPES.IDL;

export type COLLATERAL_MANAGER_PROGRAM =
  COLLATERAL_MANAGER_TYPES.CardinalCollateralManager;

export type CollateralManagerTypes = AnchorTypes<
  COLLATERAL_MANAGER_PROGRAM,
  {
    tokenManager: CollateralManagerData;
  }
>;

type Accounts = CollateralManagerTypes["Accounts"];
export type CollateralManagerData = Accounts["collateralManager"];
