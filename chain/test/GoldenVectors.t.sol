// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import {ReceivableLeaf} from "../src/ReceivableLeaf.sol";

/// @title Candado de la frontera Web2 <-> Web3
/// @notice Carga `packages/merkle/fixtures/golden-vectors.json` — el mismo
///         archivo que testea el paquete merkle de TypeScript — y verifica que
///         Solidity produce exactamente los mismos bytes.
///
///         Si alguno de estos tests se pone rojo, los dos lados dejaron de
///         hashear igual y el multiproof va a fallar on-chain sin dar un
///         mensaje util. No se arregla regenerando el fixture: se investiga
///         cual de los dos lados cambio.
contract GoldenVectorsTest is Test {
    string internal json;

    function setUp() public {
        json = vm.readFile("../packages/merkle/fixtures/golden-vectors.json");
    }

    /// @dev El fixture declara los tipos ABI que usa. Si el orden o los tipos
    ///      cambiaran, `ReceivableLeaf.hash` quedaria desalineado en silencio.
    function test_LeafAbiTypesMatch() public view {
        string[] memory types = vm.parseJsonStringArray(json, ".leafAbiTypes");

        assertEq(types.length, 5, "la hoja tiene 5 campos");
        assertEq(types[0], "bytes32", "debtorHash");
        assertEq(types[1], "uint256", "amountMinor");
        assertEq(types[2], "uint64", "dueDate");
        assertEq(types[3], "uint16", "currency");
        assertEq(types[4], "bytes32", "docHash");
    }

    /// @dev Reproduce el hash de cada hoja del fixture desde sus campos.
    function test_ReproducesEveryLeafHash() public view {
        bytes32[] memory expected = vm.parseJsonBytes32Array(json, ".leafHashes");
        assertGt(expected.length, 0, "el fixture tiene hojas");

        for (uint256 i = 0; i < expected.length; i++) {
            assertEq(
                ReceivableLeaf.hash(_leafAt(".leaves", i)),
                expected[i],
                "leafHash divergente entre TypeScript y Solidity"
            );
        }
    }

    /// @dev El `debtorHash` es `keccak256(salt || utf8(ruc))`. El salt no es
    ///      opcional: un RUC son 11 digitos y sin salt se saca por fuerza bruta
    ///      desde cualquier proof publicado.
    function test_ReproducesEveryDebtorHash() public view {
        bytes32 salt = vm.parseJsonBytes32(json, ".debtorSalt");
        uint256 count = vm.parseJsonBytes32Array(json, ".leafHashes").length;

        for (uint256 i = 0; i < count; i++) {
            string memory base = string.concat(".leaves[", vm.toString(i), "]");
            assertEq(
                ReceivableLeaf.hashDebtor(
                    vm.parseJsonString(json, string.concat(base, ".debtorTaxId")), salt
                ),
                vm.parseJsonBytes32(json, string.concat(base, ".debtorHash")),
                "debtorHash divergente entre TypeScript y Solidity"
            );
        }
    }

    /// @dev Las hojas divulgadas que el fixture entrega tienen que hashear a lo
    ///      que el fixture dice. Si no, el resto del test verificaria contra
    ///      valores que nadie recomputo.
    function test_DisclosedLeavesHashToTheirDeclaredValues() public view {
        bytes32[] memory expected = vm.parseJsonBytes32Array(json, ".multiProof.leafHashes");
        assertGt(expected.length, 0, "el fixture divulga hojas");

        for (uint256 i = 0; i < expected.length; i++) {
            assertEq(ReceivableLeaf.hash(_leafAt(".multiProof.leaves", i)), expected[i]);
        }
    }

    /// @dev El multiproof del fixture tiene que verificar contra el root del
    ///      fixture usando el verificador de OpenZeppelin, sin adaptaciones.
    function test_MultiProofVerifiesAgainstRoot() public view {
        assertTrue(
            MerkleProof.multiProofVerify(
                vm.parseJsonBytes32Array(json, ".multiProof.proof"),
                vm.parseJsonBoolArray(json, ".multiProof.proofFlags"),
                vm.parseJsonBytes32(json, ".root"),
                _disclosedLeafHashes()
            ),
            "el multiproof del fixture no verifica en Solidity"
        );
    }

    /// @dev Alterar una hoja divulgada tiene que invalidar el proof. Sin esta
    ///      prueba, un verificador que devolviera siempre true pasaria el test
    ///      anterior.
    function test_TamperedLeafFailsVerification() public view {
        bytes32[] memory leaves = _disclosedLeafHashes();
        leaves[0] = bytes32(uint256(leaves[0]) ^ 1);

        assertFalse(
            MerkleProof.multiProofVerify(
                vm.parseJsonBytes32Array(json, ".multiProof.proof"),
                vm.parseJsonBoolArray(json, ".multiProof.proofFlags"),
                vm.parseJsonBytes32(json, ".root"),
                leaves
            ),
            "una hoja alterada no puede verificar"
        );
    }

    function test_WrongRootFailsVerification() public view {
        assertFalse(
            MerkleProof.multiProofVerify(
                vm.parseJsonBytes32Array(json, ".multiProof.proof"),
                vm.parseJsonBoolArray(json, ".multiProof.proofFlags"),
                bytes32(uint256(1)),
                _disclosedLeafHashes()
            ),
            "un root distinto no puede verificar"
        );
    }

    /// @dev Lee una hoja del fixture y la reconstruye campo por campo.
    ///      `amountMinor` viaja como string decimal porque en JS es un bigint y
    ///      JSON no lo serializa; `vm.parseUint` lo recupera sin perder
    ///      precision.
    function _leafAt(string memory arrayPath, uint256 index)
        internal
        view
        returns (ReceivableLeaf.Data memory)
    {
        string memory base = string.concat(arrayPath, "[", vm.toString(index), "]");

        return ReceivableLeaf.Data({
            debtorHash: vm.parseJsonBytes32(json, string.concat(base, ".debtorHash")),
            amountMinor: vm.parseUint(
                vm.parseJsonString(json, string.concat(base, ".amountMinor"))
            ),
            dueDate: uint64(vm.parseJsonUint(json, string.concat(base, ".dueDate"))),
            currency: uint16(vm.parseJsonUint(json, string.concat(base, ".currency"))),
            docHash: vm.parseJsonBytes32(json, string.concat(base, ".docHash"))
        });
    }

    /// @dev Recalcula el hash de las hojas divulgadas desde sus campos, en el
    ///      orden en que el fixture las entrega. Ese orden no se puede
    ///      reordenar: la verificacion depende de el.
    function _disclosedLeafHashes() internal view returns (bytes32[] memory) {
        uint256 count = vm.parseJsonBytes32Array(json, ".multiProof.leafHashes").length;

        bytes32[] memory leaves = new bytes32[](count);
        for (uint256 i = 0; i < count; i++) {
            leaves[i] = ReceivableLeaf.hash(_leafAt(".multiProof.leaves", i));
        }
        return leaves;
    }
}
