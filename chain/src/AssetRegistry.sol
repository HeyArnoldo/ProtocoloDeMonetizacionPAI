// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title Registro de expedientes
/// @notice Guarda el root del arbol de evidencias y el estado del expediente.
///         **Nunca sube el archivo, ni el contrato, ni datos personales:** solo
///         una huella. Lo que prueba es integridad, fecha y quien firmo. Lo que
///         no prueba es propiedad legal, valor, ni que vayan a pagar.
///
///         El estado vive aca y es la fuente de verdad. Postgres es un indice
///         de eventos: cuando discrepan, gana la cadena.
contract AssetRegistry is AccessControl, Pausable {
    /// @notice Puede mover el estado por certificacion. Lo tiene el contrato
    ///         `CertificationAttestor`, no una persona.
    bytes32 public constant ATTESTOR_ROLE = keccak256("ATTESTOR_ROLE");
    /// @notice Puede pausar en emergencia.
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @dev Los ordinales son contrato entre lenguajes: TypeScript los espeja
    ///      en `ASSET_STATUS_ORDINAL` (`apps/api/src/chain/chain.port.ts`).
    ///      Solidity serializa los enum como uint8 **por posicion**, asi que
    ///      reordenar esto sin actualizar la tabla hace que el indexer proyecte
    ///      estados equivocados sin lanzar ningun error.
    enum Status {
        Registered, // 0
        Attested, // 1
        Pledged, // 2
        Funded, // 3
        Repaid, // 4
        Revoked, // 5
        Defaulted, // 6
        Executed // 7
    }

    struct Asset {
        /// @dev Root del arbol de evidencias. Lo unico del expediente on-chain.
        bytes32 merkleRoot;
        /// @dev Hash del identificador del titular. Nunca el RUC en claro.
        bytes32 ownerIdHash;
        /// @dev Smart account que controla el expediente.
        address controller;
        uint64 registeredAt;
        Status status;
        bool exists;
    }

    mapping(bytes32 assetId => Asset) private _assets;

    event AssetRegistered(
        bytes32 indexed assetId,
        address indexed controller,
        bytes32 merkleRoot,
        bytes32 ownerIdHash,
        uint64 registeredAt
    );
    event AssetStatusChanged(bytes32 indexed assetId, Status previous, Status current);

    error AssetAlreadyRegistered(bytes32 assetId);
    error AssetNotFound(bytes32 assetId);
    error EmptyMerkleRoot();
    error InvalidController();
    error InvalidTransition(Status from, Status to);

    constructor(address admin) {
        if (admin == address(0)) revert InvalidController();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    /// @notice Registra un expediente. La firma la manda la smart account del
    ///         titular, no el backend: la autoridad sobre el activo es suya.
    function registerAsset(bytes32 assetId, bytes32 merkleRoot, bytes32 ownerIdHash)
        external
        whenNotPaused
    {
        if (_assets[assetId].exists) revert AssetAlreadyRegistered(assetId);
        if (merkleRoot == bytes32(0)) revert EmptyMerkleRoot();

        _assets[assetId] = Asset({
            merkleRoot: merkleRoot,
            ownerIdHash: ownerIdHash,
            controller: msg.sender,
            registeredAt: uint64(block.timestamp),
            status: Status.Registered,
            exists: true
        });

        emit AssetRegistered(assetId, msg.sender, merkleRoot, ownerIdHash, uint64(block.timestamp));
    }

    /// @notice Marca el expediente como certificado. Solo el `CertificationAttestor`.
    function markAttested(bytes32 assetId) external onlyRole(ATTESTOR_ROLE) whenNotPaused {
        Asset storage asset = _get(assetId);
        // Desde Registered o desde Attested (segunda atestacion): idempotente
        // hacia adelante, pero nunca desde un estado con dinero de por medio.
        if (asset.status != Status.Registered && asset.status != Status.Attested) {
            revert InvalidTransition(asset.status, Status.Attested);
        }
        _setStatus(assetId, asset, Status.Attested);
    }

    /// @notice Devuelve el expediente a Registered cuando ya no le queda
    ///         ninguna atestacion vigente. Solo el `CertificationAttestor`.
    function markUnattested(bytes32 assetId) external onlyRole(ATTESTOR_ROLE) whenNotPaused {
        Asset storage asset = _get(assetId);
        if (asset.status != Status.Attested) {
            revert InvalidTransition(asset.status, Status.Registered);
        }
        _setStatus(assetId, asset, Status.Registered);
    }

    function getAsset(bytes32 assetId) external view returns (Asset memory) {
        return _get(assetId);
    }

    function exists(bytes32 assetId) external view returns (bool) {
        return _assets[assetId].exists;
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _get(bytes32 assetId) private view returns (Asset storage) {
        Asset storage asset = _assets[assetId];
        if (!asset.exists) revert AssetNotFound(assetId);
        return asset;
    }

    function _setStatus(bytes32 assetId, Asset storage asset, Status next) private {
        Status previous = asset.status;
        if (previous == next) return;
        asset.status = next;
        emit AssetStatusChanged(assetId, previous, next);
    }
}
