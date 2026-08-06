// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {AssetRegistry} from "../src/AssetRegistry.sol";

contract AssetRegistryTest is Test {
    AssetRegistry internal registry;

    address internal admin = makeAddr("admin");
    address internal attestor = makeAddr("attestor");
    address internal company = makeAddr("company");
    address internal intruder = makeAddr("intruder");

    bytes32 internal constant ASSET_ID = keccak256("expediente-1");
    bytes32 internal constant MERKLE_ROOT = keccak256("root");
    bytes32 internal constant OWNER_ID_HASH = keccak256("owner");

    bytes32 internal attestorRole;
    bytes32 internal pauserRole;

    function setUp() public {
        registry = new AssetRegistry(admin);

        // Los roles se leen ANTES de cualquier vm.prank: `registry.X_ROLE()` es
        // una llamada y consumiria el prank, dejando el grantRole sin permisos.
        attestorRole = registry.ATTESTOR_ROLE();
        pauserRole = registry.PAUSER_ROLE();

        vm.prank(admin);
        registry.grantRole(attestorRole, attestor);
    }

    function _register() internal {
        vm.prank(company);
        registry.registerAsset(ASSET_ID, MERKLE_ROOT, OWNER_ID_HASH);
    }

    // ─── Ordinales ────────────────────────────────────────────────────────

    /// @dev Contrato entre lenguajes: TypeScript espeja estos ordinales en
    ///      `ASSET_STATUS_ORDINAL`. Reordenar el enum sin actualizar la tabla
    ///      hace que el indexer proyecte estados equivocados en silencio.
    function test_StatusOrdinalsAreFrozen() public pure {
        assertEq(uint8(AssetRegistry.Status.Registered), 0);
        assertEq(uint8(AssetRegistry.Status.Attested), 1);
        assertEq(uint8(AssetRegistry.Status.Pledged), 2);
        assertEq(uint8(AssetRegistry.Status.Funded), 3);
        assertEq(uint8(AssetRegistry.Status.Repaid), 4);
        assertEq(uint8(AssetRegistry.Status.Revoked), 5);
        assertEq(uint8(AssetRegistry.Status.Defaulted), 6);
        assertEq(uint8(AssetRegistry.Status.Executed), 7);
    }

    // ─── registerAsset ────────────────────────────────────────────────────

    function test_RegisterAssetStoresTheRootAndController() public {
        _register();

        AssetRegistry.Asset memory asset = registry.getAsset(ASSET_ID);
        assertEq(asset.merkleRoot, MERKLE_ROOT);
        assertEq(asset.ownerIdHash, OWNER_ID_HASH);
        assertEq(asset.controller, company, "el controller es quien firmo, no el backend");
        assertEq(uint8(asset.status), uint8(AssetRegistry.Status.Registered));
    }

    function test_RegisterAssetEmitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit AssetRegistry.AssetRegistered(
            ASSET_ID, company, MERKLE_ROOT, OWNER_ID_HASH, uint64(block.timestamp)
        );
        _register();
    }

    function test_RevertWhen_RegisteringTwice() public {
        _register();
        vm.prank(company);
        vm.expectRevert(
            abi.encodeWithSelector(AssetRegistry.AssetAlreadyRegistered.selector, ASSET_ID)
        );
        registry.registerAsset(ASSET_ID, MERKLE_ROOT, OWNER_ID_HASH);
    }

    /// @dev Un root vacio significaria un expediente sin evidencias. Registrarlo
    ///      dejaria un activo certificable que no prueba nada.
    function test_RevertWhen_MerkleRootIsEmpty() public {
        vm.prank(company);
        vm.expectRevert(AssetRegistry.EmptyMerkleRoot.selector);
        registry.registerAsset(ASSET_ID, bytes32(0), OWNER_ID_HASH);
    }

    function test_RevertWhen_AssetDoesNotExist() public {
        vm.expectRevert(abi.encodeWithSelector(AssetRegistry.AssetNotFound.selector, ASSET_ID));
        registry.getAsset(ASSET_ID);
    }

    function testFuzz_DistinctAssetIdsCoexist(bytes32 firstId, bytes32 secondId) public {
        vm.assume(firstId != secondId);

        vm.startPrank(company);
        registry.registerAsset(firstId, MERKLE_ROOT, OWNER_ID_HASH);
        registry.registerAsset(secondId, MERKLE_ROOT, OWNER_ID_HASH);
        vm.stopPrank();

        assertTrue(registry.exists(firstId));
        assertTrue(registry.exists(secondId));
    }

    // ─── Transiciones ─────────────────────────────────────────────────────

    function test_MarkAttestedMovesToAttested() public {
        _register();
        vm.prank(attestor);
        registry.markAttested(ASSET_ID);

        assertEq(uint8(registry.getAsset(ASSET_ID).status), uint8(AssetRegistry.Status.Attested));
    }

    function test_MarkAttestedIsIdempotent() public {
        _register();
        vm.startPrank(attestor);
        registry.markAttested(ASSET_ID);
        registry.markAttested(ASSET_ID);
        vm.stopPrank();

        assertEq(uint8(registry.getAsset(ASSET_ID).status), uint8(AssetRegistry.Status.Attested));
    }

    function test_MarkUnattestedReturnsToRegistered() public {
        _register();
        vm.startPrank(attestor);
        registry.markAttested(ASSET_ID);
        registry.markUnattested(ASSET_ID);
        vm.stopPrank();

        assertEq(uint8(registry.getAsset(ASSET_ID).status), uint8(AssetRegistry.Status.Registered));
    }

    function test_RevertWhen_UnattestingSomethingNotAttested() public {
        _register();
        vm.prank(attestor);
        vm.expectRevert(
            abi.encodeWithSelector(
                AssetRegistry.InvalidTransition.selector,
                AssetRegistry.Status.Registered,
                AssetRegistry.Status.Registered
            )
        );
        registry.markUnattested(ASSET_ID);
    }

    // ─── Roles ────────────────────────────────────────────────────────────

    /// @dev Sin esto cualquiera podria marcar un expediente como certificado y
    ///      la certificacion dejaria de significar nada.
    function test_RevertWhen_NonAttestorMarksAttested() public {
        _register();
        vm.prank(intruder);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, intruder, attestorRole
            )
        );
        registry.markAttested(ASSET_ID);
    }

    function test_RevertWhen_NonPauserPauses() public {
        vm.prank(intruder);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, intruder, pauserRole
            )
        );
        registry.pause();
    }

    // ─── Pausa ────────────────────────────────────────────────────────────

    function test_RevertWhen_RegisteringWhilePaused() public {
        vm.prank(admin);
        registry.pause();

        vm.prank(company);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        registry.registerAsset(ASSET_ID, MERKLE_ROOT, OWNER_ID_HASH);
    }

    function test_UnpauseRestoresRegistration() public {
        vm.startPrank(admin);
        registry.pause();
        registry.unpause();
        vm.stopPrank();

        _register();
        assertTrue(registry.exists(ASSET_ID));
    }

    /// @dev Leer sigue funcionando en pausa: congelar escrituras no puede
    ///      impedirle a un banco verificar un expediente ya certificado.
    function test_ReadsStillWorkWhilePaused() public {
        _register();
        vm.prank(admin);
        registry.pause();

        assertEq(registry.getAsset(ASSET_ID).merkleRoot, MERKLE_ROOT);
    }
}
