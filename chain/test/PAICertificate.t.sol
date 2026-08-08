// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {AssetRegistry} from "../src/AssetRegistry.sol";
import {CertificationAttestor} from "../src/CertificationAttestor.sol";
import {PAICertificate} from "../src/PAICertificate.sol";

contract PAICertificateTest is Test {
    AssetRegistry internal registry;
    CertificationAttestor internal attestor;
    PAICertificate internal certificate;

    address internal admin = makeAddr("admin");
    address internal company = makeAddr("company");
    address internal accountant = makeAddr("accountant");
    address internal lawyer = makeAddr("lawyer");
    address internal auditor = makeAddr("auditor");
    address internal recipient = makeAddr("recipient");
    address internal intruder = makeAddr("intruder");

    bytes32 internal constant ASSET_ID = keccak256("certificate-asset");
    bytes32 internal constant MERKLE_ROOT = keccak256("root");
    bytes32 internal constant OWNER_ID_HASH = keccak256("owner");
    bytes32 internal constant CERTIFICATE_HASH = keccak256("report");

    function setUp() public {
        registry = new AssetRegistry(admin);
        certificate = new PAICertificate(registry, admin);
        attestor = new CertificationAttestor(registry, certificate, admin);

        vm.startPrank(admin);
        registry.grantRole(registry.ATTESTOR_ROLE(), address(attestor));
        certificate.grantRole(certificate.ISSUER_ROLE(), address(attestor));
        attestor.grantRole(attestor.CERTIFIER_ROLE(), accountant);
        attestor.grantRole(attestor.CERTIFIER_ROLE(), lawyer);
        attestor.grantRole(attestor.CERTIFIER_ROLE(), auditor);
        vm.stopPrank();

        vm.prank(company);
        registry.registerAsset(ASSET_ID, MERKLE_ROOT, OWNER_ID_HASH);
    }

    function _attest(address certifier, CertificationAttestor.Kind kind) internal {
        vm.prank(certifier);
        attestor.attest(ASSET_ID, kind, CERTIFICATE_HASH);
    }

    function _completeCertification() internal {
        _attest(accountant, CertificationAttestor.Kind.RevenueVerified);
        _attest(lawyer, CertificationAttestor.Kind.RightsAssignable);
        _attest(auditor, CertificationAttestor.Kind.ServiceContinuity);
    }

    function test_IssuesDeterministicCertificateOnlyAfterCompleteness() public {
        uint256 tokenId = uint256(ASSET_ID);
        assertEq(certificate.tokenIdFor(ASSET_ID), tokenId);

        _attest(accountant, CertificationAttestor.Kind.RevenueVerified);
        _attest(lawyer, CertificationAttestor.Kind.RightsAssignable);
        assertFalse(certificate.isValid(ASSET_ID));

        vm.expectEmit(true, true, true, true);
        emit PAICertificate.CertificateIssued(ASSET_ID, tokenId, company, 1);
        _attest(auditor, CertificationAttestor.Kind.ServiceContinuity);

        assertTrue(certificate.isValid(ASSET_ID));
        assertEq(certificate.certificateOwner(ASSET_ID), company);
        assertEq(certificate.ownerOf(tokenId), company);
        assertEq(certificate.issuanceCount(ASSET_ID), 1);
    }

    function test_SoulboundCertificateRejectsTransfersAndApprovals() public {
        _completeCertification();
        uint256 tokenId = certificate.tokenIdFor(ASSET_ID);

        vm.startPrank(company);
        vm.expectRevert(PAICertificate.Soulbound.selector);
        certificate.approve(recipient, tokenId);
        vm.expectRevert(PAICertificate.Soulbound.selector);
        certificate.setApprovalForAll(recipient, true);
        vm.expectRevert(PAICertificate.Soulbound.selector);
        certificate.transferFrom(company, recipient, tokenId);
        vm.expectRevert(PAICertificate.Soulbound.selector);
        certificate.safeTransferFrom(company, recipient, tokenId);
        vm.stopPrank();

        assertEq(certificate.ownerOf(tokenId), company);
    }

    function test_RevocationInvalidatesAndCompletenessCanReissue() public {
        _completeCertification();
        uint256 tokenId = certificate.tokenIdFor(ASSET_ID);

        vm.expectEmit(true, true, true, true);
        emit PAICertificate.CertificateInvalidated(ASSET_ID, tokenId, company);
        vm.prank(auditor);
        attestor.revoke(ASSET_ID, CertificationAttestor.Kind.ServiceContinuity);

        assertFalse(certificate.isValid(ASSET_ID));
        assertEq(certificate.certificateOwner(ASSET_ID), address(0));
        vm.expectRevert();
        certificate.ownerOf(tokenId);

        _attest(auditor, CertificationAttestor.Kind.ServiceContinuity);
        assertTrue(certificate.isValid(ASSET_ID));
        assertEq(certificate.ownerOf(tokenId), company);
        assertEq(certificate.issuanceCount(ASSET_ID), 2);
    }

    function test_RevertWhen_NonIssuerMintsOrInvalidates() public {
        bytes32 issuerRole = certificate.ISSUER_ROLE();

        vm.startPrank(intruder);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, intruder, issuerRole
            )
        );
        certificate.issue(ASSET_ID);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, intruder, issuerRole
            )
        );
        certificate.invalidate(ASSET_ID);
        vm.stopPrank();
    }
}
