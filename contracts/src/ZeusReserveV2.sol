// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IInsuranceContract.sol";

/**
 * @title ZeusReserveV2
 * @notice USDC-based reserve pool for the Zeus insurance protocol.
 *         Replaces the ETH-based ZeusReserve with full ERC-20 accounting,
 *         a daily payout cap, and a minimum reserve threshold.
 *
 * Differences from ZeusReserve (v1):
 *   - Denominated in USDC (any ERC-20 with 6 decimals) instead of native ETH.
 *   - deposit() accepts ERC-20 via transferFrom; no plain ETH receive().
 *   - payClaim() enforces maxDailyPayout and minReserveThreshold guards.
 *   - fulfilledClaims mapping prevents double-payout without relying solely on
 *     the insurance contract's isClaimApproved callback.
 *   - Calls markClaimFulfilled() on the insurance contract after paying out,
 *     consistent with IInsuranceContract.
 */
contract ZeusReserveV2 is ReentrancyGuard, Ownable {
    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    IERC20 public usdc;
    IInsuranceContract public insuranceContract;

    /// @notice Maximum total USDC payout allowed within a single calendar day.
    uint256 public maxDailyPayout;

    /// @notice Minimum USDC balance that must remain after any payout or withdrawal.
    uint256 public minReserveThreshold;

    /// @notice Cumulative payouts made on the current calendar day (resets daily).
    uint256 public dailyPayouts;

    /// @notice The calendar day (block.timestamp / 1 days) of the last reset.
    uint256 public lastResetDay;

    /// @notice Tracks claims that have already been paid out.
    mapping(uint256 => bool) public fulfilledClaims;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event ReserveDeposited(address indexed from, uint256 amount);
    event ClaimPaid(uint256 indexed claimId, address indexed claimant, uint256 amount);
    event ReserveWithdrawn(address indexed to, uint256 amount);
    event InsuranceContractUpdated(address indexed oldContract, address indexed newContract);
    event MaxDailyPayoutUpdated(uint256 oldValue, uint256 newValue);
    event MinReserveThresholdUpdated(uint256 oldValue, uint256 newValue);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error NotInsuranceContract(address caller);
    error ZeroAmount();
    error ZeroAddress();
    error NotAContract(address addr);
    error InsufficientReserve(uint256 available, uint256 required);
    error ReserveBelowThreshold(uint256 remaining, uint256 threshold);
    error DailyPayoutLimitExceeded(uint256 attempted, uint256 remaining);
    error ClaimAlreadyFulfilled(uint256 claimId);
    error ClaimNotApproved(uint256 claimId);
    error TransferFailed();

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyInsurance() {
        if (msg.sender != address(insuranceContract))
            revert NotInsuranceContract(msg.sender);
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @param _usdc         Address of the USDC ERC-20 token.
     * @param initialOwner  Address that will own (and administer) this reserve.
     *
     * Defaults: 1 000 USDC daily cap, 100 USDC minimum threshold.
     */
    constructor(address _usdc, address initialOwner) Ownable(initialOwner) {
        if (_usdc == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
        maxDailyPayout      = 1_000 * 10 ** 6; // 1 000 USDC
        minReserveThreshold =   100 * 10 ** 6; //   100 USDC
    }

    // -------------------------------------------------------------------------
    // Owner-only configuration
    // -------------------------------------------------------------------------

    /**
     * @notice Register (or update) the insurance contract.
     * @dev    Reverts if the address has no deployed bytecode (EOA guard).
     */
    function setInsuranceContract(address _contract) external onlyOwner {
        if (_contract == address(0)) revert ZeroAddress();
        if (_contract.code.length == 0) revert NotAContract(_contract);
        address old = address(insuranceContract);
        insuranceContract = IInsuranceContract(_contract);
        emit InsuranceContractUpdated(old, _contract);
    }

    /**
     * @notice Update the maximum USDC payout allowed per calendar day.
     */
    function setMaxDailyPayout(uint256 _max) external onlyOwner {
        emit MaxDailyPayoutUpdated(maxDailyPayout, _max);
        maxDailyPayout = _max;
    }

    /**
     * @notice Update the minimum reserve balance that must remain after payouts/withdrawals.
     */
    function setMinReserveThreshold(uint256 _min) external onlyOwner {
        emit MinReserveThresholdUpdated(minReserveThreshold, _min);
        minReserveThreshold = _min;
    }

    // -------------------------------------------------------------------------
    // Funding
    // -------------------------------------------------------------------------

    /**
     * @notice Deposit USDC into the reserve.
     *         Caller must have approved this contract for at least `amount`.
     */
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (!usdc.transferFrom(msg.sender, address(this), amount))
            revert TransferFailed();
        emit ReserveDeposited(msg.sender, amount);
    }

    /**
     * @notice Withdraw USDC from the reserve (owner only).
     *         Cannot reduce the balance below minReserveThreshold.
     */
    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 balance = usdc.balanceOf(address(this));
        if (balance < amount)
            revert InsufficientReserve(balance, amount);
        if (balance - amount < minReserveThreshold)
            revert ReserveBelowThreshold(balance - amount, minReserveThreshold);
        if (!usdc.transfer(msg.sender, amount)) revert TransferFailed();
        emit ReserveWithdrawn(msg.sender, amount);
    }

    // -------------------------------------------------------------------------
    // Claim payout — callable only by the insurance contract
    // -------------------------------------------------------------------------

    /**
     * @notice Pay out an approved insurance claim in USDC.
     *
     * Guards (in order):
     *   1. Caller must be the registered insurance contract.
     *   2. Claim must not have been fulfilled before.
     *   3. Reserve must hold sufficient USDC.
     *   4. Payout must not push balance below minReserveThreshold.
     *   5. Daily payout cap must not be exceeded.
     *   6. Insurance contract must confirm the claim is approved.
     *
     * After transferring funds, calls markClaimFulfilled() on the insurance
     * contract so it can update its internal state.
     *
     * @param claimId   Policy / claim identifier (mirrors insurance contract's ID).
     * @param claimant  Policyholder address to receive the USDC payout.
     * @param amount    Payout amount in USDC (6-decimal units).
     */
    function payClaim(
        uint256 claimId,
        address claimant,
        uint256 amount
    ) external onlyInsurance nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (claimant == address(0)) revert ZeroAddress();
        if (fulfilledClaims[claimId]) revert ClaimAlreadyFulfilled(claimId);

        uint256 balance = usdc.balanceOf(address(this));
        if (balance < amount)
            revert InsufficientReserve(balance, amount);
        if (balance - amount < minReserveThreshold)
            revert ReserveBelowThreshold(balance - amount, minReserveThreshold);

        // Reset daily counter if a new calendar day has started
        uint256 today = block.timestamp / 1 days;
        if (lastResetDay != today) {
            dailyPayouts = 0;
            lastResetDay = today;
        }
        uint256 remaining = dailyPayouts >= maxDailyPayout
            ? 0
            : maxDailyPayout - dailyPayouts;
        if (amount > remaining)
            revert DailyPayoutLimitExceeded(amount, remaining);

        // Verify claim legitimacy via the insurance contract callback
        if (!insuranceContract.isClaimApproved(claimId, claimant, amount))
            revert ClaimNotApproved(claimId);

        // Update state before external calls (CEI)
        dailyPayouts += amount;
        fulfilledClaims[claimId] = true;

        // Transfer USDC to claimant
        if (!usdc.transfer(claimant, amount)) revert TransferFailed();

        // Notify insurance contract that the claim has been fulfilled
        insuranceContract.markClaimFulfilled(claimId);

        emit ClaimPaid(claimId, claimant, amount);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @notice Current USDC balance held in the reserve.
    function getReserveBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    /// @notice True if the reserve is at or above the minimum threshold.
    function isAdequatelyFunded() external view returns (bool) {
        return usdc.balanceOf(address(this)) >= minReserveThreshold;
    }

    /// @notice USDC payout headroom remaining for today.
    function remainingDailyPayout() external view returns (uint256) {
        uint256 today = block.timestamp / 1 days;
        if (lastResetDay != today) return maxDailyPayout;
        return maxDailyPayout > dailyPayouts ? maxDailyPayout - dailyPayouts : 0;
    }
}
