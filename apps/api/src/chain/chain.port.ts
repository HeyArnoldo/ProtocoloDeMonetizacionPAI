/**
 * `ChainPort` — la cadena vista como un puerto del dominio.
 *
 * El dominio de la API no conoce Viem, ni direcciones, ni ABIs. Conoce esta
 * interfaz. Eso permite construir el 70% del MVP contra el adapter en memoria
 * mientras los contratos todavía no existen, y enchufar el adapter real sin
 * tocar una línea de dominio.
 *
 * Regla dura: **la API nunca firma transacciones de valor.** Firma atestaciones
 * y lee eventos. El dinero va de la wallet del fondo al vault y del vault a la
 * PYME, sin pasar por el servidor.
 */

export type Hex = `0x${string}`;
/** Identificador del expediente. `bytes32` on-chain. */
export type AssetId = Hex;
export type Address = Hex;
export type TxHash = Hex;

/**
 * Estados del expediente.
 *
 * ```
 * Registered → Attested → Pledged → Funded → Repaid → (vuelve a Attested)
 *                 ↓                    ↓
 *              Revoked             Defaulted → Executed
 * ```
 *
 * La autoridad de las transiciones es on-chain (`require()` en el contrato).
 * Postgres es un índice de eventos, no la fuente de verdad.
 */
export enum AssetStatus {
  Registered = 'Registered',
  Attested = 'Attested',
  Pledged = 'Pledged',
  Funded = 'Funded',
  Repaid = 'Repaid',
  Revoked = 'Revoked',
  Defaulted = 'Defaulted',
  Executed = 'Executed',
}

/**
 * Ordinal de cada estado en el `enum` de Solidity.
 *
 * **Contrato entre lenguajes.** Solidity serializa los enums como `uint8` por
 * posición: si el contrato reordena su enum y esta tabla no se actualiza, el
 * indexer va a proyectar estados equivocados sin lanzar ningún error.
 */
export const ASSET_STATUS_ORDINAL: Readonly<Record<AssetStatus, number>> = Object.freeze({
  [AssetStatus.Registered]: 0,
  [AssetStatus.Attested]: 1,
  [AssetStatus.Pledged]: 2,
  [AssetStatus.Funded]: 3,
  [AssetStatus.Repaid]: 4,
  [AssetStatus.Revoked]: 5,
  [AssetStatus.Defaulted]: 6,
  [AssetStatus.Executed]: 7,
});

/**
 * Tipos de atestación. Ningún certificador ve todo: esa separación es lo que
 * hace creíble el resultado.
 */
export enum AttestationKind {
  /** Contador público: facturas contra SUNAT, abonos en extractos, mora histórica. */
  RevenueVerified = 'REVENUE_VERIFIED',
  /** Abogado: cesión permitida, sin prenda previa. */
  RightsAssignable = 'RIGHTS_ASSIGNABLE',
  /** Auditor técnico: el servicio que genera los cobros sigue operando. */
  ServiceContinuity = 'SERVICE_CONTINUITY',
}

/** Referencia a una transacción enviada. `blockNumber` es null hasta que confirma. */
export interface TxRef {
  hash: TxHash;
  blockNumber: number | null;
}

export interface RegisterAssetInput {
  assetId: AssetId;
  /** Root del árbol de evidencias. Lo único del expediente que va on-chain. */
  merkleRoot: Hex;
  /** Hash del identificador del titular. Nunca el RUC en claro. */
  ownerIdHash: Hex;
  /** Smart account que controla el expediente. */
  controller: Address;
}

export interface AttestInput {
  assetId: AssetId;
  kind: AttestationKind;
  /** Wallet con `CERTIFIER_ROLE` que firma. Cada certificador usa la suya. */
  certifier: Address;
  /** Hash del informe de certificación en storage. */
  certificateHash: Hex;
}

export interface RevokeAttestationInput {
  assetId: AssetId;
  kind: AttestationKind;
  certifier: Address;
}

export interface Attestation {
  kind: AttestationKind;
  certifier: Address;
  certificateHash: Hex;
  attestedAt: Date;
  revokedAt: Date | null;
}

export interface OnChainAsset {
  assetId: AssetId;
  merkleRoot: Hex;
  ownerIdHash: Hex;
  controller: Address;
  registeredAt: Date;
  status: AssetStatus;
  attestations: Attestation[];
}

export interface ChainAssetSnapshot {
  network: 'arbitrum' | 'in-memory';
  chainId: number | null;
  blockNumber: bigint | null;
  asset: OnChainAsset;
  certificate:
    | { supported: false }
    | { supported: true; valid: boolean; owner: Address | null; issuanceCount: bigint };
  loan:
    | { supported: false }
    | {
        supported: true;
        value: null | {
          borrower: Address;
          lender: Address;
          principal: bigint;
          dueAt: Date;
          state: 'Pledged' | 'Funded' | 'Repaid' | 'Defaulted';
        };
      };
}

export interface BorrowingBaseInput {
  assetId: AssetId;
  /** Multiproof serializado de las hojas que la empresa decidió divulgar. */
  disclosure: {
    leaves: Array<{
      debtorHash: Hex;
      amountMinor: string;
      dueDate: number;
      currency: number;
      docHash: Hex;
    }>;
    proof: Hex[];
    proofFlags: boolean[];
  };
}

export interface BorrowingBaseResult {
  /** Nominal divulgado, en unidades menores. */
  disclosedNominalMinor: string;
  /** Monto prestable tras descuentos y haircuts, en unidades menores. */
  borrowingBaseMinor: string;
  /** Desglose para mostrar en la UI. Cada descuento con su razón. */
  breakdown: Array<{ concept: string; amountMinor: string }>;
}

/** Error de dominio: la transición pedida no existe en la máquina de estados. */
export class InvalidChainTransitionError extends Error {}

/** Error de dominio: el expediente no existe on-chain. */
export class AssetNotFoundError extends Error {}

export interface ChainPort {
  registerAsset(input: RegisterAssetInput): Promise<TxRef>;
  attest(input: AttestInput): Promise<TxRef>;
  revokeAttestation(input: RevokeAttestationInput): Promise<TxRef>;
  getAsset(assetId: AssetId): Promise<OnChainAsset | null>;
  getAssetSnapshot(assetId: AssetId): Promise<ChainAssetSnapshot | null>;
  /**
   * Recomputa la base prestable contra el motor Stylus.
   *
   * Es una llamada `view`: el prestamista la hace por su cuenta y obtiene el
   * mismo número. Ese es el punto — el monto deja de ser algo que el backend
   * afirma.
   */
  computeBorrowingBase(input: BorrowingBaseInput): Promise<BorrowingBaseResult>;
}

/** Token de inyección: Nest no puede inyectar por interfaz. */
export const CHAIN_PORT = Symbol('CHAIN_PORT');
