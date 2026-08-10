// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {AssetRegistry} from "../src/AssetRegistry.sol";
import {CertificationAttestor} from "../src/CertificationAttestor.sol";
import {PAICertificate} from "../src/PAICertificate.sol";

contract CertificationAttestorTest is Test {
    AssetRegistry internal registry;
    CertificationAttestor internal attestor;
    PAICertificate internal certificate;

    address internal admin = makeAddr("admin");
    address internal company = makeAddr("company");
    address internal accountant = makeAddr("accountant");
    address internal lawyer = makeAddr("lawyer");
    address internal auditor = makeAddr("auditor");
    address internal backupAuditor = makeAddr("backupAuditor");
    address internal intruder = makeAddr("intruder");

    bytes32 internal constant ASSET_ID = keccak256("expediente-1");
    bytes32 internal constant MERKLE_ROOT = keccak256("root");
    bytes32 internal constant OWNER_ID_HASH = keccak256("owner");
    bytes32 internal constant CERTIFICATE_HASH = keccak256("informe");

    bytes32 internal certifierRole;

    function setUp() public {
        registry = new AssetRegistry(admin);
        certificate = new PAICertificate(registry, admin);
        attestor = new CertificationAttestor(registry, certificate, admin);

        // Los roles se leen antes de cualquier prank: son llamadas y lo consumen.
        certifierRole = attestor.CERTIFIER_ROLE();
        bytes32 attestorRole = registry.ATTESTOR_ROLE();

        vm.startPrank(admin);
        // El rol lo tiene el CONTRATO, no una persona: es el unico camino por
        // el que el estado del expediente puede cambiar por certificacion.
        registry.grantRole(attestorRole, address(attestor));
        certificate.grantRole(certificate.ISSUER_ROLE(), address(attestor));
        attestor.grantRole(certifierRole, accountant);
        attestor.grantRole(certifierRole, lawyer);
        attestor.grantRole(certifierRole, auditor);
        attestor.grantRole(certifierRole, backupAuditor);
        vm.stopPrank();

        vm.prank(company);
        registry.registerAsset(ASSET_ID, MERKLE_ROOT, OWNER_ID_HASH);
    }

    function _attest(address certifier, CertificationAttestor.Kind kind) internal {
        vm.prank(certifier);
        attestor.attest(ASSET_ID, kind, CERTIFICATE_HASH);
    }

    function test_RevertWhen_CertificateUsesDifferentRegistry() public {
        AssetRegistry otherRegistry = new AssetRegistry(admin);
        PAICertificate mismatchedCertificate = new PAICertificate(otherRegistry, admin);

        vm.expectRevert(
            abi.encodeWithSelector(
                CertificationAttestor.CertificateRegistryMismatch.selector,
                address(registry),
                address(otherRegistry)
            )
        );
        new CertificationAttestor(registry, mismatchedCertificate, admin);
    }

    // ─── Ordinales ────────────────────────────────────────────────────────

    /// @dev Espejados en `AttestationKind` del puerto TypeScript.
    function test_KindOrdinalsAreFrozen() public pure {
        assertEq(uint8(CertificationAttestor.Kind.RevenueVerified), 0);
        assertEq(uint8(CertificationAttestor.Kind.RightsAssignable), 1);
        assertEq(uint8(CertificationAttestor.Kind.ServiceContinuity), 2);
    }

    // ─── attest ───────────────────────────────────────────────────────────

    function test_OneCertificationKindDoesNotMoveTheAssetToAttested() public {
        _attest(accountant, CertificationAttestor.Kind.RevenueVerified);

        assertEq(uint8(registry.getAsset(ASSET_ID).status), uint8(AssetRegistry.Status.Registered));
        assertTrue(
            attestor.isActive(ASSET_ID, CertificationAttestor.Kind.RevenueVerified, accountant)
        );
    }

    function test_AttestEmitsEvent() public {
        vm.expectEmit(true, true, true, true);
        emit CertificationAttestor.Attested(
            ASSET_ID,
            CertificationAttestor.Kind.RevenueVerified,
            accountant,
            CERTIFICATE_HASH,
            uint64(block.timestamp)
        );
        _attest(accountant, CertificationAttestor.Kind.RevenueVerified);
    }

    /// @dev Ningun certificador ve todo: esa separacion es lo que hace creible
    ///      el resultado. Las tres atestaciones son independientes.
    function test_ThreeCertifiersAttestIndependently() public {
        _attest(accountant, CertificationAttestor.Kind.RevenueVerified);
        _attest(lawyer, CertificationAttestor.Kind.RightsAssignable);
        _attest(auditor, CertificationAttestor.Kind.ServiceContinuity);

        assertEq(attestor.activeCount(ASSET_ID), 3);
        assertEq(uint8(registry.getAsset(ASSET_ID).status), uint8(AssetRegistry.Status.Attested));
    }

    /// @dev Dos certificadores pueden atestar el mismo tipo: son opiniones
    ///      independientes y eso es deseable, no un error.
    function test_TwoCertifiersCanAttestTheSameKind() public {
        _attest(accountant, CertificationAttestor.Kind.RevenueVerified);
        _attest(lawyer, CertificationAttestor.Kind.RevenueVerified);

        assertEq(attestor.activeCount(ASSET_ID), 2);
        assertEq(uint8(registry.getAsset(ASSET_ID).status), uint8(AssetRegistry.Status.Registered));
    }

    function test_RevertWhen_CertifierAttestsAnotherKindWhileFirstIsActive() public {
        _attest(accountant, CertificationAttestor.Kind.RevenueVerified);

        vm.prank(accountant);
        vm.expectRevert(
            abi.encodeWithSelector(
                CertificationAttestor.CertifierAlreadyActiveForAsset.selector, ASSET_ID, accountant
            )
        );
        attestor.attest(ASSET_ID, CertificationAttestor.Kind.RightsAssignable, CERTIFICATE_HASH);
    }

    function test_CertifierCanAttestAnotherKindAfterRevokingTheFirst() public {
        _attest(accountant, CertificationAttestor.Kind.RevenueVerified);

        vm.startPrank(accountant);
        attestor.revoke(ASSET_ID, CertificationAttestor.Kind.RevenueVerified);
        attestor.attest(ASSET_ID, CertificationAttestor.Kind.RightsAssignable, CERTIFICATE_HASH);
        vm.stopPrank();

        assertTrue(
            attestor.isActive(ASSET_ID, CertificationAttestor.Kind.RightsAssignable, accountant)
        );
    }

    function test_MultipleAttestationsOfOneKindCannotSubstituteForMissingKinds() public {
        _attest(accountant, CertificationAttestor.Kind.RevenueVerified);
        _attest(lawyer, CertificationAttestor.Kind.RevenueVerified);
        _attest(auditor, CertificationAttestor.Kind.RightsAssignable);

        assertEq(attestor.activeCount(ASSET_ID), 3);
        assertEq(uint8(registry.getAsset(ASSET_ID).status), uint8(AssetRegistry.Status.Registered));
    }

    function test_RevertWhen_AttestingTwiceTheSameKindAndCertifier() public {
        _attest(accountant, CertificationAttestor.Kind.RevenueVerified);

        vm.prank(accountant);
        vm.expectRevert(
            abi.encodeWithSelector(
                CertificationAttestor.AlreadyAttested.selector,
                ASSET_ID,
                CertificationAttestor.Kind.RevenueVerified,
                accountant
            )
        );
        attestor.attest(ASSET_ID, CertificationAttestor.Kind.RevenueVerified, CERTIFICATE_HASH);
    }

    function test_RevertWhen_AssetIsNotRegistered() public {
        bytes32 unknownId = keccak256("no-existe");
        vm.prank(accountant);
        vm.expectRevert(
            abi.encodeWithSelector(CertificationAttestor.AssetNotRegistered.selector, unknownId)
        );
        attestor.attest(unknownId, CertificationAttestor.Kind.RevenueVerified, CERTIFICATE_HASH);
    }

    /// @dev Un hash vacio seria una atestacion sin informe detras: firmada,
    ///      fechada y sin nada que auditar.
    function test_RevertWhen_CertificateHashIsEmpty() public {
        vm.prank(accountant);
        vm.expectRevert(CertificationAttestor.EmptyCertificateHash.selector);
        attestor.attest(ASSET_ID, CertificationAttestor.Kind.RevenueVerified, bytes32(0));
    }

    /// @dev Sin el rol, cualquiera podria certificar y la certificacion dejaria
    ///      de valer. Es el guardia mas importante del contrato.
    function test_RevertWhen_CallerIsNotCertifier() public {
        vm.prank(intruder);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, intruder, certifierRole
            )
        );
        attestor.attest(ASSET_ID, CertificationAttestor.Kind.RevenueVerified, CERTIFICATE_HASH);
    }

    // ─── revoke ───────────────────────────────────────────────────────────

    function test_RevokeMarksItWithoutDeletingHistory() public {
        _attest(accountant, CertificationAttestor.Kind.RevenueVerified);

        vm.prank(accountant);
        attestor.revoke(ASSET_ID, CertificationAttestor.Kind.RevenueVerified);

        CertificationAttestor.Attestation memory a = attestor.getAttestation(
            ASSET_ID, CertificationAttestor.Kind.RevenueVerified, accountant
        );
        assertTrue(a.exists, "la atestacion no se borra: el historial es evidencia");
        assertGt(a.revokedAt, 0);
        assertEq(a.certificateHash, CERTIFICATE_HASH);
    }

    function testFuzz_RevokingTheLastActiveOfAnyRequiredKindReturnsAssetToRegistered(uint8 kindSeed)
        public
    {
        _attest(accountant, CertificationAttestor.Kind.RevenueVerified);
        _attest(lawyer, CertificationAttestor.Kind.RightsAssignable);
        _attest(auditor, CertificationAttestor.Kind.ServiceContinuity);

        CertificationAttestor.Kind kind = CertificationAttestor.Kind(bound(kindSeed, 0, 2));
        address certifier = kind == CertificationAttestor.Kind.RevenueVerified
            ? accountant
            : kind == CertificationAttestor.Kind.RightsAssignable ? lawyer : auditor;

        vm.prank(certifier);
        attestor.revoke(ASSET_ID, kind);

        assertEq(uint8(registry.getAsset(ASSET_ID).status), uint8(AssetRegistry.Status.Registered));
    }

    function test_RevokingOneOfMultipleActiveAttestationsForTheSameKindPreservesCompleteness()
        public
    {
        _attest(accountant, CertificationAttestor.Kind.RevenueVerified);
        _attest(lawyer, CertificationAttestor.Kind.RevenueVerified);
        _attest(auditor, CertificationAttestor.Kind.RightsAssignable);
        _attest(backupAuditor, CertificationAttestor.Kind.ServiceContinuity);

        vm.prank(accountant);
        attestor.revoke(ASSET_ID, CertificationAttestor.Kind.RevenueVerified);

        assertEq(uint8(registry.getAsset(ASSET_ID).status), uint8(AssetRegistry.Status.Attested));
        assertEq(attestor.activeCount(ASSET_ID), 3);
    }

    /// @dev Un certificador solo revoca lo que el mismo firmo. Si pudiera
    ///      revocar lo ajeno, cualquiera con el rol tumbaria un expediente.
    function test_RevertWhen_RevokingSomeoneElsesAttestation() public {
        _attest(accountant, CertificationAttestor.Kind.RevenueVerified);

        vm.prank(lawyer);
        vm.expectRevert(
            abi.encodeWithSelector(
                CertificationAttestor.NoActiveAttestation.selector,
                ASSET_ID,
                CertificationAttestor.Kind.RevenueVerified,
                lawyer
            )
        );
        attestor.revoke(ASSET_ID, CertificationAttestor.Kind.RevenueVerified);
    }

    function test_RevertWhen_RevokingTwice() public {
        _attest(accountant, CertificationAttestor.Kind.RevenueVerified);

        vm.startPrank(accountant);
        attestor.revoke(ASSET_ID, CertificationAttestor.Kind.RevenueVerified);
        vm.expectRevert(
            abi.encodeWithSelector(
                CertificationAttestor.NoActiveAttestation.selector,
                ASSET_ID,
                CertificationAttestor.Kind.RevenueVerified,
                accountant
            )
        );
        attestor.revoke(ASSET_ID, CertificationAttestor.Kind.RevenueVerified);
        vm.stopPrank();
    }

    /// @dev Se puede volver a certificar despues de revocar: el certificador
    ///      corrige y vuelve a firmar, con fecha nueva.
    function test_CanReattestAfterRevoking() public {
        _attest(accountant, CertificationAttestor.Kind.RevenueVerified);
        _attest(lawyer, CertificationAttestor.Kind.RightsAssignable);
        _attest(auditor, CertificationAttestor.Kind.ServiceContinuity);

        vm.startPrank(accountant);
        attestor.revoke(ASSET_ID, CertificationAttestor.Kind.RevenueVerified);
        attestor.attest(ASSET_ID, CertificationAttestor.Kind.RevenueVerified, CERTIFICATE_HASH);
        vm.stopPrank();

        assertEq(attestor.activeCount(ASSET_ID), 3);
        assertEq(uint8(registry.getAsset(ASSET_ID).status), uint8(AssetRegistry.Status.Attested));
    }

    // ─── Camino completo del caso ─────────────────────────────────────────

    /// @dev Dias 2-7 del caso Contafacil: tres certificadores firman desde tres
    ///      wallets distintas, y despues uno revoca. Sin los tres tipos
    ///      vigentes, el expediente deja de estar certificado.
    function test_FullCertificationJourney() public {
        _attest(accountant, CertificationAttestor.Kind.RevenueVerified);
        _attest(lawyer, CertificationAttestor.Kind.RightsAssignable);
        _attest(auditor, CertificationAttestor.Kind.ServiceContinuity);

        assertEq(uint8(registry.getAsset(ASSET_ID).status), uint8(AssetRegistry.Status.Attested));

        vm.prank(auditor);
        attestor.revoke(ASSET_ID, CertificationAttestor.Kind.ServiceContinuity);

        assertEq(attestor.activeCount(ASSET_ID), 2);
        assertEq(uint8(registry.getAsset(ASSET_ID).status), uint8(AssetRegistry.Status.Registered));
        assertFalse(
            attestor.isActive(ASSET_ID, CertificationAttestor.Kind.ServiceContinuity, auditor)
        );
    }
}
