import { useContext } from 'react';
import {
  DisclosureSelectionContext,
  type DisclosureSelectionValue,
} from '@/context/disclosure-selection-context';

/**
 * Selección divulgada compartida por `/divulgacion` y `/borrowing-base`.
 *
 * Falla ruidosamente fuera del proveedor: un valor por defecto silencioso
 * dejaría una pantalla mostrando cero cuotas divulgadas sin ninguna pista de
 * que el proveedor se quedó fuera del árbol.
 */
export function useDisclosureSelection(): DisclosureSelectionValue {
  const value = useContext(DisclosureSelectionContext);

  if (!value) {
    throw new Error(
      'useDisclosureSelection necesita estar dentro de <DisclosureSelectionProvider>.',
    );
  }

  return value;
}
