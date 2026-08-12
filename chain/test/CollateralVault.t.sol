// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {AssetRegistry} from "../src/AssetRegistry.sol";
import {BorrowingBaseEngine} from "../src/BorrowingBaseEngine.sol";
import {CollateralVault} from "../src/CollateralVault.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {PAICertificate} from "../src/PAICertificate.sol";
import {ReceivableLeaf} from "../src/ReceivableLeaf.sol";

contract CollateralVaultTest is Test {
    AssetRegistry internal registry;
    BorrowingBaseEngine internal engine;
    CollateralVault internal vault;
    MockUSDC internal usdc;
    PAICertificate internal certificate;

    address internal admin = makeAddr("admin");
    address internal borrower = makeAddr("borrower");
    address internal lender = makeAddr("lender");
    address internal outsider = makeAddr("outsider");

    bytes32 internal constant ASSET_ID = keccak256("loan-asset");
    uint64 internal constant VALUATION_DATE = 1_767_225_600;
    uint128 internal constant PRINCIPAL = 400_000;
    uint64 internal dueAt;

    function setUp() public {
        vm.warp(VALUATION_DATE);
        registry = new AssetRegistry(admin);
        certificate = new PAICertificate(registry, admin);
        engine = new BorrowingBaseEngine();
        usdc = new MockUSDC();
        vault = new CollateralVault(registry, certificate, engine, usdc);
        dueAt = uint64(block.timestamp + 30 days);

        ReceivableLeaf.Data[] memory receivables = _receivables();
        vm.prank(borrower);
        registry.registerAsset(ASSET_ID, ReceivableLeaf.hash(receivables[0]), keccak256("owner"));

        vm.startPrank(admin);
        registry.grantRole(registry.ATTESTOR_ROLE(), admin);
        registry.grantRole(registry.VAULT_ROLE(), address(vault));
        certificate.grantRole(certificate.ISSUER_ROLE(), admin);
        registry.markAttested(ASSET_ID);
        certificate.issue(ASSET_ID);
        vm.stopPrank();

        usdc.mint(lender, 2_000_000);
        usdc.mint(borrower, 500_000);
        vm.prank(lender);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(borrower);
        usdc.approve(address(vault), type(uint256).max);
    }

    function test_OriginateFundAndRepayPrincipalWithoutFees() public {
        assertEq(usdc.decimals(), 6);
        _originate(PRINCIPAL);

        vm.prank(lender);
        vault.fund(ASSET_ID);
        assertEq(usdc.balanceOf(borrower), 900_000);
        assertEq(uint8(registry.getAsset(ASSET_ID).status), uint8(AssetRegistry.Status.Funded));

        vm.prank(borrower);
        vault.repay(ASSET_ID);
        assertEq(usdc.balanceOf(lender), 2_000_000);
        assertEq(uint8(registry.getAsset(ASSET_ID).status), uint8(AssetRegistry.Status.Attested));
        assertEq(uint8(vault.getLoan(ASSET_ID).state), uint8(CollateralVault.State.Repaid));
        assertTrue(certificate.isValid(ASSET_ID));
    }

    function test_RevertWhen_NonBorrowerRepays() public {
        _originate(PRINCIPAL);
        vm.prank(lender);
        vault.fund(ASSET_ID);

        vm.prank(outsider);
        vm.expectRevert(CollateralVault.NotController.selector);
        vault.repay(ASSET_ID);

        assertEq(uint8(registry.getAsset(ASSET_ID).status), uint8(AssetRegistry.Status.Funded));
        assertEq(uint8(vault.getLoan(ASSET_ID).state), uint8(CollateralVault.State.Funded));
    }

    function test_RevertWhen_MarkingRepaidOutsideFundedTransition() public {
        vm.prank(address(vault));
        vm.expectRevert(
            abi.encodeWithSelector(
                AssetRegistry.InvalidTransition.selector,
                AssetRegistry.Status.Attested,
                AssetRegistry.Status.Attested
            )
        );
        registry.markRepaid(ASSET_ID);
    }

    // El techo del principal ya no se prueba acá: vive en
    // `test_RevertWhen_PrincipalExceedsTheBaseInTokenUnits`, que lo mide en la
    // unidad correcta. Este test se queda solo con la divulgación.
    function test_RevertWhen_DisclosureDoesNotMatchRoot() public {
        ReceivableLeaf.Data[] memory receivables = _receivables();
        receivables[0].amountMinor += 1;
        vm.expectRevert(CollateralVault.InvalidDisclosure.selector);
        _callOriginate(borrower, PRINCIPAL, receivables);
    }

    function test_RequiresControllerAndValidCertificate() public {
        vm.expectRevert(CollateralVault.NotController.selector);
        _callOriginate(outsider, PRINCIPAL, _receivables());

        vm.prank(admin);
        certificate.invalidate(ASSET_ID);
        vm.expectRevert(CollateralVault.InvalidCertificate.selector);
        _callOriginate(borrower, PRINCIPAL, _receivables());
    }

    function test_DefaultOnlyAfterDueAndTerminalStatesCannotRepeat() public {
        _originate(PRINCIPAL);
        vm.prank(lender);
        vault.fund(ASSET_ID);

        vm.prank(lender);
        vm.expectRevert(CollateralVault.NotDue.selector);
        vault.declareDefault(ASSET_ID);

        vm.warp(dueAt + 1);
        vm.prank(lender);
        vault.declareDefault(ASSET_ID);
        assertEq(uint8(registry.getAsset(ASSET_ID).status), uint8(AssetRegistry.Status.Defaulted));

        vm.prank(lender);
        vm.expectRevert(CollateralVault.InvalidState.selector);
        vault.declareDefault(ASSET_ID);
        vm.prank(borrower);
        vm.expectRevert(CollateralVault.InvalidState.selector);
        vault.repay(ASSET_ID);
    }

    function test_OnlyLenderFundsAndOnlyOneLoanExists() public {
        vm.prank(outsider);
        vm.expectRevert();
        registry.markPledged(ASSET_ID);

        _originate(PRINCIPAL);
        vm.prank(borrower);
        vm.expectRevert(CollateralVault.NotLender.selector);
        vault.fund(ASSET_ID);

        vm.expectRevert(CollateralVault.LoanAlreadyExists.selector);
        _callOriginate(borrower, PRINCIPAL, _receivables());
    }

    function test_CertificationLossDoesNotOverwritePledgedLifecycle() public {
        _originate(PRINCIPAL);
        vm.prank(admin);
        registry.markUnattested(ASSET_ID);
        assertEq(uint8(registry.getAsset(ASSET_ID).status), uint8(AssetRegistry.Status.Pledged));
    }

    /// @dev La base prestable del fixture: una cuota de 1_000_000 centavos con
    ///      advance rate 50% y descuentos en cero = 500_000 centavos = USD 5.000,00.
    uint256 internal constant BORROWING_BASE_MINOR = 500_000;
    /// @dev Los mismos USD 5.000,00 en unidades del token de 6 decimales.
    uint128 internal constant BORROWING_BASE_TOKEN_UNITS = 5_000_000_000;

    /// El techo del préstamo se mide en unidades del token, no en centavos.
    ///
    /// `amountMinor` son centavos (2 decimales) y MockUSDC tiene 6: comparar el
    /// principal contra `borrowingBaseMinor` sin escalar deja pasar un préstamo
    /// 10.000 veces menor de lo que el colateral respalda, y `fund` transfiere
    /// exactamente ese monto encogido.
    function test_PrincipalCeilingIsDenominatedInTokenUnits() public {
        assertEq(usdc.decimals(), 6);
        usdc.mint(lender, BORROWING_BASE_TOKEN_UNITS);

        _originate(BORROWING_BASE_TOKEN_UNITS);
        uint256 borrowerBefore = usdc.balanceOf(borrower);
        vm.prank(lender);
        vault.fund(ASSET_ID);

        assertEq(usdc.balanceOf(borrower) - borrowerBefore, BORROWING_BASE_TOKEN_UNITS);
    }

    function test_RevertWhen_PrincipalExceedsTheBaseInTokenUnits() public {
        usdc.mint(lender, BORROWING_BASE_TOKEN_UNITS + 1);

        vm.prank(borrower);
        vm.expectRevert(CollateralVault.PrincipalExceedsBorrowingBase.selector);
        vault.originate(
            ASSET_ID,
            lender,
            BORROWING_BASE_TOKEN_UNITS + 1,
            dueAt,
            _receivables(),
            new bytes32[](0),
            new bool[](0),
            _params()
        );
    }

    function _originate(uint128 principal) internal {
        _callOriginate(borrower, principal, _receivables());
    }

    function _callOriginate(
        address caller,
        uint128 principal,
        ReceivableLeaf.Data[] memory receivables
    ) internal {
        vm.prank(caller);
        vault.originate(
            ASSET_ID,
            lender,
            principal,
            dueAt,
            receivables,
            new bytes32[](0),
            new bool[](0),
            _params()
        );
    }

    function _receivables() internal pure returns (ReceivableLeaf.Data[] memory leaves) {
        leaves = new ReceivableLeaf.Data[](1);
        leaves[0] = ReceivableLeaf.Data({
            debtorHash: keccak256("debtor"),
            amountMinor: 1_000_000,
            dueDate: VALUATION_DATE + uint64(30 days),
            currency: 840,
            docHash: bytes32(uint256(1))
        });
    }

    function _params() internal pure returns (BorrowingBaseEngine.Params memory) {
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
}
