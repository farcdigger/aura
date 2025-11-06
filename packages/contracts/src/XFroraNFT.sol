// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract XFroraNFT is ERC721URIStorage, Ownable, EIP712, ReentrancyGuard {
    using ECDSA for bytes32;

    uint256 public constant MAX_SUPPLY = 5555;
    uint256 public totalSupply;

    // Track which X user IDs have already minted
    mapping(uint256 => bool) public usedXUserId;
    mapping(uint256 => uint256) public tokenToXUserId;
    mapping(uint256 => uint256) public xUserIdToTokenId;

    // EIP-712 typehash for MintAuth
    bytes32 public constant MINT_AUTH_TYPEHASH = keccak256(
        "MintAuth(address to,address payer,uint256 xUserId,string tokenURI,uint256 nonce,uint256 deadline)"
    );

    // Track used nonces to prevent replay attacks
    mapping(address => uint256) public nonces;

    event Minted(
        address indexed to,
        address indexed payer,
        uint256 indexed tokenId,
        uint256 xUserId,
        string tokenURI,
        uint256 totalMinted,
        uint256 remainingSupply
    );

    constructor(address initialOwner)
        ERC721("xFrora", "XFR")
        Ownable(initialOwner)
        EIP712("xFrora", "1")
    {
        totalSupply = 0;
    }

    function mintWithSig(
        MintAuth calldata auth,
        bytes calldata signature
    ) external nonReentrant {
        require(totalSupply < MAX_SUPPLY, "Max supply reached");
        require(!usedXUserId[auth.xUserId], "X user already minted");
        require(block.timestamp <= auth.deadline, "Signature expired");
        require(auth.nonce == nonces[auth.to], "Invalid nonce");
        require(auth.to != address(0), "Invalid recipient");
        require(bytes(auth.tokenURI).length > 0, "Token URI cannot be empty");

        // Verify signature
        bytes32 structHash = keccak256(
            abi.encode(
                MINT_AUTH_TYPEHASH,
                auth.to,
                auth.payer,
                auth.xUserId,
                keccak256(bytes(auth.tokenURI)),
                auth.nonce,
                auth.deadline
            )
        );
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = hash.recover(signature);
        require(signer != address(0), "Invalid signature");
        require(signer == owner(), "Invalid signature");

        // Increment nonce
        nonces[auth.to]++;

        // Mark X user ID as used
        usedXUserId[auth.xUserId] = true;

        // Mint token
        totalSupply++;
        uint256 tokenId = totalSupply;
        _safeMint(auth.to, tokenId);
        _setTokenURI(tokenId, auth.tokenURI);

        tokenToXUserId[tokenId] = auth.xUserId;
        xUserIdToTokenId[auth.xUserId] = tokenId;

        uint256 remaining = MAX_SUPPLY - totalSupply;
        emit Minted(
            auth.to,
            auth.payer,
            tokenId,
            auth.xUserId,
            auth.tokenURI,
            totalSupply,
            remaining
        );
    }

    function getNonce(address user) external view returns (uint256) {
        return nonces[user];
    }

    function remainingSupply() external view returns (uint256) {
        return MAX_SUPPLY - totalSupply;
    }

    function getTokenIdForXUser(uint256 xUserId) external view returns (uint256) {
        return xUserIdToTokenId[xUserId];
    }

    function getMintStats() external view returns (uint256 minted, uint256 remaining) {
        minted = totalSupply;
        remaining = MAX_SUPPLY - totalSupply;
    }

    function getMintDetails(uint256 tokenId) external view returns (uint256 xUserId, string memory uri) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return (tokenToXUserId[tokenId], tokenURI(tokenId));
    }

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override(ERC721) returns (address) {
        return super._update(to, tokenId, auth);
    }
}

struct MintAuth {
    address to;
    address payer;
    uint256 xUserId;
    string tokenURI;
    uint256 nonce;
    uint256 deadline;
}

