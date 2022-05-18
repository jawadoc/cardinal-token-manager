import { invalidateAll } from "./time-invalidator-crank/invalidate";

invalidateAll(false).catch((e) => console.log(e));
