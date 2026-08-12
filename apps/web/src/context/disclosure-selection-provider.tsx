import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { CURRENCY_CODES } from '@app/contracts';
import type { Hex, ReceivableLeaf } from '@app/merkle';
import {
  debtorIndices,
  parseStoredSelection,
  sanitizeSelection,
  sumNominalMinor,
} from '@/domain/disclosure-selection';
import { resolveDossierAssetId } from '@/domain/dossier-view';
import { useAssetPortfolio, useDisclosurePreview } from '@/hooks/use-disclosure';
import {
  DisclosureSelectionContext,
  type DisclosureSelectionValue,
} from './disclosure-selection-context';
import { operationalStorageKeys, resetProgressForAssetChange } from '@/domain/operational-storage';

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

/** Cota permisiva al leer: la cartera todavía no ha llegado en el primer render. */
const UNBOUNDED = Number.MAX_SAFE_INTEGER;

function readStoredSelection(key: string): number[] {
  try {
    return parseStoredSelection(window.sessionStorage.getItem(key), UNBOUNDED);
  } catch {
    // Modo privado de Safari y políticas de almacenamiento bloqueado lanzan
    // aquí. La demo funciona igual, solo pierde la persistencia.
    return [];
  }
}

export function DisclosureSelectionProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const storageKeys = useMemo(() => operationalStorageKeys(userId), [userId]);
  const location = useLocation();
  const requestedAssetId = new URLSearchParams(location.search).get('assetId');
  const [rememberedAssetId, setRememberedAssetId] = useState(() => {
    try {
      return window.sessionStorage.getItem(storageKeys.asset);
    } catch {
      return null;
    }
  });
  // `?assetId=` manda sobre lo recordado: un enlace compartido abre ese
  // expediente aunque la sesión venga de otro. La regla vive en el dominio y
  // está probada allí, no reescrita aquí.
  const assetId = resolveDossierAssetId(location.search, rememberedAssetId);
  const previousAssetId = useRef(assetId);
  const { data: portfolio, isPending, isError, error } = useAssetPortfolio(assetId);
  const preview = useDisclosurePreview();
  const resetPreview = preview.reset;

  const [storedIndices, setStoredIndices] = useState<number[]>(() =>
    readStoredSelection(storageKeys.selection),
  );
  const [computedSelectionKey, setComputedSelectionKey] = useState<string | null>(null);

  // Memoizado porque el `?? []` crearía un array nuevo en cada render y
  // recalcularía todos los `useMemo` de abajo sin que nada haya cambiado.
  const receivables = useMemo(() => portfolio?.receivables ?? [], [portfolio]);
  const salt: Hex | null = null;

  /**
   * Memoria de la última selección, no fuente de verdad.
   *
   * **La fuente de verdad de qué expedientes existen es `GET /assets`.** Esto
   * solo evita que un refresco a mitad de demo obligue a volver a elegir. Si lo
   * guardado ya no aparece en el listado, manda el listado: por eso la pantalla
   * puede decir «no está entre los N que ves» en vez de suponer que existe.
   */
  const selectAsset = useCallback(
    (next: string | null) => {
      setRememberedAssetId(next);
      try {
        if (next === null) window.sessionStorage.removeItem(storageKeys.asset);
        else window.sessionStorage.setItem(storageKeys.asset, next);
      } catch {
        // Ver `readStoredSelection`: sin almacenamiento la demo sigue en pie.
      }
    },
    [storageKeys.asset],
  );

  useEffect(() => {
    if (!requestedAssetId) return;
    selectAsset(requestedAssetId);
  }, [requestedAssetId, selectAsset]);

  useEffect(() => {
    const reset = resetProgressForAssetChange(previousAssetId.current, assetId);
    previousAssetId.current = assetId;
    if (!reset) return;
    if (reset.resetPreview) resetPreview();
    setStoredIndices(reset.selection);
    setComputedSelectionKey(reset.computedSelectionKey);
  }, [assetId, resetPreview]);

  /**
   * La selección efectiva se recorta a la cartera realmente cargada. Un índice
   * guardado que ya no existe apuntaría a `undefined` y contaminaría el nominal.
   */
  const selectedIndices = useMemo(
    () => sanitizeSelection(storedIndices, receivables.length),
    [storedIndices, receivables.length],
  );
  const selectionKey = selectedIndices.join(',');

  useEffect(() => {
    try {
      window.sessionStorage.setItem(storageKeys.selection, JSON.stringify(storedIndices));
    } catch {
      // Ver `readStoredSelection`: sin almacenamiento la demo sigue en pie.
    }
  }, [storageKeys.selection, storedIndices]);

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
  const treeRoot = (portfolio?.merkleRoot ?? null) as Hex | null;

  const selectedLeaves = useMemo(
    () =>
      (preview.variables?.assetId === assetId ? (preview.data?.disclosedLeaves ?? []) : []).map(
        ({ leafHash, amountMinor, currency, ...leaf }): ReceivableLeaf => {
          void leafHash;
          return {
            ...leaf,
            debtorHash: leaf.debtorHash as Hex,
            docHash: leaf.docHash as Hex,
            amountMinor: BigInt(amountMinor),
            currency: currency as ReceivableLeaf['currency'],
          };
        },
      ),
    [assetId, preview.data, preview.variables?.assetId],
  );

  const buildProof = useCallback(() => {
    if (!assetId || selectedIndices.length === 0) return;
    preview.mutate({
      assetId,
      request: { disclosedIndices: selectedIndices },
    });
  }, [assetId, selectedIndices, preview]);
  const markBorrowingBaseComputed = useCallback(
    () => setComputedSelectionKey(`${assetId}:${selectionKey}`),
    [assetId, selectionKey],
  );

  const value: DisclosureSelectionValue = useMemo(
    () => ({
      assetId,
      selectAsset,
      registrationConfirmed: portfolio?.registrationConfirmed === true,
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
      proof: preview.variables?.assetId === assetId ? (preview.data ?? null) : null,
      isBuildingProof: preview.isPending,
      proofError: preview.isError ? (preview.error ?? null) : null,
      buildProof,
      borrowingBaseComputed:
        computedSelectionKey === `${assetId}:${selectionKey}` && selectedIndices.length > 0,
      markBorrowingBaseComputed,
    }),
    [
      assetId,
      selectAsset,
      portfolio?.registrationConfirmed,
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
      preview.variables?.assetId,
      preview.isPending,
      preview.isError,
      preview.error,
      buildProof,
      markBorrowingBaseComputed,
      computedSelectionKey,
      selectionKey,
    ],
  );

  return (
    <DisclosureSelectionContext.Provider value={value}>
      {children}
    </DisclosureSelectionContext.Provider>
  );
}
