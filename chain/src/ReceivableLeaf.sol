// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Hoja canónica del árbol de evidencias
/// @notice Una hoja representa **una cuota de un contrato**: un tercero
///         obligado a pagar un monto en una fecha.
///
///         Esta codificación es normativa y está espejada en TypeScript
///         (`packages/merkle/src/leaf.ts`). Los vectores dorados de
///         `packages/merkle/fixtures/golden-vectors.json` son el candado:
///         `test/GoldenVectors.t.sol` verifica que los dos lados producen los
///         mismos bytes.
///
///         **Cambiar el orden o un tipo rompe la verificación on-chain sin dar
///         un error legible:** el multiproof simplemente deja de validar.
library ReceivableLeaf {
    struct Data {
        /// @dev `keccak256(salt || utf8(ruc))`. Nunca el RUC en claro: la hoja
        ///      puede publicarse dentro de un proof.
        bytes32 debtorHash;
        /// @dev Monto en unidades menores. USD 8,000.00 -> 800000.
        uint256 amountMinor;
        /// @dev Segundos Unix, medianoche UTC del día de vencimiento.
        uint64 dueDate;
        /// @dev Código numérico ISO-4217. USD = 840, PEN = 604. Se usa el
        ///      numérico y no el alfabético porque codificar strings igual en
        ///      TypeScript, Solidity y Rust es fuente de bugs silenciosos.
        uint16 currency;
        /// @dev SHA-256 del documento fuente en storage. Es SHA-256 y no
        ///      keccak a propósito: cualquier auditor lo verifica con
        ///      `sha256sum`, sin tooling cripto.
        bytes32 docHash;
    }

    /// @notice Hash de la hoja: `keccak256(keccak256(abi.encode(...)))`.
    /// @dev El doble hash es la defensa estándar contra ataques de segunda
    ///      preimagen — sin él un nodo interno puede hacerse pasar por hoja.
    ///      Es también el formato que produce `StandardMerkleTree` de
    ///      OpenZeppelin y el que espera `MerkleProof`.
    function hash(Data memory leaf) internal pure returns (bytes32) {
        return keccak256(
            bytes.concat(
                keccak256(
                    abi.encode(
                        leaf.debtorHash, leaf.amountMinor, leaf.dueDate, leaf.currency, leaf.docHash
                    )
                )
            )
        );
    }

    /// @notice Deriva el `debtorHash` desde el identificador tributario.
    /// @dev El salt **no es opcional**: un RUC peruano son 11 dígitos, o sea
    ///      10^11 combinaciones. Sin salt, cualquiera que reciba un proof
    ///      enumera RUCs y reconstruye la cartera de clientes de la empresa —
    ///      justo lo que el protocolo promete no revelar.
    ///
    ///      El identificador se normaliza en el backend (trim + mayúsculas)
    ///      antes de llegar acá. On-chain esta función existe para verificar,
    ///      no para normalizar.
    function hashDebtor(string memory taxId, bytes32 salt) internal pure returns (bytes32) {
        return keccak256(bytes.concat(salt, bytes(taxId)));
    }
}
