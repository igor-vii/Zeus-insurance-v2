// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @notice Reentrancy attacker for testing ZeusReserve.
 *         On receiving ETH it immediately re-calls payClaim to attempt re-entry.
 *         ZeusReserve's ReentrancyGuard must reject the second call.
 *         Not for production use.
 */
contract ReentrancyAttacker {
    address public reserve;
    address public insuranceContract;
    bool private attacking;

    constructor(address _reserve, address _insuranceContract) {
        reserve = _reserve;
        insuranceContract = _insuranceContract;
    }

    // Called when ZeusReserve sends ETH to this contract
    receive() external payable {
        if (!attacking) {
            attacking = true;
            // Attempt re-entrant payClaim — must be blocked by ReentrancyGuard
            (bool success, ) = reserve.call(
                abi.encodeWithSignature(
                    "payClaim(uint256,address,uint256)",
                    1,
                    address(this),
                    1 ether
                )
            );
            // We don't care about the inner result; the outer call will revert
            // because the ETH transfer back to this contract fails on the
            // re-entrant path (reserve has already locked the guard).
            success; // silence unused warning
        }
    }
}
