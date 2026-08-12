import { Link } from 'react-router-dom';
import type { AssetListResponse, AssetRegistrationState } from '@app/contracts';
import { Button } from '@/components/ui/button';
import { CardBody } from '@/components/panel/panel-card';
import { HashValue } from '@/components/panel/hash-value';
import { formatAssetListEntry, type AssetDiscovery } from '@/domain/asset-discovery';
import { cn } from '@/lib/utils';

/**
 * La puerta de entrada al expediente que no es pegar un identificador.
 *
 * Pegar un `0x…` de 66 caracteres era la **única** forma de abrir un
 * expediente: quien no lo tuviera a mano se quedaba fuera de su propio panel, y
 * cualquier tropiezo terminaba en la misma pantalla vacía.
 *
 * Los tres desenlaces se pintan distintos a propósito —vacío, listado caído y
 * listado con expedientes— porque son tres hechos distintos y cada uno pide una
 * acción distinta. `assetDiscovery()` decide cuál es; aquí solo se dibuja.
 */

/** El estado que la base puede afirmar sin preguntarle a la cadena. */
const REGISTRATION_STATE_LABEL: Record<AssetRegistrationState, string> = {
  draft: 'Borrador',
  submitted: 'Registro enviado',
  registered: 'Registrado on-chain',
};

export interface AssetListPickerProps {
  discovery: AssetDiscovery;
  assets: AssetListResponse | undefined;
  /** Expediente abierto ahora mismo, para marcarlo en la lista. */
  selectedId: string | null;
  onSelect: (assetId: string) => void;
}

export function AssetListPicker({ discovery, assets, selectedId, onSelect }: AssetListPickerProps) {
  if (discovery.kind === 'loading') {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        Cargando expedientes…
      </p>
    );
  }

  /**
   * Un listado caído no es un listado vacío.
   *
   * Decir «no hay expedientes» aquí le diría a quien acaba de registrar uno que
   * lo perdió. Se declara lo único que se sabe: que no se pudo comprobar.
   */
  if (discovery.kind === 'unavailable') {
    return (
      <div
        role="alert"
        className="border-destructive/40 flex flex-col gap-1.5 rounded-md border border-dashed p-4"
      >
        <p className="text-destructive text-sm">
          No se pudo cargar el listado de expedientes: {discovery.message}
        </p>
        <CardBody>
          El panel no está afirmando que no tengas ninguno: no pudo comprobarlo. Reintenta o abre
          uno por su identificador.
        </CardBody>
      </div>
    );
  }

  if (discovery.kind === 'empty') {
    return (
      <div
        role="note"
        aria-label="Expedientes: ninguno todavía"
        className="border-ink-800 flex flex-col items-start gap-2 rounded-md border border-dashed p-4"
      >
        <p className="text-[13.5px]">Todavía no hay expedientes</p>
        <CardBody>
          El listado respondió y esta cuenta no tiene ninguno. No es un fallo: es una cuenta recién
          abierta.
        </CardBody>
        <Button asChild variant="outline" size="sm">
          <Link to="/expediente/nuevo">Crear el primer expediente</Link>
        </Button>
      </div>
    );
  }

  return (
    /* Nombre accesible obligatorio: el sidebar del panel también es una lista de
       `listitem` y sin él no hay forma —ni para un lector de pantalla ni para un
       test— de referirse solo a esta. */
    <ul aria-label="Expedientes" className="grid gap-2 md:grid-cols-2">
      {(assets ?? []).map((item) => {
        const selected = item.id === selectedId;
        return (
          <li key={item.id} className="flex min-w-0">
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              aria-current={selected ? 'true' : undefined}
              // `min-h-11` por el mínimo táctil de 44px que audita el spec de
              // responsive; el contenido ya lo supera, pero no por contrato.
              className={cn(
                'border-border hover:border-primary/60 flex min-h-11 w-full min-w-0 flex-col gap-1 rounded-md border p-3 text-left transition-colors',
                selected && 'border-primary bg-primary/5',
              )}
            >
              <span className="flex flex-wrap items-center gap-2">
                <HashValue value={item.id} leading={14} />
                {/* Un ADMIN ve expedientes que no creó. Sin esta marca, abrir
                    uno ajeno parecería un expediente propio olvidado. */}
                {item.ownedByRequester ? null : (
                  <span className="border-ink-700 text-ink-300 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.08em]">
                    De otra cuenta
                  </span>
                )}
              </span>
              <span className="text-muted-foreground text-xs">{formatAssetListEntry(item)}</span>
              <span className="text-[11px] font-medium">
                {REGISTRATION_STATE_LABEL[item.registrationState]}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
