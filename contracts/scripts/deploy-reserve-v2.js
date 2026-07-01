// scripts/deploy-reserve-v2.js
// Deploy ZeusReserveV2 (USDC-based reserve) to the configured network.
//
// Usage:
//   npx hardhat run scripts/deploy-reserve-v2.js --network baseSepolia
//
// Environment variables:
//   PRIVATE_KEY              — deployer wallet private key (required)
//   USDC_ADDRESS             — USDC token address
//                              (default: Base Sepolia USDC 0x036CbD53842c5426634e7929541eC2318f3dCF7e)
//   INSURANCE_CONTRACT_ADDRESS — optional: wire up right after deploy
//   MAX_DAILY_PAYOUT_USDC    — optional: daily cap in whole USDC (default: 1000)
//   MIN_RESERVE_USDC         — optional: minimum threshold in whole USDC (default: 100)

const { ethers } = require("hardhat");

// Circle's official USDC on Base Sepolia
const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

async function main() {
  // ── Env validation ──────────────────────────────────────────────────────────
  const usdcAddress = (process.env.USDC_ADDRESS ?? BASE_SEPOLIA_USDC).trim();
  if (!ethers.isAddress(usdcAddress)) {
    throw new Error(`Invalid USDC_ADDRESS: "${usdcAddress}"`);
  }

  const insuranceAddress = process.env.INSURANCE_CONTRACT_ADDRESS?.trim();
  if (insuranceAddress && !ethers.isAddress(insuranceAddress)) {
    throw new Error(
      `Invalid INSURANCE_CONTRACT_ADDRESS: "${insuranceAddress}"`
    );
  }

  const maxDailyUsdc = Number(process.env.MAX_DAILY_PAYOUT_USDC ?? "1000");
  if (isNaN(maxDailyUsdc) || maxDailyUsdc <= 0) {
    throw new Error(`Invalid MAX_DAILY_PAYOUT_USDC: "${process.env.MAX_DAILY_PAYOUT_USDC}"`);
  }

  const minReserveUsdc = Number(process.env.MIN_RESERVE_USDC ?? "100");
  if (isNaN(minReserveUsdc) || minReserveUsdc < 0) {
    throw new Error(`Invalid MIN_RESERVE_USDC: "${process.env.MIN_RESERVE_USDC}"`);
  }

  // ── Signer ──────────────────────────────────────────────────────────────────
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No signer — check PRIVATE_KEY env var");

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:       ", ethers.formatEther(balance), "ETH");
  if (balance === 0n) {
    throw new Error(
      "Deployer has 0 ETH. Fund it at https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet"
    );
  }

  // ── Deploy ──────────────────────────────────────────────────────────────────
  console.log("\nDeploying ZeusReserveV2...");
  console.log("  USDC address:        ", usdcAddress);
  console.log("  Initial owner:       ", deployer.address);
  console.log("  Max daily payout:    ", maxDailyUsdc, "USDC");
  console.log("  Min reserve:         ", minReserveUsdc, "USDC");

  const ZeusReserveV2 = await ethers.getContractFactory("ZeusReserveV2");
  const zeusReserveV2 = await ZeusReserveV2.deploy(
    usdcAddress,       // _usdc
    deployer.address   // initialOwner
  );
  await zeusReserveV2.waitForDeployment();

  const reserveAddress = await zeusReserveV2.getAddress();
  console.log("\nZeusReserveV2 deployed to:", reserveAddress);

  // ── Optional: override limits from env ──────────────────────────────────────
  const defaultMax = 1000n * 10n ** 6n;
  const defaultMin = 100n * 10n ** 6n;
  const targetMax  = BigInt(maxDailyUsdc) * 10n ** 6n;
  const targetMin  = BigInt(minReserveUsdc) * 10n ** 6n;

  if (targetMax !== defaultMax) {
    console.log(`\nSetting maxDailyPayout to ${maxDailyUsdc} USDC...`);
    const tx = await zeusReserveV2.setMaxDailyPayout(targetMax);
    await tx.wait();
    console.log("  Tx:", tx.hash);
  }

  if (targetMin !== defaultMin) {
    console.log(`\nSetting minReserveThreshold to ${minReserveUsdc} USDC...`);
    const tx = await zeusReserveV2.setMinReserveThreshold(targetMin);
    await tx.wait();
    console.log("  Tx:", tx.hash);
  }

  // ── Optional: wire up insurance contract ────────────────────────────────────
  if (insuranceAddress) {
    console.log("\nSetting insurance contract to:", insuranceAddress);
    const tx = await zeusReserveV2.setInsuranceContract(insuranceAddress);
    await tx.wait();
    console.log("  Insurance contract set. Tx:", tx.hash);
  } else {
    console.log(
      "\nNo INSURANCE_CONTRACT_ADDRESS set — skipping setInsuranceContract()."
    );
    console.log(
      "Run setInsuranceContract(<ZeusInsuranceV2 address>) from the owner wallet when ready."
    );
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log("\n─── Deployment complete ───────────────────────────────────");
  console.log("ZeusReserveV2:", reserveAddress);
  console.log("Owner:        ", deployer.address);
  console.log("USDC:         ", usdcAddress);
  console.log(
    "\nVerify on Basescan:"
  );
  console.log(
    `  npx hardhat verify --network baseSepolia ${reserveAddress} ${usdcAddress} ${deployer.address}`
  );
  console.log(
    "\nBasescan: https://sepolia.basescan.org/address/" + reserveAddress
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
