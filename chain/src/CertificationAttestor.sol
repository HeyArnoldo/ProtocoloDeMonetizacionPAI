// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {AssetRegistry} from "./AssetRegistry.sol";

/// @title Atestaciones de certificacion
/// @notice Cada certificador firma desde su propia wallet y **ninguno ve todo**.
///         Esa separacion es lo que hace creible el resultado: el contador
///         verifica ingresos, el abogado verifica cesibilidad, el auditor
///         verifica continuidad del servicio. Nadie certifica el conjunto.
///
///         Las atestaciones son revocables y la revocacion no borra nada: el
///         historial tambien es evidencia.
contract CertificationAttestor is AccessControl {
    /// @notice Puede atestar. En la practica: la wallet institucional de cada
    ///         certificador (contador, abogado, auditor).
    bytes32 public constant CERTIFIER_ROLE = keccak256("CERTIFIER_ROLE");

    enum Kind {
        RevenueVerified, // 0 — contador publico
        RightsAssignable, // 1 — abogado
        ServiceContinuity // 2 — auditor tecnico
    }

    struct Attestation {
        bytes32 certificateHash;
        uint64 attestedAt;
        uint64 revokedAt;
        bool exists;
    }

    AssetRegistry public immutable registry;

    /// @dev Una atestacion por (expediente, tipo, certificador). Dos
    ///      certificadores pueden atestar el mismo tipo — es deseable, son
    ///      opiniones independientes.
    mapping(bytes32 assetId => mapping(Kind => mapping(address certifier => Attestation))) private
        _attestations;

    /// @dev Contador de atestaciones vigentes por expediente. Sin esto habria
    ///      que iterar para saber si queda alguna, y iterar on-chain se paga.
    mapping(bytes32 assetId => uint256) public activeCount;

    event Attested(
        bytes32 indexed assetId,
        Kind indexed kind,
        address indexed certifier,
        bytes32 certificateHash,
        uint64 attestedAt
    );
    event AttestationRevoked(
        bytes32 indexed assetId, Kind indexed kind, address indexed certifier, uint64 revokedAt
    );

    error AssetNotRegistered(bytes32 assetId);
    error AlreadyAttested(bytes32 assetId, Kind kind, address certifier);
    error NoActiveAttestation(bytes32 assetId, Kind kind, address certifier);
    error EmptyCertificateHash();
    error InvalidRegistry();

    constructor(AssetRegistry registry_, address admin) {
        if (address(registry_) == address(0) || admin == address(0)) revert InvalidRegistry();
        registry = registry_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Registra una atestacion firmada por el certificador.
    function attest(bytes32 assetId, Kind kind, bytes32 certificateHash)
        external
        onlyRole(CERTIFIER_ROLE)
    {
        if (!registry.exists(assetId)) revert AssetNotRegistered(assetId);
        if (certificateHash == bytes32(0)) revert EmptyCertificateHash();

        Attestation storage attestation = _attestations[assetId][kind][msg.sender];
        if (attestation.exists && attestation.revokedAt == 0) {
            revert AlreadyAttested(assetId, kind, msg.sender);
        }

        _attestations[assetId][kind][msg.sender] = Attestation({
            certificateHash: certificateHash,
            attestedAt: uint64(block.timestamp),
            revokedAt: 0,
            exists: true
        });
        activeCount[assetId] += 1;

        registry.markAttested(assetId);

        emit Attested(assetId, kind, msg.sender, certificateHash, uint64(block.timestamp));
    }

    /// @notice Revoca la atestacion propia. El certificador solo puede revocar
    ///         lo que el mismo firmo.
    function revoke(bytes32 assetId, Kind kind) external {
        Attestation storage attestation = _attestations[assetId][kind][msg.sender];
        if (!attestation.exists || attestation.revokedAt != 0) {
            revert NoActiveAttestation(assetId, kind, msg.sender);
        }

        // No se borra: la revocacion tambien es evidencia y el historial es lo
        // que hace auditable el expediente.
        attestation.revokedAt = uint64(block.timestamp);
        activeCount[assetId] -= 1;

        if (activeCount[assetId] == 0) {
            registry.markUnattested(assetId);
        }

        emit AttestationRevoked(assetId, kind, msg.sender, uint64(block.timestamp));
    }

    function getAttestation(bytes32 assetId, Kind kind, address certifier)
        external
        view
        returns (Attestation memory)
    {
        return _attestations[assetId][kind][certifier];
    }

    function isActive(bytes32 assetId, Kind kind, address certifier) external view returns (bool) {
        Attestation storage attestation = _attestations[assetId][kind][certifier];
        return attestation.exists && attestation.revokedAt == 0;
    }
}
