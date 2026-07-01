// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title IInsuranceContract
 * @notice Interface for the existing insurance contract that ZeusReserve integrates with.
 *         Implement this interface on your existing insurance contract so ZeusReserve
 *         can verify claim legitimacy before releasing funds.
 */
interface IInsuranceContract {
    /**
     * @notice Returns true if the given claim is valid and has been approved.
     * @param claimId    Unique identifier for the claim
     * @param claimant   Address of the policyholder making the claim
     * @param amount     ETH amount (in wei) requested for the claim
     */
    function isClaimApproved(
        uint256 claimId,
        address claimant,
        uint256 amount
    ) external view returns (bool);

    /**
     * @notice Called by ZeusReserve after a claim has been paid out,
     *         so the insurance contract can update its internal state.
     * @param claimId  The claim that was fulfilled
     */
    function markClaimFulfilled(uint256 claimId) external;

    /**
     * @notice Emitted by the insurance contract when a new claim is approved.
     */
    event ClaimApproved(uint256 indexed claimId, address indexed claimant, uint256 amount);
}
