import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { keccak256 } from 'ethereum-cryptography/keccak';
import { getRandomBytesSync } from 'ethereum-cryptography/random';
import { toHex, utf8ToBytes } from 'ethereum-cryptography/utils';

export type Hex = `0x${string}`;

/**
 * Orden y tipos ABI de la hoja. **Definición normativa.**
 *
 * El contrato Solidity y el motor Stylus decodifican exactamente esta tupla.
 * Cambiar el orden o un tipo rompe la verificación on-chain sin dar un error
 * legible: el multiproof simplemente no valida. Si esto cambia, se regeneran
 * los vectores dorados y se avisa al lado Web3 en el mismo PR.
 */
export const LEAF_ABI_TYPES = [
  'bytes32', // debtorHash
  'uint256', // amountMinor
  'uint64', // dueDate
  'uint16', // currency
  'bytes32', // docHash
] as const;

/**
 * Códigos numéricos ISO-4217.
 *
 * Se usa el código numérico y no el alfabético porque codificar strings de
 * forma idéntica en TypeScript, Solidity y Rust es una fuente de bugs
 * silenciosos (padding, encoding, longitud). Un entero no tiene ambigüedad.
 */
export const CURRENCY = {
  USD: 840,
  PEN: 604,
} as const;

export type CurrencyCode = (typeof CURRENCY)[keyof typeof CURRENCY];

const KNOWN_CURRENCIES: readonly number[] = Object.values(CURRENCY);

const SECONDS_PER_DAY = 86_400;
const BYTES32_PATTERN = /^0x[0-9a-f]{64}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Una cuota de un contrato: un tercero obligado a pagar un monto en una fecha. */
export interface ReceivableLeaf {
  /** `keccak256(utf8(identificador))` del deudor. Nunca el identificador en claro. */
  debtorHash: Hex;
  /** Monto en unidades menores. USD 8,000.00 → `800000n`. */
  amountMinor: bigint;
  /** Segundos Unix, medianoche UTC del día de vencimiento. */
  dueDate: number;
  /** Código numérico ISO-4217. */
  currency: CurrencyCode;
  /** SHA-256 del documento fuente en storage. */
  docHash: Hex;
}

export type LeafTuple = readonly [Hex, bigint, bigint, bigint, Hex];

/**
 * Genera el salt de un expediente. Se guarda del lado del servidor y se
 * comparte solo con quien deba recomputar los hashes (certificador, fondo).
 */
export function randomDebtorSalt(): Hex {
  // getRandomBytesSync es isomorfico (Node y navegador). Usar globalThis.crypto
  // obligaria a meter la lib DOM en el tsconfig de un paquete que no toca DOM.
  return `0x${toHex(getRandomBytesSync(32))}`;
}

/**
 * Hashea el identificador tributario del deudor, con salt por expediente.
 *
 * **El salt no es opcional y esta es la razón:** un RUC peruano son 11
 * dígitos, o sea 10^11 combinaciones. Un `keccak256` sin salt se rompe por
 * fuerza bruta en minutos, y cualquiera que reciba un proof podría listar la
 * cartera de clientes de la empresa. La promesa de "probar sin revelar las
 * contrapartes" se cae justo ahí.
 *
 * Con salt de 32 bytes el espacio deja de ser enumerable, y quien tenga el
 * salt (el fondo, el certificador) igual puede recomputar y verificar.
 *
 * Normaliza espacios y mayúsculas para que el mismo deudor cargado por dos
 * personas distintas dé el mismo hash — si no, la misma cartera produciría
 * roots distintos.
 */
export function hashDebtor(taxId: string, salt: Hex): Hex {
  const normalized = taxId.trim().toUpperCase();
  if (normalized.length === 0) {
    throw new Error('El identificador del deudor no puede estar vacío.');
  }
  if (!BYTES32_PATTERN.test(salt)) {
    throw new Error(`El salt debe ser un bytes32 en minúsculas, llegó "${salt}".`);
  }

  const saltBytes = Uint8Array.from(
    salt
      .slice(2)
      .match(/.{2}/g)!
      .map((byte) => Number.parseInt(byte, 16)),
  );
  const idBytes = utf8ToBytes(normalized);
  const payload = new Uint8Array(saltBytes.length + idBytes.length);
  payload.set(saltBytes);
  payload.set(idBytes, saltBytes.length);

  return `0x${toHex(keccak256(payload))}`;
}

/**
 * Convierte una fecha `YYYY-MM-DD` a medianoche UTC en segundos.
 *
 * Solo acepta fecha sin hora a propósito: el vencimiento es un día, no un
 * instante. Ver la guarda de `assertValidLeaf`.
 */
export function toDueDate(isoDate: string): number {
  if (!ISO_DATE_PATTERN.test(isoDate)) {
    throw new Error(`Fecha inválida "${isoDate}": se espera el formato YYYY-MM-DD sin hora.`);
  }

  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  const millis = Date.UTC(year, month - 1, day);
  const parsed = new Date(millis);

  // Date.UTC desborda en silencio: 2026-02-30 se convierte en 2026-03-02.
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`La fecha "${isoDate}" no existe.`);
  }

  return millis / 1000;
}

/** Valida los invariantes de la hoja. Lanza con un mensaje accionable. */
export function assertValidLeaf(leaf: ReceivableLeaf): void {
  if (!BYTES32_PATTERN.test(leaf.debtorHash)) {
    throw new Error(`debtorHash debe ser un bytes32 en minúsculas, llegó "${leaf.debtorHash}".`);
  }
  if (!BYTES32_PATTERN.test(leaf.docHash)) {
    throw new Error(`docHash debe ser un bytes32 en minúsculas, llegó "${leaf.docHash}".`);
  }
  if (leaf.amountMinor <= 0n) {
    throw new Error(`El monto debe ser positivo en unidades menores, llegó ${leaf.amountMinor}.`);
  }
  if (!Number.isInteger(leaf.dueDate) || leaf.dueDate <= 0) {
    throw new Error(`dueDate debe ser un entero positivo, llegó ${leaf.dueDate}.`);
  }
  // Sin esta guarda, dos personas cargando "15 de marzo" a horas distintas
  // producen hojas distintas y el multiproof falla sin decir por qué.
  if (leaf.dueDate % SECONDS_PER_DAY !== 0) {
    throw new Error(
      `dueDate debe caer en medianoche UTC exacta, llegó ${leaf.dueDate}. Usa toDueDate().`,
    );
  }
  if (!KNOWN_CURRENCIES.includes(leaf.currency)) {
    throw new Error(
      `Moneda ISO-4217 desconocida: ${leaf.currency}. Conocidas: ${KNOWN_CURRENCIES.join(', ')}.`,
    );
  }
}

/** Serializa la hoja en el orden de `LEAF_ABI_TYPES`. */
export function toLeafTuple(leaf: ReceivableLeaf): LeafTuple {
  return [
    leaf.debtorHash,
    leaf.amountMinor,
    BigInt(leaf.dueDate),
    BigInt(leaf.currency),
    leaf.docHash,
  ];
}

/**
 * Hash de la hoja: `keccak256(keccak256(abi.encode(...)))`.
 *
 * El doble hash es la defensa estándar contra ataques de segunda preimagen —
 * sin él un nodo interno puede hacerse pasar por hoja. No se implementa a
 * mano: se delega en `StandardMerkleTree` de OpenZeppelin, que es exactamente
 * el formato que `MerkleProof` verifica on-chain. Un árbol propio funcionaría
 * en los tests de TypeScript y fallaría en el contrato.
 */
export function hashLeaf(leaf: ReceivableLeaf): Hex {
  assertValidLeaf(leaf);
  const tuple = toLeafTuple(leaf);
  // El leafHash es función pura del valor y los tipos, independiente del árbol
  // que lo contenga. El test `tree.leafHashes === leaves.map(hashLeaf)` lo fija.
  return StandardMerkleTree.of([tuple as unknown as unknown[]], [...LEAF_ABI_TYPES]).leafHash(
    tuple as unknown as unknown[],
  ) as Hex;
}
