// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

import {AssetRegistry} from "./AssetRegistry.sol";

/// @title PAI certification status token
/// @notice Soulbound evidence that the configured on-chain certification gate
///         is currently complete. It is not proof of ownership, value, payment,
///         enforceability, or any other off-chain legal conclusion.
contract PAICertificate is ERC721, AccessControl {
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");

    AssetRegistry public immutable registry;

    mapping(bytes32 assetId => uint256) public issuanceCount;

    event CertificateIssued(
        bytes32 indexed assetId,
        uint256 indexed tokenId,
        address indexed controller,
        uint256 issueNumber
    );
    event CertificateInvalidated(
        bytes32 indexed assetId, uint256 indexed tokenId, address indexed controller
    );

    error Soulbound();
    error InvalidConfiguration();
    error CertificateAlreadyValid(bytes32 assetId);
    error CertificateNotValid(bytes32 assetId);

    constructor(AssetRegistry registry_, address admin) ERC721("PAI Certificate", "PAI") {
        if (address(registry_) == address(0) || admin == address(0)) {
            revert InvalidConfiguration();
        }
        registry = registry_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function issue(bytes32 assetId) external onlyRole(ISSUER_ROLE) {
        uint256 tokenId = tokenIdFor(assetId);
        if (_ownerOf(tokenId) != address(0)) revert CertificateAlreadyValid(assetId);

        address controller = registry.getAsset(assetId).controller;
        uint256 issueNumber = ++issuanceCount[assetId];
        _mint(controller, tokenId);
        emit CertificateIssued(assetId, tokenId, controller, issueNumber);
    }

    function invalidate(bytes32 assetId) external onlyRole(ISSUER_ROLE) {
        uint256 tokenId = tokenIdFor(assetId);
        address controller = _ownerOf(tokenId);
        if (controller == address(0)) revert CertificateNotValid(assetId);

        _burn(tokenId);
        emit CertificateInvalidated(assetId, tokenId, controller);
    }

    function tokenIdFor(bytes32 assetId) public pure returns (uint256) {
        return uint256(assetId);
    }

    function isValid(bytes32 assetId) public view returns (bool) {
        return _ownerOf(tokenIdFor(assetId)) != address(0);
    }

    function certificateOwner(bytes32 assetId) external view returns (address) {
        return _ownerOf(tokenIdFor(assetId));
    }

    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }
}
