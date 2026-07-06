import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

/** Shared viem public client — Base mainnet, public RPC */
export const publicClient = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org"),
});
