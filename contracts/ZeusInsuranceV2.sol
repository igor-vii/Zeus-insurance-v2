// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./ZeusReserveV2.sol";
import "./interfaces/IInsuranceContract.sol";

/**
 * @title ZeusInsuranceV2
 * @notice Insurance contract that issues policies, collects USDC premiums into the
 *         reserve, and triggers USDC payouts via ZeusReserveV2 when a claim is valid.
 *
 * Integration flow:
 *   1. Deploy ZeusReserveV2 with the USDC token address.
 *   2. Deploy ZeusInsuranceV2 with the USDC and ZeusReserveV2 addresses.
 *   3. Call ZeusReserveV2.setInsuranceContract(address(this)).
 *   4. Fund the reserve via ZeusReserveV2.deposit().
 *   5. Buyers call buyInsurance() — premium is sent to the reserve in USDC.
 *   6. After retryDeadline passes, buyer calls claimPayout() — reserve pays in USDC.
 */
contract ZeusInsuranceV2 is IInsuranceContract, ReentrancyGuard, Ownable {
    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    IERC20 public usdc;
    ZeusReserveV2 public reserve;

    struct Policy {
        address buyer;
        address seller;
        uint256 amount;       // Coverage amount in USDC (6-decimal units)
        uint256 premium;      // Premium paid in USDC (6-decimal units)
        uint256 retryDeadline;
        uint256 maxRetries;
        bool isActive;
        bool isPaidOut;
        bool isExpired;
    }

    mapping(uint256 => Policy) public policies;
    uint256 public nextPolicyId;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event PolicyCreated(
        uint256 indexed policyId,
        address indexed buyer,
        address indexed seller,
        uint256 amount,
        uint256 premium,
        uint256 retryDeadline
    );
    event PayoutExecuted(uint256 indexed policyId, uint256 amount);
    event PolicyExpired(uint256 indexed policyId);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @param _usdc     Address of the USDC ERC-20 token.
     * @param _reserve  Address of the deployed ZeusReserveV2 contract.
     *
     * The deployer becomes the owner. Transfer ownership after deployment if needed.
     */
    constructor(address _usdc, address _reserve) Ownable(msg.sender) {
        require(_usdc != address(0), "Invalid USDC address");
        require(_reserve != address(0), "Invalid reserve address");
        usdc = IERC20(_usdc);
        reserve = ZeusReserveV2(_reserve);
    }

    // -------------------------------------------------------------------------
    // Policy management
    // -------------------------------------------------------------------------

    /**
     * @notice Purchase an insurance policy.
     *
     * Premium formula: (7% + 2% × (maxRetries − 1)) of amount, in USDC.
     * The premium is transferred directly to the reserve.
     *
     * @param seller         Counterparty address being insured against.
     * @param amount         Coverage amount in USDC (6-decimal units).
     * @param timeoutSeconds Per-retry timeout window in seconds.
     * @param maxRetries     Number of retry windows allowed (1–10).
     */
    function buyInsurance(
        address seller,
        uint256 amount,
        uint256 timeoutSeconds,
        uint256 maxRetries
    ) external nonReentrant {
        require(seller != address(0), "Invalid seller");
        require(amount > 0, "Amount must be > 0");
        require(maxRetries > 0 && maxRetries <= 10, "Invalid retries");
        require(timeoutSeconds > 0, "Timeout must be > 0");

        // Premium in bps: 7% base + 2% per additional retry
        uint256 premiumBps = 700 + (maxRetries - 1) * 200;
        uint256 premium = (amount * premiumBps) / 10000;

        // Premium transferred directly to the reserve in USDC
        require(
            usdc.transferFrom(msg.sender, address(reserve), premium),
            "Premium transfer failed"
        );

        uint256 retryDeadline = block.timestamp + timeoutSeconds * maxRetries;

        policies[nextPolicyId] = Policy({
            buyer: msg.sender,
            seller: seller,
            amount: amount,
            premium: premium,
            retryDeadline: retryDeadline,
            maxRetries: maxRetries,
            isActive: true,
            isPaidOut: false,
            isExpired: false
        });

        emit PolicyCreated(
            nextPolicyId,
            msg.sender,
            seller,
            amount,
            premium,
            retryDeadline
        );
        nextPolicyId++;
    }

    /**
     * @notice Claim a USDC payout once all retry windows have elapsed.
     *         Calls ZeusReserveV2.payClaim(), which verifies the claim via
     *         isClaimApproved() before transferring USDC to the buyer.
     * @param policyId  The policy to claim against.
     */
    function claimPayout(uint256 policyId) external nonReentrant {
        Policy storage p = policies[policyId];
        require(p.buyer == msg.sender, "Only buyer can claim");
        require(p.isActive, "Policy not active");
        require(!p.isPaidOut, "Already paid out");
        require(!p.isExpired, "Policy expired");
        require(block.timestamp >= p.retryDeadline, "Timeout not yet reached");

        uint256 payoutAmount = p.amount;
        address claimant = p.buyer;

        // Mark paid out before external call (CEI pattern)
        p.isPaidOut = true;
        p.isActive = false;

        // Reserve verifies via isClaimApproved(), pays USDC, then calls markClaimFulfilled()
        reserve.payClaim(policyId, claimant, payoutAmount);

        emit PayoutExecuted(policyId, payoutAmount);
    }

    // -------------------------------------------------------------------------
    // IInsuranceContract — called by ZeusReserveV2 during payClaim
    // -------------------------------------------------------------------------

    /**
     * @inheritdoc IInsuranceContract
     * @dev Returns true when claimPayout() has already marked the policy as
     *      paid out, the claimant matches the buyer, and the amount matches.
     */
    function isClaimApproved(
        uint256 claimId,
        address claimant,
        uint256 amount
    ) external view override returns (bool) {
        Policy storage p = policies[claimId];
        return p.isPaidOut && p.buyer == claimant && p.amount == amount;
    }

    /**
     * @inheritdoc IInsuranceContract
     * @dev Called by ZeusReserveV2 after the USDC payout has been sent.
     *      Policy state is already finalised in claimPayout(); this emits
     *      ClaimApproved for off-chain indexers.
     */
    function markClaimFulfilled(uint256 claimId) external override {
        require(msg.sender == address(reserve), "Only reserve can call");
        Policy storage p = policies[claimId];
        emit ClaimApproved(claimId, p.buyer, p.amount);
    }

    // -------------------------------------------------------------------------
    // Owner-only configuration
    // -------------------------------------------------------------------------

    /**
     * @notice Update the ZeusReserveV2 address.
     *         After calling this, also call ZeusReserveV2.setInsuranceContract(address(this))
     *         on the new reserve so the two contracts stay paired.
     */
    function setReserve(address _reserve) external onlyOwner {
        require(_reserve != address(0), "Invalid reserve address");
        reserve = ZeusReserveV2(_reserve);
    }

    /**
     * @notice Update the USDC token address.
     */
    function setUsdc(address _usdc) external onlyOwner {
        require(_usdc != address(0), "Invalid USDC address");
        usdc = IERC20(_usdc);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    function getPolicy(uint256 policyId) external view returns (Policy memory) {
        return policies[policyId];
    }
}
