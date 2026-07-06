const { ethers } = require("hardhat");

async function main() {
  const RESERVE   = "0xF5010Afe1856be1F447f962Dfa8AA30c2Ed19a47";
  const INSURANCE = process.env.INSURANCE_CONTRACT_ADDRESS ?? "0xbe8B48f3ad126a8546BA895Cd42B72AA715C382B";

  const [deployer] = await ethers.getSigners();
  console.log("Account:", deployer.address);

  const reserve = await ethers.getContractAt("ZeusReserveV2", RESERVE);
  console.log("Calling setInsuranceContract(", INSURANCE, ")...");

  const tx = await reserve.setInsuranceContract(INSURANCE);
  console.log("Tx sent:", tx.hash);
  await tx.wait();
  console.log("Confirmed.");

  const ic = await reserve.insuranceContract();
  console.log("insuranceContract():", ic);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
