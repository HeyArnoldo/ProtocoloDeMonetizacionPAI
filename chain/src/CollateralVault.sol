// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import {AssetRegistry} from "./AssetRegistry.sol";
import {BorrowingBaseEngine} from "./BorrowingBaseEngine.sol";
import {PAICertificate} from "./PAICertificate.sol";
import {ReceivableLeaf} from "./ReceivableLeaf.sol";

/// @notice Demo principal-only loan lifecycle. Default records state only; it
///         does not transfer receivables or claim legal enforcement.
contract CollateralVault {
    using SafeERC20 for IERC20;

    enum State {
        None,
        Pledged,
        Funded,
        Repaid,
        Defaulted
    }

    struct Loan {
        address borrower;
        address lender;
        uint128 principal;
        uint64 dueAt;
        State state;
    }

    AssetRegistry public immutable registry;
    PAICertificate public immutable certificate;
    BorrowingBaseEngine public immutable engine;
    IERC20 public immutable token;
    mapping(bytes32 assetId => Loan) private _loans;

    event LoanOriginated(
        bytes32 indexed assetId,
        address indexed borrower,
        address indexed lender,
        uint128 principal,
        uint64 dueAt
    );
    event LoanStateChanged(bytes32 indexed assetId, State state);

    error InvalidConfiguration();
    error LoanAlreadyExists();
    error InvalidState();
    error NotController();
    error NotLender();
    error InvalidTerms();
    error InvalidAssetStatus();
    error InvalidCertificate();
    error InvalidDisclosure();
    error AmountTooLarge();
    error UnsupportedCurrency();
    error PrincipalExceedsBorrowingBase();
    error NotDue();

    constructor(
        AssetRegistry registry_,
        PAICertificate certificate_,
        BorrowingBaseEngine engine_,
        IERC20 token_
    ) {
        if (
            address(registry_) == address(0) || address(certificate_) == address(0)
                || address(engine_) == address(0) || address(token_) == address(0)
                || address(certificate_.registry()) != address(registry_)
        ) revert InvalidConfiguration();
        registry = registry_;
        certificate = certificate_;
        engine = engine_;
        token = token_;
    }

    function originate(
        bytes32 assetId,
        address lender,
        uint128 principal,
        uint64 dueAt,
        ReceivableLeaf.Data[] calldata receivables,
        bytes32[] calldata proof,
        bool[] calldata proofFlags,
        BorrowingBaseEngine.Params calldata params
    ) external {
        if (_loans[assetId].state != State.None) {
            revert LoanAlreadyExists();
        }
        AssetRegistry.Asset memory asset = registry.getAsset(assetId);
        if (msg.sender != asset.controller) revert NotController();
        if (asset.status != AssetRegistry.Status.Attested) revert InvalidAssetStatus();
        if (!certificate.isValid(assetId)) revert InvalidCertificate();
        if (
            lender == address(0) || lender == msg.sender || principal == 0
                || dueAt <= block.timestamp
        ) {
            revert InvalidTerms();
        }
        if (principal > _borrowingBase(asset.merkleRoot, receivables, proof, proofFlags, params)) {
            revert PrincipalExceedsBorrowingBase();
        }

        _loans[assetId] = Loan(msg.sender, lender, principal, dueAt, State.Pledged);
        registry.markPledged(assetId);
        emit LoanOriginated(assetId, msg.sender, lender, principal, dueAt);
    }

    function fund(bytes32 assetId) external {
        Loan storage loan = _loans[assetId];
        if (loan.state != State.Pledged) revert InvalidState();
        if (msg.sender != loan.lender) revert NotLender();
        if (!certificate.isValid(assetId)) revert InvalidCertificate();
        loan.state = State.Funded;
        registry.markFunded(assetId);
        token.safeTransferFrom(msg.sender, loan.borrower, loan.principal);
        emit LoanStateChanged(assetId, State.Funded);
    }

    function repay(bytes32 assetId) external {
        Loan storage loan = _loans[assetId];
        if (loan.state != State.Funded) revert InvalidState();
        if (msg.sender != loan.borrower) revert NotController();
        loan.state = State.Repaid;
        registry.markRepaid(assetId);
        token.safeTransferFrom(msg.sender, loan.lender, loan.principal);
        emit LoanStateChanged(assetId, State.Repaid);
    }

    function declareDefault(bytes32 assetId) external {
        Loan storage loan = _loans[assetId];
        if (loan.state != State.Funded) revert InvalidState();
        if (msg.sender != loan.lender) revert NotLender();
        if (block.timestamp <= loan.dueAt) revert NotDue();
        loan.state = State.Defaulted;
        registry.markDefaulted(assetId);
        emit LoanStateChanged(assetId, State.Defaulted);
    }

    function getLoan(bytes32 assetId) external view returns (Loan memory) {
        return _loans[assetId];
    }

    function _borrowingBase(
        bytes32 root,
        ReceivableLeaf.Data[] calldata receivables,
        bytes32[] calldata proof,
        bool[] calldata proofFlags,
        BorrowingBaseEngine.Params calldata params
    ) private view returns (uint256) {
        if (receivables.length == 0) {
            revert InvalidDisclosure();
        }
        bytes32[] memory hashes = new bytes32[](receivables.length);
        BorrowingBaseEngine.Receivable[] memory engineLeaves =
            new BorrowingBaseEngine.Receivable[](receivables.length);
        for (uint256 i; i < receivables.length; ++i) {
            ReceivableLeaf.Data calldata leaf = receivables[i];
            if (leaf.amountMinor > type(uint128).max) revert AmountTooLarge();
            hashes[i] = ReceivableLeaf.hash(leaf);
            engineLeaves[i] = BorrowingBaseEngine.Receivable(
                leaf.debtorHash, uint128(leaf.amountMinor), leaf.dueDate, leaf.currency
            );
        }
        if (!MerkleProof.multiProofVerifyCalldata(proof, proofFlags, root, hashes)) {
            revert InvalidDisclosure();
        }
        BorrowingBaseEngine.Result memory result = engine.compute(engineLeaves, params);
        if (result.currency != 840) revert UnsupportedCurrency();
        return result.borrowingBaseMinor;
    }
}
