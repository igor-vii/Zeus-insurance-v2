const { ethers } = require("hardhat");

const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

async function main() {
  const usdc    = process.env.USDC_ADDRESS ?? USDC_BASE_SEPOLIA;
  const reserve = process.env.RESERVE_ADDRESS ?? "0xF5010Afe1856be1F447f962Dfa8AA30c2Ed19a47";

  if (!ethers.isAddress(usdc))    throw new Error(`Invalid USDC_ADDRESS: ${usdc}`);
  if (!ethers.isAddress(reserve)) throw new Error(`Invalid RESERVE_ADDRESS: ${reserve}`);

  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No signer — check PRIVATE_KEY");

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:       ", ethers.formatEther(balance), "ETH");
  if (balance === 0n) throw new Error("Deployer has 0 ETH");

  console.log("\nDeploying ZeusInsuranceV2...");
  console.log("  USDC:    ", usdc);
  console.log("  Reserve: ", reserve);

  const Factory = await ethers.getContractFactory("ZeusInsuranceV2");
  const contract = await Factory.deploy(usdc, reserve);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("\nZeusInsuranceV2 deployed to:", address);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
