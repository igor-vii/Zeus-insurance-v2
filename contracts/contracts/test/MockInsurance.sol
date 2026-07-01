// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @notice Mock insurance contract for unit tests.
 *         Not for production use.
 */
contract MockInsurance {
    bool public approveAll;
    mapping(uint256 => bool) public fulfilled;

    constructor(bool _approveAll) {
        approveAll = _approveAll;
    }

    function isClaimApproved(
        uint256,
        address,
        uint256
    ) external view returns (bool) {
        return approveAll;
    }

    function markClaimFulfilled(uint256 claimId) external {
        fulfilled[claimId] = true;
    }
}
