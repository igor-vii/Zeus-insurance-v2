// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IInsuranceContract.sol";

/**
 * @title ZeusReserve
 * @notice Holds the ETH reserve pool for the Zeus insurance protocol.
 *         Only the registered insurance contract can trigger claim payouts.
 *         The owner manages the reserve balance and insurance contract address.
 *
 * Integration flow:
 *   1. Deploy ZeusReserve (or use an existing deployment).
 *   2. Call setInsuranceContract() with the insurance contract address.
 *   3. Fund the reserve via deposit() or direct ETH transfer.
 *   4. The insurance contract calls payClaim() when a claim is approved.
 */
contract ZeusReserve is Ownable, ReentrancyGuard {
    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice The registered insurance contract allowed to trigger payouts.
    IInsuranceContract public insuranceContract;

    /// @notice Minimum reserve balance the owner wants to maintain (informational).
    uint256 public minimumReserve;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event Deposited(address indexed sender, uint256 amount);
    event Withdrawn(address indexed owner, uint256 amount, address indexed to);
    event ClaimPaid(
        uint256 indexed claimId,
        address indexed claimant,
        uint256 amount
    );
    event InsuranceContractUpdated(
        address indexed oldContract,
        address indexed newContract
    );
    event MinimumReserveUpdated(uint256 oldMinimum, uint256 newMinimum);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error NotInsuranceContract(address caller);
    error InsufficientReserve(uint256 available, uint256 required);
    error ClaimNotApproved(uint256 claimId);
    error ZeroAddress();
    error ZeroAmount();
    error TransferFailed();
    error NotAContract(address addr);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @param initialOwner  Address that will own (and administer) this reserve.
     * @param _minimumReserve  Soft floor for the reserve balance (informational, not enforced on-chain).
     */
    constructor(
        address initialOwner,
        uint256 _minimumReserve
    ) Ownable(initialOwner) {
        minimumReserve = _minimumReserve;
    }

    // -------------------------------------------------------------------------
    // Receive / Fallback — allow plain ETH deposits
    // -------------------------------------------------------------------------

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    // -------------------------------------------------------------------------
    // Owner-only configuration
    // -------------------------------------------------------------------------

    /**
     * @notice Set (or update) the insurance contract address.
     * @dev    Reverts if the address has no deployed bytecode (EOA guard).
     * @param _insuranceContract  Address of the IInsuranceContract implementation.
     */
    function setInsuranceContract(
        address _insuranceContract
    ) external onlyOwner {
        if (_insuranceContract == address(0)) revert ZeroAddress();
        // Guard against misconfiguring an EOA as the insurance contract.
        uint256 codeSize;
        assembly {
            codeSize := extcodesize(_insuranceContract)
        }
        if (codeSize == 0) revert NotAContract(_insuranceContract);
        address old = address(insuranceContract);
        insuranceContract = IInsuranceContract(_insuranceContract);
        emit InsuranceContractUpdated(old, _insuranceContract);
    }

    /**
     * @notice Update the soft minimum reserve threshold.
     */
    function setMinimumReserve(uint256 _minimumReserve) external onlyOwner {
        emit MinimumReserveUpdated(minimumReserve, _minimumReserve);
        minimumReserve = _minimumReserve;
    }

    // -------------------------------------------------------------------------
    // Funding
    // -------------------------------------------------------------------------

    /**
     * @notice Explicitly deposit ETH into the reserve.
     *         Equivalent to sending ETH directly to this contract.
     */
    function deposit() external payable {
        if (msg.value == 0) revert ZeroAmount();
        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @notice Withdraw ETH from the reserve (owner only).
     * @param amount  Amount in wei to withdraw.
     * @param to      Recipient address.
     */
    function withdraw(
        uint256 amount,
        address payable to
    ) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroAddress();
        if (amount > address(this).balance)
            revert InsufficientReserve(address(this).balance, amount);

        (bool success, ) = to.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit Withdrawn(msg.sender, amount, to);
    }

    // -------------------------------------------------------------------------
    // Claim payout — callable only by the insurance contract
    // -------------------------------------------------------------------------

    /**
     * @notice Pay out an approved insurance claim.
     *         Reverts if the claim is not marked approved by the insurance contract.
     *
     * @param claimId   Unique claim identifier (mirrors the insurance contract's ID).
     * @param claimant  Policyholder address to receive the payout.
     * @param amount    Payout amount in wei.
     */
    function payClaim(
        uint256 claimId,
        address payable claimant,
        uint256 amount
    ) external nonReentrant {
        if (msg.sender != address(insuranceContract))
            revert NotInsuranceContract(msg.sender);
        if (amount == 0) revert ZeroAmount();
        if (claimant == address(0)) revert ZeroAddress();
        if (amount > address(this).balance)
            revert InsufficientReserve(address(this).balance, amount);

        // Verify the claim is approved by the insurance contract
        if (!insuranceContract.isClaimApproved(claimId, claimant, amount))
            revert ClaimNotApproved(claimId);

        // Transfer funds before marking fulfilled (CEI pattern)
        (bool success, ) = claimant.call{value: amount}("");
        if (!success) revert TransferFailed();

        // Notify the insurance contract that the claim was fulfilled
        insuranceContract.markClaimFulfilled(claimId);

        emit ClaimPaid(claimId, claimant, amount);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @notice Current ETH balance held in the reserve.
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice True if the reserve is at or above the soft minimum.
    function isAdequatelyFunded() external view returns (bool) {
        return address(this).balance >= minimumReserve;
    }
}
