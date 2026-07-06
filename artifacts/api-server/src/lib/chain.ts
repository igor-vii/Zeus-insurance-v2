import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

/** Shared viem public client — Base Sepolia testnet */
export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http("https://sepolia.base.org"),
});
