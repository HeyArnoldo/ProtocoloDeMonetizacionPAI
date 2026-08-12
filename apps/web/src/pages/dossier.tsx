import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CardBody, CardKicker, PanelCard } from '@/components/panel/panel-card';
import { HashValue } from '@/components/panel/hash-value';
import { AssetListPicker } from '@/components/panel/asset-list-picker';
import { assetDiscovery, unresolvedAssetMessage } from '@/domain/asset-discovery';
import {
  dossierErrorMessage,
  formatDossierDate,
  isAssetNotFound,
  validateDossierAssetId,
} from '@/domain/dossier-view';
import { formatMinorUnits } from '@/domain/money';
import { useAssetList, useAssetPortfolio } from '@/hooks/use-disclosure';
import { useDisclosureSelection } from '@/hooks/use-disclosure-selection';

export default function DossierPage() {
  const [, setSearchParams] = useSearchParams();
  // El expediente activo lo resuelve el proveedor (query > recordado); esta
  // pantalla ya no guarda su propia copia en `sessionStorage`.
  const { assetId, selectAsset } = useDisclosureSelection();
  const validationError = assetId === null ? null : validateDossierAssetId(assetId);
  const query = useAssetPortfolio(assetId !== null && validationError === null ? assetId : null);
  const list = useAssetList();
  const discovery = assetDiscovery(list);
  const [input, setInput] = useState(assetId ?? '');
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => setInput(assetId ?? ''), [assetId]);

  const open = (next: string) => {
    setSubmitError(null);
    selectAsset(next);
    // La URL sigue mandando sobre lo recordado, así que abrir desde la lista
    // tiene que escribirla: si no, el `?assetId=` anterior ganaría al clic.
    setSearchParams({ assetId: next });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = input.trim();
    const error = validateDossierAssetId(next);
    setSubmitError(error);
    if (error) return;
    open(next);
  };

  const receivables = useMemo(
    () => [...(query.data?.receivables ?? [])].sort((a, b) => a.position - b.position),
    [query.data],
  );

  /**
   * El 404 se responde con la cuenta de lo que sí se ve.
   *
   * «Asset not found» es indistinguible de «existe pero no es tuyo», y la API
   * devuelve 404 en los dos casos a propósito. Solo el listado puede decir
   * cuántos expedientes ve esta cuenta, y esa cifra es la que convierte un
   * callejón sin salida en una pista.
   */
  const assetErrorMessage = isAssetNotFound(query.error)
    ? unresolvedAssetMessage(discovery)
    : dossierErrorMessage(query.error);

  return (
    <div className="flex max-w-[1180px] flex-col gap-4 sm:gap-5">
      <PanelCard className="gap-3">
        <div>
          <CardKicker>Expedientes de la cuenta</CardKicker>
          <h2 className="text-[17px] font-medium">
            {discovery.kind === 'ready'
              ? `${discovery.total} expediente${discovery.total === 1 ? '' : 's'} a la vista`
              : 'Elige un expediente'}
          </h2>
        </div>
        <AssetListPicker
          discovery={discovery}
          assets={list.data}
          selectedId={assetId}
          onSelect={open}
        />
      </PanelCard>

      <PanelCard>
        <CardKicker>Persisted asset</CardKicker>
        {/* El campo de pegar el identificador sobrevive a la lista: en la demo
            se abre un expediente desde un enlace o desde otra pantalla. Ya no es
            la única puerta, que era el problema. */}
        <form className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={submit}>
          <div className="grid gap-1.5">
            <Label htmlFor="dossier-asset-id">Asset ID</Label>
            <Input
              id="dossier-asset-id"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="0x… (32-byte lowercase hex)"
              autoComplete="off"
            />
          </div>
          <Button type="submit">Load asset</Button>
        </form>
        {submitError || validationError ? (
          <p role="alert" className="text-destructive text-sm">
            {submitError ?? validationError}
          </p>
        ) : assetId === null ? (
          <CardBody>Elige un expediente de la lista o pega su identificador.</CardBody>
        ) : query.isPending ? (
          <p role="status" className="text-muted-foreground text-sm">
            Loading asset…
          </p>
        ) : query.isError ? (
          <div className="flex items-center gap-3">
            <p role="alert" className="text-destructive text-sm">
              {assetErrorMessage}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
              Retry
            </Button>
          </div>
        ) : null}
      </PanelCard>

      {query.data ? (
        <>
          <section aria-label="Asset identity" className="grid gap-3 md:grid-cols-2">
            <PanelCard>
              <CardKicker>Asset ID</CardKicker>
              <HashValue value={query.data.id} leading={18} />
            </PanelCard>
            <PanelCard>
              <CardKicker>Merkle root</CardKicker>
              <HashValue value={query.data.merkleRoot} leading={18} />
            </PanelCard>
            <PanelCard>
              <CardKicker>Controller</CardKicker>
              <HashValue value={query.data.controller} leading={18} />
            </PanelCard>
            <PanelCard>
              <CardKicker>Registration</CardKicker>
              <p className="text-sm font-medium">
                {query.data.registrationConfirmed ? 'Confirmed' : 'Pending confirmation'}
              </p>
              <CardBody>
                Block: {query.data.registrationBlockNumber ?? 'Not confirmed'} · Created{' '}
                {formatDossierDate(query.data.createdAt)}
              </CardBody>
              {query.data.registrationTxHash ? (
                <HashValue value={query.data.registrationTxHash} leading={18} />
              ) : null}
            </PanelCard>
          </section>

          <PanelCard className="gap-3">
            <div>
              <CardKicker>Ordered receivables</CardKicker>
              <h2 className="text-[17px] font-medium">{receivables.length} persisted entries</h2>
            </div>
            {/* La lista lleva nombre accesible: el sidebar del panel también es
                una lista de `listitem` y sin nombre no hay forma —ni para un
                lector de pantalla ni para un test— de referirse solo a esta. */}
            <ol aria-label="Ordered receivables" className="grid gap-2 md:grid-cols-2">
              {receivables.map((item) => (
                <li key={item.id} className="border-border min-w-0 rounded-md border p-3">
                  <p className="text-sm font-medium">
                    #{item.position + 1} · {item.debtorLabel}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatMinorUnits(item.amountMinor, item.currency)} · Due {item.dueDate}
                  </p>
                  <dl className="mt-2 grid gap-1 text-xs">
                    <div>
                      <dt className="inline text-muted-foreground">Evidence ID: </dt>
                      <dd className="mono inline break-all">{item.evidenceId}</dd>
                    </div>
                    <div>
                      <dt className="inline text-muted-foreground">Document hash: </dt>
                      <dd className="inline">
                        <HashValue value={item.docHash} leading={16} />
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ol>
          </PanelCard>
        </>
      ) : null}
    </div>
  );
}
