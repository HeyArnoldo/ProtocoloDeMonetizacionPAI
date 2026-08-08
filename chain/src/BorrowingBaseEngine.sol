// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Deterministic borrowing-base calculator
/// @notice Reproduces the normative integer-only TypeScript risk engine. It
///         consumes already disclosed receivables and makes no oracle claims.
contract BorrowingBaseEngine {
    uint256 internal constant BPS_DENOMINATOR = 10_000;
    uint256 internal constant DAYS_PER_YEAR = 365;
    uint256 internal constant SECONDS_PER_DAY = 86_400;

    struct Receivable {
        bytes32 debtorHash;
        uint128 amountMinor;
        uint64 dueDate;
        uint16 currency;
    }

    struct Params {
        uint64 valuationDate;
        uint32 discountRateBps;
        uint16 delinquencyBps;
        uint16 concentrationThresholdBps;
        uint16 concentrationPenaltyBps;
        uint8 serviceContinuityScore;
        uint16 serviceContinuityWeightBps;
        uint16 advanceRateBps;
    }

    struct Result {
        uint256 disclosedNominalMinor;
        uint256 riskAdjustedMinor;
        uint256 borrowingBaseMinor;
        uint256 timeDiscountMinor;
        uint256 delinquencyMinor;
        uint256 concentrationMinor;
        uint256 serviceContinuityMinor;
        uint16 currency;
    }

    error EmptyLeaves();
    error MixedCurrency(uint16 expected, uint16 actual);
    error InvalidBps(bytes32 field, uint256 value);
    error InvalidServiceContinuityScore(uint256 value);
    error InvalidValuationDate(uint256 value);

    function compute(Receivable[] calldata leaves, Params calldata params)
        external
        pure
        returns (Result memory result)
    {
        if (leaves.length == 0) revert EmptyLeaves();
        _validateParams(params);

        result.currency = leaves[0].currency;
        for (uint256 i; i < leaves.length; ++i) {
            Receivable calldata leaf = leaves[i];
            if (leaf.currency != result.currency) {
                revert MixedCurrency(result.currency, leaf.currency);
            }
            result.disclosedNominalMinor += leaf.amountMinor;

            uint256 daysToMaturity;
            if (leaf.dueDate > params.valuationDate) {
                daysToMaturity = (leaf.dueDate - params.valuationDate) / SECONDS_PER_DAY;
            }
            result.timeDiscountMinor += _ceilDiv(
                uint256(leaf.amountMinor) * params.discountRateBps * daysToMaturity,
                BPS_DENOMINATOR * DAYS_PER_YEAR
            );
        }

        // Unsigned on-chain amounts cannot represent the normative engine's
        // pathological negative intermediate deductions. Saturating each
        // stage keeps the breakdown auditable and the remaining balance safe.
        result.timeDiscountMinor = _clamp(result.timeDiscountMinor, result.disclosedNominalMinor);
        uint256 running = result.disclosedNominalMinor - result.timeDiscountMinor;

        result.delinquencyMinor =
            _clamp(_ceilDiv(running * params.delinquencyBps, BPS_DENOMINATOR), running);
        running -= result.delinquencyMinor;

        uint256 excess = _concentrationExcess(
            leaves, result.disclosedNominalMinor, params.concentrationThresholdBps
        );
        result.concentrationMinor =
            _clamp(_ceilDiv(excess * params.concentrationPenaltyBps, BPS_DENOMINATOR), running);
        running -= result.concentrationMinor;

        result.serviceContinuityMinor = _clamp(
            _ceilDiv(
                running * (100 - params.serviceContinuityScore) * params.serviceContinuityWeightBps,
                100 * BPS_DENOMINATOR
            ),
            running
        );
        running -= result.serviceContinuityMinor;

        result.riskAdjustedMinor = running;
        result.borrowingBaseMinor = running * params.advanceRateBps / BPS_DENOMINATOR;
    }

    function _concentrationExcess(
        Receivable[] calldata leaves,
        uint256 nominal,
        uint16 thresholdBps
    ) private pure returns (uint256 excess) {
        uint256 allowance = nominal * thresholdBps / BPS_DENOMINATOR;
        for (uint256 i; i < leaves.length; ++i) {
            bool seen;
            for (uint256 previous; previous < i; ++previous) {
                if (leaves[previous].debtorHash == leaves[i].debtorHash) {
                    seen = true;
                    break;
                }
            }
            if (seen) continue;

            uint256 debtorTotal;
            for (uint256 j; j < leaves.length; ++j) {
                if (leaves[j].debtorHash == leaves[i].debtorHash) {
                    debtorTotal += leaves[j].amountMinor;
                }
            }
            if (debtorTotal > allowance) excess += debtorTotal - allowance;
        }
    }

    function _validateParams(Params calldata params) private pure {
        _validateBps("delinquencyBps", params.delinquencyBps);
        _validateBps("concentrationThresholdBps", params.concentrationThresholdBps);
        _validateBps("concentrationPenaltyBps", params.concentrationPenaltyBps);
        _validateBps("serviceContinuityWeightBps", params.serviceContinuityWeightBps);
        _validateBps("advanceRateBps", params.advanceRateBps);
        if (params.serviceContinuityScore > 100) {
            revert InvalidServiceContinuityScore(params.serviceContinuityScore);
        }
        if (params.valuationDate == 0 || params.valuationDate % SECONDS_PER_DAY != 0) {
            revert InvalidValuationDate(params.valuationDate);
        }
    }

    function _validateBps(bytes32 field, uint256 value) private pure {
        if (value > BPS_DENOMINATOR) revert InvalidBps(field, value);
    }

    function _ceilDiv(uint256 numerator, uint256 denominator) private pure returns (uint256) {
        if (numerator == 0) return 0;
        return (numerator + denominator - 1) / denominator;
    }

    function _clamp(uint256 value, uint256 maximum) private pure returns (uint256) {
        return value > maximum ? maximum : value;
    }
}
