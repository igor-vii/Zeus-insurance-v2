const { ethers } = require("hardhat");

async function main() {
  const RESERVE   = "0xF5010Afe1856be1F447f962Dfa8AA30c2Ed19a47";
  const INSURANCE = "0xbe8B48f3ad126a8546BA895Cd42B72AA715C382B";

  const provider = ethers.provider;

  // Check code at insurance address
  const code = await provider.getCode(INSURANCE);
  console.log("Code at INSURANCE_CONTRACT_ADDRESS:", code === "0x" ? "NONE (EOA or empty)" : `${code.slice(0, 20)}... (${(code.length - 2) / 2} bytes)`);

  // Check current state of reserve
  const reserve = await ethers.getContractAt("ZeusReserveV2", RESERVE);
  const ic = await reserve.insuranceContract();
  const owner = await reserve.owner();
  const maxDaily = await reserve.maxDailyPayout();
  const minThreshold = await reserve.minReserveThreshold();

  console.log("\nZeusReserveV2 state:");
  console.log("  owner:               ", owner);
  console.log("  insuranceContract(): ", ic === ethers.ZeroAddress ? "0x0 (not set)" : ic);
  console.log("  maxDailyPayout:      ", (maxDaily / 10n**6n).toString(), "USDC");
  console.log("  minReserveThreshold: ", (minThreshold / 10n**6n).toString(), "USDC");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
