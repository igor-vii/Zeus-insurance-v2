// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "../interfaces/IInsuranceContract.sol";

/**
 * @notice Reentrancy attacker for ZeusReserveV2.
 *         Registers itself as the insurance contract so it can call payClaim().
 *         On markClaimFulfilled() it attempts a re-entrant payClaim() call —
 *         ZeusReserveV2's ReentrancyGuard must block it.
 *         Not for production use.
 */
contract ReentrancyAttacker is IInsuranceContract {
    address public reserve;
    bool private attacking;

    constructor(address _reserve) {
        reserve = _reserve;
    }

    /// @dev Always approves so the outer payClaim() can proceed.
    function isClaimApproved(uint256, address, uint256)
        external
        pure
        override
        returns (bool)
    {
        return true;
    }

    /// @dev Re-enters payClaim() with a different claim ID on first callback.
    function markClaimFulfilled(uint256) external override {
        if (!attacking) {
            attacking = true;
            // Attempt re-entrant call — must be blocked by ReentrancyGuard
            (bool success, ) = reserve.call(
                abi.encodeWithSignature(
                    "payClaim(uint256,address,uint256)",
                    uint256(2),       // different claimId
                    address(this),    // recipient
                    uint256(100 * 10 ** 6) // 100 USDC
                )
            );
            success; // silence unused-variable warning
        }
    }
}
