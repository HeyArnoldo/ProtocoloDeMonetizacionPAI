import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CURRENCY_CODES } from '@app/contracts';
import { buildTree, type Hex } from '@app/merkle';
import {
  debtorIndices,
  parseStoredSelection,
  sanitizeSelection,
  sumNominalMinor,
  toReceivableLeaves,
} from '@/domain/disclosure-selection';
import { useDisclosurePreview, useSamplePortfolio } from '@/hooks/use-disclosure';
import {
  DisclosureSelectionContext,
  type DisclosureSelectionValue,
} from './disclosure-selection-context';

/**
 * Selección divulgada compartida entre `/divulgacion` y `/borrowing-base`.
 *
 * Es el guion de la demo hecho estado: quien presenta marca cuotas en una
 * pantalla y ve el número cambiar en la otra. Con la selección local a cada
 * página, navegar entre las dos la perdería y el momento —«este número no le
 * pedimos que lo crea, que lo recompute»— no existiría.
 *
 * Se monta en `AppLayout`, que no se desmonta al cambiar de ruta del panel,
 * así que la selección y la prueba construida sobreviven a la navegación.
 *
 * **Por qué `sessionStorage` y no memoria a secas:** un refresco a mitad de
 * demo —o un `Cmd+R` por nervios— borraría la selección delante del jurado.
 * Y por qué `sessionStorage` y no `localStorage`: la selección es una decisión
 * de esta sesión de trabajo, no una preferencia del usuario; heredarla en una
 * pestaña nueva semanas después sería confuso, no útil.
 */

const STORAGE_KEY = 'pai:disclosure-selection';

/** Cota permisiva al leer: la cartera todavía no ha llegado en el primer render. */
const UNBOUNDED = Number.MAX_SAFE_INTEGER;

function readStoredSelection(): number[] {
  try {
    return parseStoredSelection(window.sessionStorage.getItem(STORAGE_KEY), UNBOUNDED);
  } catch {
    // Modo privado de Safari y políticas de almacenamiento bloqueado lanzan
    // aquí. La demo funciona igual, solo pierde la persistencia.
    return [];
  }
}

export function DisclosureSelectionProvider({ children }: { children: ReactNode }) {
  const { data: portfolio, isPending, isError, error } = useSamplePortfolio();
  const preview = useDisclosurePreview();

  const [storedIndices, setStoredIndices] = useState<number[]>(readStoredSelection);

  // Memoizado porque el `?? []` crearía un array nuevo en cada render y
  // recalcularía todos los `useMemo` de abajo sin que nada haya cambiado.
  const receivables = useMemo(() => portfolio?.receivables ?? [], [portfolio]);
  const salt = (portfolio?.salt ?? null) as Hex | null;

  /**
   * La selección efectiva se recorta a la cartera realmente cargada. Un índice
   * guardado que ya no existe apuntaría a `undefined` y contaminaría el nominal.
   */
  const selectedIndices = useMemo(
    () => sanitizeSelection(storedIndices, receivables.length),
    [storedIndices, receivables.length],
  );

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(storedIndices));
    } catch {
      // Ver `readStoredSelection`: sin almacenamiento la demo sigue en pie.
    }
  }, [storedIndices]);

  /**
   * Una prueba construida deja de valer en cuanto cambia la selección: el root
   * seguiría siendo el mismo, pero las hojas y el proof ya no corresponderían a
   * lo que muestra la tabla. Se descarta en vez de dejarla envejecer.
   */
  const replaceSelection = useCallback(
    (next: number[]) => {
      preview.reset();
      setStoredIndices(next);
    },
    [preview],
  );

  const toggle = useCallback(
    (index: number) => {
      const next = new Set(selectedIndices);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      replaceSelection([...next].sort((a, b) => a - b));
    },
    [selectedIndices, replaceSelection],
  );

  const toggleDebtor = useCallback(
    (debtorLabel: string) => {
      const positions = debtorIndices(receivables, debtorLabel);
      const selected = new Set(selectedIndices);
      const allSelected = positions.every((index) => selected.has(index));

      for (const index of positions) {
        if (allSelected) selected.delete(index);
        else selected.add(index);
      }

      replaceSelection([...selected].sort((a, b) => a - b));
    },
    [receivables, selectedIndices, replaceSelection],
  );

  const clear = useCallback(() => replaceSelection([]), [replaceSelection]);

  /**
   * El root sale del árbol completo, no de la selección. Se recomputa en el
   * navegador con el mismo paquete que usa la API para que la pantalla pueda
   * afirmar —y no solo prometer— que ninguna selección lo mueve.
   */
  const treeRoot = useMemo(() => {
    if (!salt || receivables.length === 0) return null;
    try {
      return buildTree(toReceivableLeaves(receivables, salt)).root;
    } catch {
      // `buildTree` valida cada hoja y rechaza duplicados. Una cartera que no
      // forma árbol es un defecto de datos, no algo que la UI deba tapar con
      // un root inventado.
      return null;
    }
  }, [receivables, salt]);

  const selectedLeaves = useMemo(
    () => (salt ? toReceivableLeaves(receivables, salt, selectedIndices) : []),
    [receivables, salt, selectedIndices],
  );

  const buildProof = useCallback(() => {
    if (!portfolio || selectedIndices.length === 0) return;
    preview.mutate({
      salt: portfolio.salt,
      receivables: portfolio.receivables,
      disclosedIndices: selectedIndices,
    });
  }, [portfolio, selectedIndices, preview]);

  const value: DisclosureSelectionValue = useMemo(
    () => ({
      isPending,
      isError,
      error,
      salt,
      receivables,
      treeRoot,
      selectedIndices,
      isSelected: (index: number) => selectedIndices.includes(index),
      toggle,
      toggleDebtor,
      clear,
      disclosedCount: selectedIndices.length,
      hiddenCount: receivables.length - selectedIndices.length,
      totalNominalMinor: sumNominalMinor(
        receivables,
        receivables.map((_, index) => index),
      ),
      selectedNominalMinor: sumNominalMinor(receivables, selectedIndices),
      currency: receivables[0]?.currency ?? CURRENCY_CODES.USD,
      selectedLeaves,
      proof: preview.data ?? null,
      isBuildingProof: preview.isPending,
      proofError: preview.isError ? (preview.error ?? null) : null,
      buildProof,
    }),
    [
      isPending,
      isError,
      error,
      salt,
      receivables,
      treeRoot,
      selectedIndices,
      toggle,
      toggleDebtor,
      clear,
      selectedLeaves,
      preview.data,
      preview.isPending,
      preview.isError,
      preview.error,
      buildProof,
    ],
  );

  return (
    <DisclosureSelectionContext.Provider value={value}>
      {children}
    </DisclosureSelectionContext.Provider>
  );
}
