import { ethers } from "hardhat";

/**
 * Deploy ZeusReserve to the configured network.
 *
 * Usage:
 *   pnpm --filter @workspace/contracts run deploy:baseSepolia
 *
 * Environment variables required:
 *   PRIVATE_KEY          — deployer wallet private key
 *   BASE_SEPOLIA_RPC_URL — RPC endpoint (defaults to https://sepolia.base.org)
 *
 * Optional:
 *   INSURANCE_CONTRACT_ADDRESS — if already deployed, set it right after deploy
 *   MINIMUM_RESERVE_ETH        — soft minimum reserve in ETH (default: 0.1)
 */
async function main() {
  // --- Validate env inputs ---
  const minimumReserveEth = process.env.MINIMUM_RESERVE_ETH ?? "0.1";
  if (isNaN(Number(minimumReserveEth)) || Number(minimumReserveEth) < 0) {
    throw new Error(`Invalid MINIMUM_RESERVE_ETH: "${minimumReserveEth}"`);
  }

  const insuranceAddress = process.env.INSURANCE_CONTRACT_ADDRESS?.trim();
  if (insuranceAddress && !ethers.isAddress(insuranceAddress)) {
    throw new Error(
      `Invalid INSURANCE_CONTRACT_ADDRESS: "${insuranceAddress}"`
    );
  }

  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No signer available — check PRIVATE_KEY");

  console.log("Deploying with account:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");
  if (balance === 0n) {
    throw new Error(
      "Deployer has 0 ETH. Fund it at https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet"
    );
  }

  // --- Config ---
  const minimumReserveWei = ethers.parseEther(minimumReserveEth);

  // --- Deploy ZeusReserve ---
  console.log("\nDeploying ZeusReserve...");
  const ZeusReserve = await ethers.getContractFactory("ZeusReserve");
  const zeusReserve = await ZeusReserve.deploy(
    deployer.address, // initialOwner
    minimumReserveWei
  );
  await zeusReserve.waitForDeployment();

  const reserveAddress = await zeusReserve.getAddress();
  console.log("ZeusReserve deployed to:", reserveAddress);
  console.log("  Owner:           ", deployer.address);
  console.log("  Minimum reserve: ", minimumReserveEth, "ETH");

  // --- Optional: wire up an existing insurance contract ---
  if (insuranceAddress) {
    console.log("\nSetting insurance contract to:", insuranceAddress);
    const tx = await zeusReserve.setInsuranceContract(insuranceAddress);
    await tx.wait();
    console.log("Insurance contract set. Tx:", tx.hash);
  } else {
    console.log(
      "\nNo INSURANCE_CONTRACT_ADDRESS set — skipping setInsuranceContract()."
    );
    console.log(
      "Call setInsuranceContract(<address>) on the owner wallet when ready."
    );
  }

  // --- Summary ---
  console.log("\n--- Deployment complete ---");
  console.log("ZeusReserve:", reserveAddress);
  console.log(
    "\nVerify on Basescan (after setting BASESCAN_API_KEY):"
  );
  console.log(
    `  pnpm --filter @workspace/contracts run verify ${reserveAddress} ${deployer.address} ${minimumReserveWei}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
