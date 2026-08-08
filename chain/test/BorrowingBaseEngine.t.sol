// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {BorrowingBaseEngine} from "../src/BorrowingBaseEngine.sol";

contract BorrowingBaseEngineTest is Test {
    uint256 internal constant LEAF_COUNT = 16;

    BorrowingBaseEngine internal engine;
    string internal vectors;

    function setUp() public {
        engine = new BorrowingBaseEngine();
        vectors = vm.readFile("../packages/borrowing-base/fixtures/golden-vectors.json");
    }

    function test_GoldenVectorsMatchNormativeTypeScriptEngine() public view {
        BorrowingBaseEngine.Result memory result = engine.compute(_goldenLeaves(), _goldenParams());

        assertEq(
            result.disclosedNominalMinor,
            vm.parseUint(vm.parseJsonString(vectors, ".expected.disclosedNominalMinor"))
        );
        assertEq(
            result.riskAdjustedMinor,
            vm.parseUint(vm.parseJsonString(vectors, ".expected.riskAdjustedMinor"))
        );
        assertEq(
            result.borrowingBaseMinor,
            vm.parseUint(vm.parseJsonString(vectors, ".expected.borrowingBaseMinor"))
        );
        assertEq(
            result.timeDiscountMinor, _expectedBreakdown(0), "time discount differs from TypeScript"
        );
        assertEq(result.delinquencyMinor, _expectedBreakdown(1), "delinquency differs");
        assertEq(result.concentrationMinor, _expectedBreakdown(2), "concentration differs");
        assertEq(result.serviceContinuityMinor, _expectedBreakdown(3), "service continuity differs");
        assertEq(result.currency, 840, "currency semantics were not preserved");
    }

    function test_RevertWhen_LeavesAreEmpty() public {
        BorrowingBaseEngine.Receivable[] memory leaves = new BorrowingBaseEngine.Receivable[](0);
        vm.expectRevert(BorrowingBaseEngine.EmptyLeaves.selector);
        engine.compute(leaves, _goldenParams());
    }

    function test_RevertWhen_CurrenciesAreMixed() public {
        BorrowingBaseEngine.Receivable[] memory leaves = _twoLeaves();
        leaves[1].currency = 604;

        vm.expectRevert(
            abi.encodeWithSelector(BorrowingBaseEngine.MixedCurrency.selector, uint16(840), 604)
        );
        engine.compute(leaves, _goldenParams());
    }

    function test_RevertWhen_AnyPercentageExceedsOneHundredPercent() public {
        BorrowingBaseEngine.Receivable[] memory leaves = _twoLeaves();
        for (uint256 field; field < 6; ++field) {
            BorrowingBaseEngine.Params memory params = _goldenParams();
            bytes32 fieldName;
            if (field == 0) {
                params.discountRateBps = 10_001;
                fieldName = "discountRateBps";
            } else if (field == 1) {
                params.delinquencyBps = 10_001;
                fieldName = "delinquencyBps";
            } else if (field == 2) {
                params.concentrationThresholdBps = 10_001;
                fieldName = "concentrationThresholdBps";
            } else if (field == 3) {
                params.concentrationPenaltyBps = 10_001;
                fieldName = "concentrationPenaltyBps";
            } else if (field == 4) {
                params.serviceContinuityWeightBps = 10_001;
                fieldName = "serviceContinuityWeightBps";
            } else {
                params.advanceRateBps = 10_001;
                fieldName = "advanceRateBps";
            }

            vm.expectRevert(
                abi.encodeWithSelector(BorrowingBaseEngine.InvalidBps.selector, fieldName, 10_001)
            );
            engine.compute(leaves, params);
        }
    }

    function test_RevertWhen_ServiceScoreIsInvalid() public {
        BorrowingBaseEngine.Params memory params = _goldenParams();
        params.serviceContinuityScore = 101;

        vm.expectRevert(
            abi.encodeWithSelector(BorrowingBaseEngine.InvalidServiceContinuityScore.selector, 101)
        );
        engine.compute(_twoLeaves(), params);
    }

    function test_RevertWhen_ValuationDateIsNotPositiveMidnightUtc() public {
        BorrowingBaseEngine.Params memory params = _goldenParams();
        params.valuationDate = 0;
        vm.expectRevert(
            abi.encodeWithSelector(BorrowingBaseEngine.InvalidValuationDate.selector, 0)
        );
        engine.compute(_twoLeaves(), params);

        params.valuationDate = 1_767_225_601;
        vm.expectRevert(
            abi.encodeWithSelector(BorrowingBaseEngine.InvalidValuationDate.selector, 1_767_225_601)
        );
        engine.compute(_twoLeaves(), params);
    }

    function test_TimeDiscountSaturatesAtTheRemainingNominal() public view {
        BorrowingBaseEngine.Receivable[] memory leaves = new BorrowingBaseEngine.Receivable[](1);
        BorrowingBaseEngine.Params memory params = _goldenParams();
        leaves[0] = BorrowingBaseEngine.Receivable({
            debtorHash: keccak256("debtor"),
            amountMinor: 100,
            dueDate: params.valuationDate + uint64(730 days),
            currency: 840
        });
        params.discountRateBps = 10_000;
        params.delinquencyBps = 0;
        params.concentrationPenaltyBps = 0;
        params.serviceContinuityWeightBps = 0;
        params.advanceRateBps = 10_000;

        BorrowingBaseEngine.Result memory result = engine.compute(leaves, params);
        assertEq(result.timeDiscountMinor, 100);
        assertEq(result.delinquencyMinor, 0);
        assertEq(result.concentrationMinor, 0);
        assertEq(result.serviceContinuityMinor, 0);
        assertEq(result.riskAdjustedMinor, 0);
    }

    function testFuzz_ResultNeverExceedsNominal(
        uint128 amount,
        uint16 delinquencyBps,
        uint16 advanceRateBps,
        uint8 serviceScore
    ) public view {
        amount = uint128(bound(amount, 1, type(uint96).max));
        delinquencyBps = uint16(bound(delinquencyBps, 0, 10_000));
        advanceRateBps = uint16(bound(advanceRateBps, 0, 10_000));
        serviceScore = uint8(bound(serviceScore, 0, 100));

        BorrowingBaseEngine.Receivable[] memory leaves = new BorrowingBaseEngine.Receivable[](1);
        leaves[0] = BorrowingBaseEngine.Receivable({
            debtorHash: keccak256("debtor"),
            amountMinor: amount,
            dueDate: 1_777_593_600,
            currency: 840
        });
        BorrowingBaseEngine.Params memory params = _goldenParams();
        params.delinquencyBps = delinquencyBps;
        params.advanceRateBps = advanceRateBps;
        params.serviceContinuityScore = serviceScore;

        BorrowingBaseEngine.Result memory result = engine.compute(leaves, params);
        uint256 deductions = result.timeDiscountMinor + result.delinquencyMinor
            + result.concentrationMinor + result.serviceContinuityMinor;
        assertEq(deductions, result.disclosedNominalMinor - result.riskAdjustedMinor);
        assertLe(result.borrowingBaseMinor, result.riskAdjustedMinor);
        assertLe(result.riskAdjustedMinor, result.disclosedNominalMinor);
    }

    function _goldenLeaves()
        internal
        view
        returns (BorrowingBaseEngine.Receivable[] memory leaves)
    {
        leaves = new BorrowingBaseEngine.Receivable[](LEAF_COUNT);
        for (uint256 i; i < LEAF_COUNT; ++i) {
            string memory base = string.concat(".leaves[", vm.toString(i), "]");
            leaves[i] = BorrowingBaseEngine.Receivable({
                debtorHash: vm.parseJsonBytes32(vectors, string.concat(base, ".debtorHash")),
                amountMinor: uint128(
                    vm.parseUint(vm.parseJsonString(vectors, string.concat(base, ".amountMinor")))
                ),
                dueDate: uint64(vm.parseJsonUint(vectors, string.concat(base, ".dueDate"))),
                currency: uint16(vm.parseJsonUint(vectors, string.concat(base, ".currency")))
            });
        }
    }

    function _goldenParams() internal view returns (BorrowingBaseEngine.Params memory) {
        return BorrowingBaseEngine.Params({
            valuationDate: uint64(vm.parseJsonUint(vectors, ".params.valuationDate")),
            discountRateBps: uint32(vm.parseJsonUint(vectors, ".params.discountRateBps")),
            delinquencyBps: uint16(vm.parseJsonUint(vectors, ".params.delinquencyBps")),
            concentrationThresholdBps: uint16(
                vm.parseJsonUint(vectors, ".params.concentrationThresholdBps")
            ),
            concentrationPenaltyBps: uint16(
                vm.parseJsonUint(vectors, ".params.concentrationPenaltyBps")
            ),
            serviceContinuityScore: uint8(
                vm.parseJsonUint(vectors, ".params.serviceContinuityScore")
            ),
            serviceContinuityWeightBps: uint16(
                vm.parseJsonUint(vectors, ".params.serviceContinuityWeightBps")
            ),
            advanceRateBps: uint16(vm.parseJsonUint(vectors, ".params.advanceRateBps"))
        });
    }

    function _twoLeaves() internal view returns (BorrowingBaseEngine.Receivable[] memory leaves) {
        BorrowingBaseEngine.Receivable[] memory golden = _goldenLeaves();
        leaves = new BorrowingBaseEngine.Receivable[](2);
        leaves[0] = golden[0];
        leaves[1] = golden[1];
    }

    function _expectedBreakdown(uint256 index) internal view returns (uint256) {
        string memory path =
            string.concat(".expected.breakdown[", vm.toString(index), "].amountMinor");
        return vm.parseUint(vm.parseJsonString(vectors, path));
    }
}
