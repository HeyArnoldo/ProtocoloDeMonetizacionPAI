import { describe, expect, it } from 'vitest';
import type { AssetListResponse } from '@app/contracts';
import { assetDiscovery, formatAssetListEntry, unresolvedAssetMessage } from './asset-discovery';

/**
 * El módulo existe por una sola razón de producto: **«lista vacía» y
 * «expediente invisible» no pueden verse igual**. Si el panel dice «no hay
 * expedientes» cuando en realidad el listado falló, quien acaba de registrar
 * uno cree que perdió el trabajo. Y si dice «no existe» cuando el expediente
 * existe pero es de otra cuenta, el panel afirma algo que no puede saber.
 *
 * Por eso `empty` es un estado alcanzable **solo** desde una respuesta
 * correcta, y hay un test dedicado a eso.
 */

function listItem(id: string): AssetListResponse[number] {
  return {
    id,
    createdAt: '2026-08-08T15:00:00.000Z',
    merkleRoot: `0x${'cd'.repeat(32)}`,
    controller: `0x${'12'.repeat(20)}`,
    registrationConfirmed: true,
    registrationTxHash: `0x${'55'.repeat(32)}`,
    registrationBlockNumber: 12_345,
    registrationState: 'registered',
    receivableCount: 16,
    totalAmountMinor: '12480000',
    ownedByRequester: true,
  };
}

const A = listItem(`0x${'1d'.repeat(32)}`);
const B = listItem(`0x${'2e'.repeat(32)}`);

const query = (overrides: Partial<Parameters<typeof assetDiscovery>[0]> = {}) => ({
  isPending: false,
  isError: false,
  error: null as unknown,
  data: undefined as AssetListResponse | undefined,
  ...overrides,
});

describe('assetDiscovery', () => {
  it('mientras el listado viaja, la pantalla no afirma nada', () => {
    expect(assetDiscovery(query({ isPending: true }))).toEqual({ kind: 'loading' });
  });

  it('traduce el fallo del listado con el mismo mapeo de errores del expediente', () => {
    expect(assetDiscovery(query({ isError: true, error: { response: { status: 403 } } }))).toEqual({
      kind: 'unavailable',
      message: 'You do not have permission to view this asset.',
    });
    expect(assetDiscovery(query({ isError: true, error: new Error('offline') }))).toEqual({
      kind: 'unavailable',
      message: 'offline',
    });
  });

  it('una respuesta correcta sin expedientes es vacío', () => {
    expect(assetDiscovery(query({ data: [] }))).toEqual({ kind: 'empty' });
  });

  it('cuenta los expedientes visibles', () => {
    expect(assetDiscovery(query({ data: [A, B] }))).toEqual({ kind: 'ready', total: 2 });
  });

  /**
   * El test que da sentido al módulo. Un listado que falló no puede degradar a
   * «no hay expedientes»: son dos hechos distintos y el usuario actúa distinto
   * ante cada uno —crear el primero, o reintentar—.
   */
  it('nunca declara vacío un listado que falló, ni siquiera si trae un array vacío', () => {
    const failed = assetDiscovery(
      query({ isError: true, error: new Error('network down'), data: [] }),
    );

    expect(failed.kind).not.toBe('empty');
    expect(failed).toEqual({ kind: 'unavailable', message: 'network down' });
  });

  /** Sin datos y sin error tampoco hay nada que afirmar: no es un vacío. */
  it('tampoco declara vacío cuando no hay datos ni error', () => {
    expect(assetDiscovery(query()).kind).not.toBe('empty');
  });
});

describe('unresolvedAssetMessage', () => {
  it('sobre un listado vacío señala que aún no hay expedientes y hacia dónde ir', () => {
    const message = unresolvedAssetMessage({ kind: 'empty' });

    expect(message).toMatch(/todavía no hay/i);
    expect(message).toMatch(/crea/i);
  });

  it('sobre un listado con expedientes dice cuántos se ven', () => {
    expect(unresolvedAssetMessage({ kind: 'ready', total: 2 })).toBe(
      'Ese identificador no aparece entre los 2 expedientes que puedes ver.',
    );
  });

  it('con un solo expediente visible no fuerza el plural', () => {
    expect(unresolvedAssetMessage({ kind: 'ready', total: 1 })).toMatch(/único expediente/);
  });

  it('sin listado no afirma que el expediente no exista', () => {
    for (const discovery of [
      { kind: 'unavailable', message: 'offline' } as const,
      { kind: 'loading' } as const,
    ]) {
      const message = unresolvedAssetMessage(discovery);

      expect(message).toMatch(/no se pudo comprobar/i);
      expect(message).not.toMatch(/no existe/i);
    }
  });
});

describe('formatAssetListEntry', () => {
  it('resume cuota, total y fecha sin inventar una moneda', () => {
    // `GET /assets` suma `amountMinor` sin agrupar por moneda: el listado no
    // sabe en cuál está el total, así que la cifra va sin etiqueta.
    expect(formatAssetListEntry(A)).toBe('16 cuotas · 124,800.00 · Aug 8, 2026');
  });

  it('no pluraliza una cuota única', () => {
    expect(formatAssetListEntry({ ...A, receivableCount: 1 })).toMatch(/^1 cuota · /);
  });
});
