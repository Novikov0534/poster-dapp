// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Poster {
    // ——— Poster из lab 2 ———————————————————
    event NewPost(
        address indexed user,
        string content,
        string indexed tag,
        string tagText
    );

    // ——— Token-gating из lab 4 —————————————
    address public tokenAddress;
    uint256 public threshold;

    // ——— Владелец контракта ————————————————
    address public owner;

    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    event TokenAddressChanged(address indexed newTokenAddress);
    event ThresholdChanged(uint256 newThreshold);

    constructor(address _tokenAddress, uint256 _threshold) {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), owner);
        tokenAddress = _tokenAddress;
        threshold = _threshold;
    }

    modifier onlyOwner() {
        require(owner == msg.sender, "Ownable: caller is not the owner");
        _;
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        address oldOwner = owner;
        owner = _newOwner;
        emit OwnershipTransferred(oldOwner, _newOwner);
    }

    function setTokenAddress(address _newTokenAddress) external onlyOwner {
        tokenAddress = _newTokenAddress;
        emit TokenAddressChanged(_newTokenAddress);
    }

    function setThreshold(uint256 _newThreshold) external onlyOwner {
        threshold = _newThreshold;
        emit ThresholdChanged(_newThreshold);
    }

    function post(string calldata content, string calldata tag) external {
        IERC20 token = IERC20(tokenAddress);
        uint256 balance = token.balanceOf(msg.sender);
        require(balance >= threshold, "Not enough tokens");

        emit NewPost(msg.sender, content, tag, tag);
    }
}