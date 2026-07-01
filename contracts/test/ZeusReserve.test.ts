import { expect } from "chai";
import { ethers } from "hardhat";
import { ZeusReserve } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { parseEther, ZeroAddress } from "ethers";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

async function deployMockInsurance(approveAll: boolean) {
  const factory = await ethers.getContractFactory("MockInsurance");
  const contract = await factory.deploy(approveAll);
  await contract.waitForDeployment();
  return contract;
}

/** Set an address's balance on the Hardhat network without a transaction. */
async function fundAddress(addr: string, ethAmount = "1") {
  await ethers.provider.send("hardhat_setBalance", [
    addr,
    "0x" + parseEther(ethAmount).toString(16),
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("ZeusReserve", function () {
  let reserve: ZeusReserve;
  let owner: HardhatEthersSigner;
  let user: HardhatEthersSigner;
  let claimant: HardhatEthersSigner;
  let minimumReserve: bigint;

  beforeEach(async function () {
    [owner, user, claimant] = await ethers.getSigners();
    minimumReserve = parseEther("1");

    const ZeusReserveFactory = await ethers.getContractFactory("ZeusReserve");
    reserve = (await ZeusReserveFactory.deploy(
      owner.address,
      minimumReserve
    )) as ZeusReserve;
    await reserve.waitForDeployment();
  });

  // -------------------------------------------------------------------------
  // Deployment
  // -------------------------------------------------------------------------
  describe("Deployment", function () {
    it("sets the owner correctly", async function () {
      expect(await reserve.owner()).to.equal(owner.address);
    });

    it("sets the minimum reserve correctly", async function () {
      expect(await reserve.minimumReserve()).to.equal(minimumReserve);
    });

    it("starts with zero balance", async function () {
      expect(await reserve.getBalance()).to.equal(0n);
    });

    it("reports inadequately funded when empty", async function () {
      expect(await reserve.isAdequatelyFunded()).to.be.false;
    });
  });

  // -------------------------------------------------------------------------
  // Deposits
  // -------------------------------------------------------------------------
  describe("Deposit", function () {
    it("accepts ETH via deposit()", async function () {
      await reserve.connect(user).deposit({ value: parseEther("2") });
      expect(await reserve.getBalance()).to.equal(parseEther("2"));
    });

    it("accepts plain ETH transfers via receive()", async function () {
      await user.sendTransaction({
        to: await reserve.getAddress(),
        value: parseEther("1.5"),
      });
      expect(await reserve.getBalance()).to.equal(parseEther("1.5"));
    });

    it("reverts on zero deposit with ZeroAmount", async function () {
      await expect(
        reserve.connect(user).deposit({ value: 0n })
      ).to.be.revertedWithCustomError(reserve, "ZeroAmount");
    });

    it("emits Deposited event", async function () {
      await expect(
        reserve.connect(user).deposit({ value: parseEther("1") })
      )
        .to.emit(reserve, "Deposited")
        .withArgs(user.address, parseEther("1"));
    });

    it("reports adequately funded after sufficient deposit", async function () {
      await reserve.connect(user).deposit({ value: minimumReserve });
      expect(await reserve.isAdequatelyFunded()).to.be.true;
    });
  });

  // -------------------------------------------------------------------------
  // Withdrawals
  // -------------------------------------------------------------------------
  describe("Withdraw", function () {
    beforeEach(async function () {
      await reserve.connect(user).deposit({ value: parseEther("5") });
    });

    it("allows owner to withdraw", async function () {
      const before = await ethers.provider.getBalance(owner.address);
      const tx = await reserve
        .connect(owner)
        .withdraw(parseEther("2"), owner.address);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const after = await ethers.provider.getBalance(owner.address);
      expect(after).to.be.closeTo(
        before + parseEther("2") - gasUsed,
        parseEther("0.001")
      );
    });

    it("reverts when non-owner tries to withdraw", async function () {
      await expect(
        reserve.connect(user).withdraw(parseEther("1"), user.address)
      ).to.be.reverted;
    });

    it("reverts with InsufficientReserve when withdrawal exceeds balance", async function () {
      await expect(
        reserve.connect(owner).withdraw(parseEther("100"), owner.address)
      ).to.be.revertedWithCustomError(reserve, "InsufficientReserve");
    });

    it("reverts with ZeroAmount on zero withdrawal", async function () {
      await expect(
        reserve.connect(owner).withdraw(0n, owner.address)
      ).to.be.revertedWithCustomError(reserve, "ZeroAmount");
    });

    it("reverts with ZeroAddress on zero recipient", async function () {
      await expect(
        reserve.connect(owner).withdraw(parseEther("1"), ZeroAddress)
      ).to.be.revertedWithCustomError(reserve, "ZeroAddress");
    });

    it("emits Withdrawn event", async function () {
      await expect(
        reserve.connect(owner).withdraw(parseEther("1"), owner.address)
      )
        .to.emit(reserve, "Withdrawn")
        .withArgs(owner.address, parseEther("1"), owner.address);
    });
  });

  // -------------------------------------------------------------------------
  // Insurance contract configuration
  // -------------------------------------------------------------------------
  describe("setInsuranceContract", function () {
    it("allows owner to set a deployed insurance contract", async function () {
      const mock = await deployMockInsurance(true);
      const mockAddr = await mock.getAddress();
      await reserve.connect(owner).setInsuranceContract(mockAddr);
      expect(await reserve.insuranceContract()).to.equal(mockAddr);
    });

    it("emits InsuranceContractUpdated", async function () {
      const mock = await deployMockInsurance(true);
      const mockAddr = await mock.getAddress();
      await expect(reserve.connect(owner).setInsuranceContract(mockAddr))
        .to.emit(reserve, "InsuranceContractUpdated")
        .withArgs(ZeroAddress, mockAddr);
    });

    it("reverts with ZeroAddress on address(0)", async function () {
      await expect(
        reserve.connect(owner).setInsuranceContract(ZeroAddress)
      ).to.be.revertedWithCustomError(reserve, "ZeroAddress");
    });

    it("reverts with NotAContract when given an EOA address", async function () {
      // user is an EOA — no bytecode at that address
      await expect(
        reserve.connect(owner).setInsuranceContract(user.address)
      ).to.be.revertedWithCustomError(reserve, "NotAContract");
    });

    it("reverts when called by non-owner", async function () {
      const mock = await deployMockInsurance(true);
      await expect(
        reserve.connect(user).setInsuranceContract(await mock.getAddress())
      ).to.be.reverted;
    });
  });

  // -------------------------------------------------------------------------
  // Claim payouts
  // -------------------------------------------------------------------------
  describe("payClaim", function () {
    let mockInsurance: Awaited<ReturnType<typeof deployMockInsurance>>;
    let mockAddr: string;

    beforeEach(async function () {
      // Fund reserve
      await reserve.connect(owner).deposit({ value: parseEther("10") });

      // Deploy approving mock and wire it up
      mockInsurance = await deployMockInsurance(true);
      mockAddr = await mockInsurance.getAddress();
      await reserve.connect(owner).setInsuranceContract(mockAddr);
    });

    it("pays out a valid claim", async function () {
      const before = await ethers.provider.getBalance(claimant.address);
      const claimId = 1n;
      const amount = parseEther("1");

      await fundAddress(mockAddr);
      const signer = await ethers.getImpersonatedSigner(mockAddr);
      await reserve.connect(signer).payClaim(claimId, claimant.address, amount);

      const after = await ethers.provider.getBalance(claimant.address);
      expect(after - before).to.equal(amount);
    });

    it("marks the claim as fulfilled in the insurance contract", async function () {
      const claimId = 42n;
      await fundAddress(mockAddr);
      const signer = await ethers.getImpersonatedSigner(mockAddr);

      await reserve
        .connect(signer)
        .payClaim(claimId, claimant.address, parseEther("1"));

      // Verify MockInsurance.fulfilled[42] === true
      expect(await mockInsurance.fulfilled(claimId)).to.be.true;
    });

    it("emits ClaimPaid event", async function () {
      await fundAddress(mockAddr);
      const signer = await ethers.getImpersonatedSigner(mockAddr);

      await expect(
        reserve.connect(signer).payClaim(1n, claimant.address, parseEther("1"))
      )
        .to.emit(reserve, "ClaimPaid")
        .withArgs(1n, claimant.address, parseEther("1"));
    });

    it("reverts with NotInsuranceContract when caller is not insurance contract", async function () {
      await expect(
        reserve.connect(user).payClaim(1n, claimant.address, parseEther("1"))
      ).to.be.revertedWithCustomError(reserve, "NotInsuranceContract");
    });

    it("reverts with ClaimNotApproved when claim is not approved", async function () {
      const rejectMock = await deployMockInsurance(false);
      const rejectAddr = await rejectMock.getAddress();
      await reserve.connect(owner).setInsuranceContract(rejectAddr);

      await fundAddress(rejectAddr);
      const signer = await ethers.getImpersonatedSigner(rejectAddr);

      await expect(
        reserve.connect(signer).payClaim(42n, claimant.address, parseEther("1"))
      ).to.be.revertedWithCustomError(reserve, "ClaimNotApproved");
    });

    it("reverts with InsufficientReserve when reserve has insufficient funds", async function () {
      await fundAddress(mockAddr);
      const signer = await ethers.getImpersonatedSigner(mockAddr);

      await expect(
        reserve
          .connect(signer)
          .payClaim(1n, claimant.address, parseEther("999"))
      ).to.be.revertedWithCustomError(reserve, "InsufficientReserve");
    });

    it("blocks reentrancy attack — attacker receives amount exactly once", async function () {
      // Deploy the malicious reentrancy attacker
      const AttackerFactory =
        await ethers.getContractFactory("ReentrancyAttacker");
      const reserveAddr = await reserve.getAddress();
      const attacker = await AttackerFactory.deploy(reserveAddr, mockAddr);
      await attacker.waitForDeployment();

      const attackerAddr = await attacker.getAddress();
      const reserveBalanceBefore = await reserve.getBalance(); // 10 ETH
      const claimAmount = parseEther("1");

      await fundAddress(mockAddr);
      const insuranceSigner = await ethers.getImpersonatedSigner(mockAddr);

      // Pay the claim — attacker's receive() will attempt re-entry,
      // but ReentrancyGuard must block it.
      await reserve
        .connect(insuranceSigner)
        .payClaim(1n, attackerAddr, claimAmount);

      // Reserve must only have been debited once (not drained by re-entry)
      const reserveBalanceAfter = await reserve.getBalance();
      expect(reserveBalanceBefore - reserveBalanceAfter).to.equal(claimAmount);

      // Attacker received exactly the claimed amount, not double
      const attackerBalance = await ethers.provider.getBalance(attackerAddr);
      expect(attackerBalance).to.equal(claimAmount);
    });
  });

  // -------------------------------------------------------------------------
  // Minimum reserve
  // -------------------------------------------------------------------------
  describe("setMinimumReserve", function () {
    it("allows owner to update minimum reserve", async function () {
      await reserve.connect(owner).setMinimumReserve(parseEther("5"));
      expect(await reserve.minimumReserve()).to.equal(parseEther("5"));
    });

    it("emits MinimumReserveUpdated", async function () {
      await expect(reserve.connect(owner).setMinimumReserve(parseEther("5")))
        .to.emit(reserve, "MinimumReserveUpdated")
        .withArgs(minimumReserve, parseEther("5"));
    });

    it("reverts when called by non-owner", async function () {
      await expect(
        reserve.connect(user).setMinimumReserve(parseEther("5"))
      ).to.be.reverted;
    });
  });
});
