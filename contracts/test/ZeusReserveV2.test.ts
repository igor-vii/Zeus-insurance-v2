import { expect } from "chai";
import { ethers } from "hardhat";
import { ZeusReserveV2, MockERC20, MockInsurance } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { parseUnits, ZeroAddress } from "ethers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USDC_DECIMALS = 6;
const usdc = (amount: number | string) =>
  parseUnits(String(amount), USDC_DECIMALS);

// Defaults hard-coded in ZeusReserveV2 constructor
const DEFAULT_MAX_DAILY_PAYOUT = usdc(1_000);
const DEFAULT_MIN_THRESHOLD = usdc(100);

async function deployMockInsurance(approveAll: boolean) {
  const factory = await ethers.getContractFactory("MockInsurance");
  const contract = await factory.deploy(approveAll);
  await contract.waitForDeployment();
  return contract;
}

/** Impersonate an address and give it some ETH for gas. */
async function impersonate(addr: string) {
  await ethers.provider.send("hardhat_setBalance", [
    addr,
    "0x" + parseUnits("1", 18).toString(16),
  ]);
  return ethers.getImpersonatedSigner(addr);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ZeusReserveV2", function () {
  let reserve: ZeusReserveV2;
  let token: MockERC20;
  let owner: HardhatEthersSigner;
  let user: HardhatEthersSigner;
  let claimant: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, user, claimant] = await ethers.getSigners();

    // Deploy MockERC20 (USDC stand-in, 6 decimals)
    const ERC20Factory = await ethers.getContractFactory("MockERC20");
    token = await ERC20Factory.deploy("USD Coin", "USDC", USDC_DECIMALS);
    await token.waitForDeployment();

    // Mint USDC to participants
    await token.mint(owner.address, usdc(100_000));
    await token.mint(user.address, usdc(100_000));

    // Deploy ZeusReserveV2
    const ReserveFactory = await ethers.getContractFactory("ZeusReserveV2");
    reserve = await ReserveFactory.deploy(
      await token.getAddress(),
      owner.address
    );
    await reserve.waitForDeployment();
  });

  // -------------------------------------------------------------------------
  // Deployment
  // -------------------------------------------------------------------------
  describe("Deployment", function () {
    it("sets the owner correctly", async function () {
      expect(await reserve.owner()).to.equal(owner.address);
    });

    it("sets maxDailyPayout to 1 000 USDC", async function () {
      expect(await reserve.maxDailyPayout()).to.equal(DEFAULT_MAX_DAILY_PAYOUT);
    });

    it("sets minReserveThreshold to 100 USDC", async function () {
      expect(await reserve.minReserveThreshold()).to.equal(DEFAULT_MIN_THRESHOLD);
    });

    it("starts with zero balance", async function () {
      expect(await reserve.getReserveBalance()).to.equal(0n);
    });

    it("reports inadequately funded when empty", async function () {
      expect(await reserve.isAdequatelyFunded()).to.be.false;
    });
  });

  // -------------------------------------------------------------------------
  // Deposit
  // -------------------------------------------------------------------------
  describe("Deposit", function () {
    it("accepts USDC via deposit()", async function () {
      await token.connect(user).approve(await reserve.getAddress(), usdc(200));
      await reserve.connect(user).deposit(usdc(200));
      expect(await reserve.getReserveBalance()).to.equal(usdc(200));
    });

    it("reverts on zero deposit with ZeroAmount", async function () {
      await expect(
        reserve.connect(user).deposit(0n)
      ).to.be.revertedWithCustomError(reserve, "ZeroAmount");
    });

    it("reverts when USDC not approved (OZ ERC20InsufficientAllowance)", async function () {
      // OpenZeppelin v5 ERC20 reverts before returning false, so the
      // outer TransferFailed guard is never reached; any revert is correct.
      await expect(reserve.connect(user).deposit(usdc(100))).to.be.reverted;
    });

    it("emits ReserveDeposited event", async function () {
      const amount = usdc(500);
      await token.connect(user).approve(await reserve.getAddress(), amount);
      await expect(reserve.connect(user).deposit(amount))
        .to.emit(reserve, "ReserveDeposited")
        .withArgs(user.address, amount);
    });

    it("reports adequately funded after sufficient deposit", async function () {
      await token
        .connect(user)
        .approve(await reserve.getAddress(), DEFAULT_MIN_THRESHOLD);
      await reserve.connect(user).deposit(DEFAULT_MIN_THRESHOLD);
      expect(await reserve.isAdequatelyFunded()).to.be.true;
    });
  });

  // -------------------------------------------------------------------------
  // Withdraw
  // -------------------------------------------------------------------------
  describe("Withdraw", function () {
    const DEPOSIT = usdc(500);

    beforeEach(async function () {
      await token.connect(user).approve(await reserve.getAddress(), DEPOSIT);
      await reserve.connect(user).deposit(DEPOSIT);
    });

    it("allows owner to withdraw (staying above threshold)", async function () {
      const before = await token.balanceOf(owner.address);
      await reserve.connect(owner).withdraw(usdc(200));
      const after = await token.balanceOf(owner.address);
      expect(after - before).to.equal(usdc(200));
    });

    it("reverts when non-owner tries to withdraw", async function () {
      await expect(reserve.connect(user).withdraw(usdc(100))).to.be.reverted;
    });

    it("reverts with InsufficientReserve when amount exceeds balance", async function () {
      await expect(
        reserve.connect(owner).withdraw(usdc(999_999))
      ).to.be.revertedWithCustomError(reserve, "InsufficientReserve");
    });

    it("reverts with ZeroAmount on zero withdrawal", async function () {
      await expect(
        reserve.connect(owner).withdraw(0n)
      ).to.be.revertedWithCustomError(reserve, "ZeroAmount");
    });

    it("reverts with ReserveBelowThreshold when withdrawal would breach threshold", async function () {
      // balance=500, threshold=100 → withdrawing 450 leaves 50 < 100
      await expect(
        reserve.connect(owner).withdraw(usdc(450))
      ).to.be.revertedWithCustomError(reserve, "ReserveBelowThreshold");
    });

    it("emits ReserveWithdrawn event", async function () {
      await expect(reserve.connect(owner).withdraw(usdc(100)))
        .to.emit(reserve, "ReserveWithdrawn")
        .withArgs(owner.address, usdc(100));
    });
  });

  // -------------------------------------------------------------------------
  // setInsuranceContract
  // -------------------------------------------------------------------------
  describe("setInsuranceContract", function () {
    it("allows owner to set a deployed insurance contract", async function () {
      const mock = await deployMockInsurance(true);
      await reserve.connect(owner).setInsuranceContract(await mock.getAddress());
      expect(await reserve.insuranceContract()).to.equal(await mock.getAddress());
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
  // payClaim
  // -------------------------------------------------------------------------
  describe("payClaim", function () {
    let mockInsurance: MockInsurance;
    let mockAddr: string;
    const DEPOSIT = usdc(10_000);

    beforeEach(async function () {
      // Fund reserve generously
      await token.connect(owner).approve(await reserve.getAddress(), DEPOSIT);
      await reserve.connect(owner).deposit(DEPOSIT);

      // Wire up an approving mock insurance contract
      mockInsurance = await deployMockInsurance(true);
      mockAddr = await mockInsurance.getAddress();
      await reserve.connect(owner).setInsuranceContract(mockAddr);
    });

    /** Helper: call payClaim impersonating the insurance contract address. */
    async function payClaimAs(
      insuranceAddr: string,
      claimId: bigint,
      recipient: string,
      amount: bigint
    ) {
      const signer = await impersonate(insuranceAddr);
      return reserve.connect(signer).payClaim(claimId, recipient, amount);
    }

    it("pays out a valid claim in USDC", async function () {
      const before = await token.balanceOf(claimant.address);
      await payClaimAs(mockAddr, 1n, claimant.address, usdc(100));
      const after = await token.balanceOf(claimant.address);
      expect(after - before).to.equal(usdc(100));
    });

    it("marks the claim as fulfilled in the insurance contract", async function () {
      await payClaimAs(mockAddr, 42n, claimant.address, usdc(50));
      expect(await mockInsurance.fulfilled(42n)).to.be.true;
    });

    it("emits ClaimPaid event", async function () {
      const signer = await impersonate(mockAddr);
      await expect(
        reserve.connect(signer).payClaim(1n, claimant.address, usdc(100))
      )
        .to.emit(reserve, "ClaimPaid")
        .withArgs(1n, claimant.address, usdc(100));
    });

    it("reverts with NotInsuranceContract when caller is not insurance contract", async function () {
      await expect(
        reserve.connect(user).payClaim(1n, claimant.address, usdc(100))
      ).to.be.revertedWithCustomError(reserve, "NotInsuranceContract");
    });

    it("reverts with ClaimNotApproved when claim is not approved", async function () {
      const rejectMock = await deployMockInsurance(false);
      const rejectAddr = await rejectMock.getAddress();
      await reserve.connect(owner).setInsuranceContract(rejectAddr);
      await expect(
        payClaimAs(rejectAddr, 99n, claimant.address, usdc(50))
      ).to.be.revertedWithCustomError(reserve, "ClaimNotApproved");
    });

    it("reverts with ClaimAlreadyFulfilled on double-claim", async function () {
      await payClaimAs(mockAddr, 1n, claimant.address, usdc(50));
      await expect(
        payClaimAs(mockAddr, 1n, claimant.address, usdc(50))
      ).to.be.revertedWithCustomError(reserve, "ClaimAlreadyFulfilled");
    });

    it("reverts with InsufficientReserve when reserve has insufficient funds", async function () {
      await expect(
        payClaimAs(mockAddr, 1n, claimant.address, usdc(999_999))
      ).to.be.revertedWithCustomError(reserve, "InsufficientReserve");
    });

    it("reverts with ReserveBelowThreshold when payout would breach threshold", async function () {
      // balance=10_000, threshold=100 → payout 9_950 leaves 50 < 100
      await expect(
        payClaimAs(mockAddr, 1n, claimant.address, usdc(9_950))
      ).to.be.revertedWithCustomError(reserve, "ReserveBelowThreshold");
    });

    it("reverts with DailyPayoutLimitExceeded when cap exceeded", async function () {
      // maxDailyPayout = 1_000 USDC; try to pay 1_001
      await expect(
        payClaimAs(mockAddr, 1n, claimant.address, usdc(1_001))
      ).to.be.revertedWithCustomError(reserve, "DailyPayoutLimitExceeded");
    });

    it("blocks reentrancy attack via markClaimFulfilled callback", async function () {
      // Deploy malicious insurance contract that re-enters from markClaimFulfilled
      const AttackerFactory = await ethers.getContractFactory("ReentrancyAttacker");
      const attacker = await AttackerFactory.deploy(await reserve.getAddress());
      await attacker.waitForDeployment();
      const attackerAddr = await attacker.getAddress();

      await reserve.connect(owner).setInsuranceContract(attackerAddr);

      const balanceBefore = await reserve.getReserveBalance();

      const signer = await impersonate(attackerAddr);
      // First payClaim: attacker's markClaimFulfilled tries to re-enter
      await reserve.connect(signer).payClaim(1n, attackerAddr, usdc(100));

      // Reserve must only have been debited once (not twice)
      const balanceAfter = await reserve.getReserveBalance();
      expect(balanceBefore - balanceAfter).to.equal(usdc(100));
    });
  });

  // -------------------------------------------------------------------------
  // setMaxDailyPayout
  // -------------------------------------------------------------------------
  describe("setMaxDailyPayout", function () {
    it("allows owner to update max daily payout", async function () {
      await reserve.connect(owner).setMaxDailyPayout(usdc(5_000));
      expect(await reserve.maxDailyPayout()).to.equal(usdc(5_000));
    });

    it("emits MaxDailyPayoutUpdated", async function () {
      await expect(reserve.connect(owner).setMaxDailyPayout(usdc(5_000)))
        .to.emit(reserve, "MaxDailyPayoutUpdated")
        .withArgs(DEFAULT_MAX_DAILY_PAYOUT, usdc(5_000));
    });

    it("reverts when called by non-owner", async function () {
      await expect(
        reserve.connect(user).setMaxDailyPayout(usdc(5_000))
      ).to.be.reverted;
    });
  });

  // -------------------------------------------------------------------------
  // setMinReserveThreshold
  // -------------------------------------------------------------------------
  describe("setMinReserveThreshold", function () {
    it("allows owner to update min reserve threshold", async function () {
      await reserve.connect(owner).setMinReserveThreshold(usdc(500));
      expect(await reserve.minReserveThreshold()).to.equal(usdc(500));
    });

    it("emits MinReserveThresholdUpdated", async function () {
      await expect(reserve.connect(owner).setMinReserveThreshold(usdc(500)))
        .to.emit(reserve, "MinReserveThresholdUpdated")
        .withArgs(DEFAULT_MIN_THRESHOLD, usdc(500));
    });

    it("reverts when called by non-owner", async function () {
      await expect(
        reserve.connect(user).setMinReserveThreshold(usdc(500))
      ).to.be.reverted;
    });
  });

  // -------------------------------------------------------------------------
  // Daily payout reset
  // -------------------------------------------------------------------------
  describe("Daily payout reset", function () {
    let mockAddr: string;

    beforeEach(async function () {
      await token.connect(owner).approve(await reserve.getAddress(), usdc(10_000));
      await reserve.connect(owner).deposit(usdc(10_000));
      const mock = await deployMockInsurance(true);
      mockAddr = await mock.getAddress();
      await reserve.connect(owner).setInsuranceContract(mockAddr);
    });

    it("resets dailyPayouts on a new calendar day", async function () {
      const signer = await impersonate(mockAddr);

      // Pay 500 USDC today
      await reserve.connect(signer).payClaim(1n, claimant.address, usdc(500));
      expect(await reserve.dailyPayouts()).to.equal(usdc(500));

      // Advance time by 1 day
      await ethers.provider.send("evm_increaseTime", [86_400]);
      await ethers.provider.send("evm_mine", []);

      // Next day: 500 USDC should succeed again (counter was reset)
      await reserve.connect(signer).payClaim(2n, claimant.address, usdc(500));
      expect(await reserve.dailyPayouts()).to.equal(usdc(500));
    });

    it("remainingDailyPayout decreases with each claim", async function () {
      const signer = await impersonate(mockAddr);

      expect(await reserve.remainingDailyPayout()).to.equal(DEFAULT_MAX_DAILY_PAYOUT);
      await reserve.connect(signer).payClaim(1n, claimant.address, usdc(300));
      expect(await reserve.remainingDailyPayout()).to.equal(usdc(700));
    });
  });
});
