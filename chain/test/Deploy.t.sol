// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {Deploy} from "../script/Deploy.s.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {BorrowingBaseEngine} from "../src/BorrowingBaseEngine.sol";
import {CertificationAttestor} from "../src/CertificationAttestor.sol";
import {CollateralVault} from "../src/CollateralVault.sol";
import {ReceivableLeaf} from "../src/ReceivableLeaf.sol";

contract DeployTest is Test {
    uint64 internal constant VALUATION_DATE = 1_767_225_600;
    bytes32 internal constant ASSET_ID = keccak256("deployment-smoke");

    Deploy internal script;
    Deploy.Deployment internal deployment;
    address internal admin = makeAddr("admin");
    address internal borrower = makeAddr("borrower");
    address internal lender = makeAddr("lender");
    address[3] internal certifiers = [makeAddr("revenue"), makeAddr("rights"), makeAddr("service")];

    function setUp() public {
        vm.warp(VALUATION_DATE);
        script = new Deploy();
        deployment = script.deploy(
            Deploy.Config({
                admin: admin, borrower: borrower, lender: lender, certifiers: certifiers
            })
        );
    }

    function test_DeploysExactWiringAndLeastPrivilegeRoles() public view {
        assertEq(address(deployment.certificate.registry()), address(deployment.registry));
        assertEq(address(deployment.attestor.registry()), address(deployment.registry));
        assertEq(address(deployment.attestor.certificate()), address(deployment.certificate));
        assertEq(address(deployment.vault.registry()), address(deployment.registry));
        assertEq(address(deployment.vault.certificate()), address(deployment.certificate));
        assertEq(address(deployment.vault.engine()), address(deployment.engine));
        assertEq(address(deployment.vault.token()), address(deployment.usdc));

        assertTrue(deployment.registry.hasRole(deployment.registry.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(deployment.registry.hasRole(deployment.registry.PAUSER_ROLE(), admin));
        assertTrue(
            deployment.registry
                .hasRole(deployment.registry.ATTESTOR_ROLE(), address(deployment.attestor))
        );
        assertTrue(
            deployment.registry.hasRole(deployment.registry.VAULT_ROLE(), address(deployment.vault))
        );
        assertTrue(
            deployment.certificate
                .hasRole(deployment.certificate.ISSUER_ROLE(), address(deployment.attestor))
        );
        assertFalse(
            deployment.registry.hasRole(deployment.registry.DEFAULT_ADMIN_ROLE(), address(script))
        );
        assertFalse(deployment.registry.hasRole(deployment.registry.PAUSER_ROLE(), address(script)));
        assertFalse(
            deployment.certificate
                .hasRole(deployment.certificate.DEFAULT_ADMIN_ROLE(), address(script))
        );
        assertFalse(
            deployment.attestor.hasRole(deployment.attestor.DEFAULT_ADMIN_ROLE(), address(script))
        );
        assertFalse(deployment.certificate.hasRole(deployment.certificate.ISSUER_ROLE(), admin));
        assertFalse(deployment.attestor.hasRole(deployment.attestor.CERTIFIER_ROLE(), admin));
        for (uint256 i; i < 3; ++i) {
            assertTrue(
                deployment.attestor.hasRole(deployment.attestor.CERTIFIER_ROLE(), certifiers[i])
            );
        }
    }

    function test_RevertWhen_AnyTwoParticipantsOverlap() public {
        for (uint256 i; i < 7; ++i) {
            for (uint256 j = i + 1; j < 7; ++j) {
                address[7] memory participants = _participants();
                participants[j] = participants[i];
                vm.expectRevert(
                    abi.encodeWithSelector(Deploy.DuplicateParticipant.selector, participants[i])
                );
                script.deploy(_config(participants));
            }
        }
    }

    function test_RevertWhen_ChainIsUnsupported() public {
        vm.chainId(1);
        vm.expectRevert(abi.encodeWithSelector(Deploy.UnsupportedChain.selector, uint256(1)));
        script.deploy(_config(_participants()));
    }

    function test_LocalSmokeRegisterCertifyOriginateFundAndRepay() public {
        ReceivableLeaf.Data[] memory receivables = _receivables();
        vm.prank(borrower);
        deployment.registry
            .registerAsset(ASSET_ID, ReceivableLeaf.hash(receivables[0]), keccak256("owner"));

        for (uint256 i; i < 3; ++i) {
            vm.prank(certifiers[i]);
            deployment.attestor
                .attest(
                    ASSET_ID, CertificationAttestor.Kind(i), keccak256(abi.encode("certificate", i))
                );
        }
        assertTrue(deployment.certificate.isValid(ASSET_ID));

        uint128 principal = 400_000;
        vm.prank(borrower);
        deployment.vault
            .originate(
                ASSET_ID,
                lender,
                principal,
                uint64(block.timestamp + 30 days),
                receivables,
                new bytes32[](0),
                new bool[](0),
                _params()
            );

        deployment.usdc.mint(lender, 1_000_000);
        vm.prank(lender);
        deployment.usdc.approve(address(deployment.vault), principal);
        vm.prank(lender);
        deployment.vault.fund(ASSET_ID);
        assertEq(deployment.usdc.balanceOf(borrower), principal);

        vm.prank(borrower);
        deployment.usdc.approve(address(deployment.vault), principal);
        vm.prank(borrower);
        deployment.vault.repay(ASSET_ID);
        assertEq(deployment.usdc.balanceOf(lender), 1_000_000);
        assertEq(
            uint8(deployment.registry.getAsset(ASSET_ID).status), uint8(AssetRegistry.Status.Repaid)
        );
        assertEq(
            uint8(deployment.vault.getLoan(ASSET_ID).state), uint8(CollateralVault.State.Repaid)
        );
    }

    function _receivables() private pure returns (ReceivableLeaf.Data[] memory leaves) {
        leaves = new ReceivableLeaf.Data[](1);
        leaves[0] = ReceivableLeaf.Data({
            debtorHash: keccak256("debtor"),
            amountMinor: 1_000_000,
            dueDate: VALUATION_DATE + uint64(30 days),
            currency: 840,
            docHash: bytes32(uint256(1))
        });
    }

    function _params() private pure returns (BorrowingBaseEngine.Params memory) {
        return BorrowingBaseEngine.Params({
            valuationDate: VALUATION_DATE,
            discountRateBps: 0,
            delinquencyBps: 0,
            concentrationThresholdBps: 10_000,
            concentrationPenaltyBps: 0,
            serviceContinuityScore: 100,
            serviceContinuityWeightBps: 0,
            advanceRateBps: 5_000
        });
    }

    function _participants() private view returns (address[7] memory) {
        return
            [address(script), admin, borrower, lender, certifiers[0], certifiers[1], certifiers[2]];
    }

    function _config(address[7] memory participants) private pure returns (Deploy.Config memory) {
        return Deploy.Config({
            admin: participants[1],
            borrower: participants[2],
            lender: participants[3],
            certifiers: [participants[4], participants[5], participants[6]]
        });
    }
}
