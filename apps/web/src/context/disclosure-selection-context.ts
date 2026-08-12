import { createContext } from 'react';
import type { AssetReceivableResponse, DisclosurePreviewResponse } from '@app/contracts';
import type { Hex, ReceivableLeaf } from '@app/merkle';

/**
 * Contrato de la selección divulgada compartida.
 *
 * Vive en su propio archivo, sin componentes, por dos razones: `react-refresh`
 * pierde el estado del módulo si un archivo exporta a la vez un contexto y un
 * componente, y así el proveedor y el hook pueden importarlo sin ciclos.
 */

export interface DisclosureSelectionValue {
  /** Activo efectivo de la sesión, tomado del query o recuperado de sessionStorage. */
  assetId: string | null;
  registrationConfirmed: boolean;

  /** Estado de `GET /api/disclosure/sample`. */
  isPending: boolean;
  isError: boolean;
  error: unknown;

  /** Salt del expediente. Fijo por sesión: si cambiara, cambiaría el root. */
  salt: Hex | null;
  receivables: AssetReceivableResponse[];

  /**
   * Root del expediente completo, recomputado en el navegador con
   * `@app/merkle`. **No depende de la selección**: es el argumento entero de
   * la pantalla de divulgación.
   */
  treeRoot: Hex | null;

  /** Índices divulgados, únicos y en orden ascendente. */
  selectedIndices: number[];
  isSelected: (index: number) => boolean;
  toggle: (index: number) => void;
  toggleDebtor: (debtorLabel: string) => void;
  clear: () => void;

  disclosedCount: number;
  hiddenCount: number;
  totalNominalMinor: bigint;
  selectedNominalMinor: bigint;
  /** Moneda de la cartera. Todas las cuotas del expediente comparten una. */
  currency: number;

  /** Hojas divulgadas, listas para `computeBorrowingBase` y para el árbol. */
  selectedLeaves: ReceivableLeaf[];

  /** Última respuesta de `POST /api/disclosure/preview`, si se construyó. */
  proof: DisclosurePreviewResponse | null;
  isBuildingProof: boolean;
  proofError: unknown;
  buildProof: () => void;
  borrowingBaseComputed: boolean;
  markBorrowingBaseComputed: () => void;
}

export const DisclosureSelectionContext = createContext<DisclosureSelectionValue | null>(null);
