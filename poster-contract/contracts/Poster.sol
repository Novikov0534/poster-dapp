// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

contract Poster {
    event NewPost(
        address indexed user,
        string content,
        string indexed tag,
        string tagText
    );

    function post(
        string calldata content,
        string calldata tag
    ) external {
        emit NewPost(msg.sender, content, tag, tag);
    }
}