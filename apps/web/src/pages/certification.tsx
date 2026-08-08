import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CardBody, CardKicker, PanelCard } from '@/components/panel/panel-card';
import { HashValue } from '@/components/panel/hash-value';
import {
  CERTIFICATION_KINDS,
  buildCertificationIntent,
  type CertificationKind,
} from '@/domain/certification-intent';
import { validateDossierAssetId } from '@/domain/dossier-view';
import { useCertificationSnapshot } from '@/hooks/use-disclosure';
import { useTransactionIntent } from '@/hooks/use-transaction-intent';
import { InjectedWalletSubmitter, injectedProvider } from '@/services/transaction-intent';

function message(error: unknown): string {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 404) return 'No registered on-chain asset was found.';
  return error instanceof Error ? error.message : 'Certification snapshot failed.';
}

export default function CertificationPage() {
  const [input, setInput] = useState('');
  const [assetId, setAssetId] = useState<string | null>(null);
  const [kind, setKind] = useState<CertificationKind>(0);
  const [certificateHash, setCertificateHash] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const snapshot = useCertificationSnapshot(assetId);
  const submitter = useMemo(() => new InjectedWalletSubmitter(injectedProvider()), []);
  const transaction = useTransactionIntent(submitter);
  const busy = transaction.status === 'preparing' || transaction.status === 'submitting';

  const inspect = (event: FormEvent) => {
    event.preventDefault();
    const next = input.trim();
    const error = validateDossierAssetId(next);
    setValidationError(error);
    transaction.reset();
    if (!error) setAssetId(next);
  };

  const transact = (action: 'attest' | 'revoke') => {
    if (!assetId) return;
    transaction.reset();
    setValidationError(null);
    try {
      const body = buildCertificationIntent(action, assetId, kind, certificateHash.trim());
      void transaction.execute(action, body).catch(() => undefined);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Invalid certification input.');
    }
  };

  const activeKinds = new Set(snapshot.data?.attestations.map((item) => item.kind) ?? []);
  const complete = CERTIFICATION_KINDS.every((item) => activeKinds.has(item.key));

  return (
    <div className="flex max-w-[1180px] flex-col gap-4">
      <PanelCard>
        <CardKicker>Public chain inspection</CardKicker>
        <CardBody>
          Certifiers inspect public registry and attestation state only. Private receivables,
          evidence, debtor identifiers, and dossier salts are never returned by this endpoint.
        </CardBody>
        <form className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={inspect}>
          <div className="grid gap-1.5">
            <Label htmlFor="certification-asset-id">Asset ID</Label>
            <Input
              id="certification-asset-id"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="0x… bytes32"
              autoComplete="off"
            />
          </div>
          <Button type="submit">Inspect asset</Button>
        </form>
        {validationError ? (
          <p role="alert" className="text-destructive text-sm">
            {validationError}
          </p>
        ) : null}
        {!assetId ? (
          <CardBody>Enter a registered asset ID to inspect certification state.</CardBody>
        ) : snapshot.isPending ? (
          <p role="status" className="text-muted-foreground text-sm">
            Loading public chain state…
          </p>
        ) : snapshot.isError ? (
          <div className="flex items-center gap-3">
            <p role="alert" className="text-destructive text-sm">
              {message(snapshot.error)}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void snapshot.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : null}
      </PanelCard>

      {snapshot.data ? (
        <>
          <PanelCard>
            <CardKicker>
              {snapshot.data.blockNumber === null
                ? 'In-memory / non-canonical snapshot'
                : `Block ${snapshot.data.blockNumber}`}
            </CardKicker>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <HashValue value={snapshot.data.registry.assetId} leading={18} />
              <strong>
                {complete ? 'Complete · 3/3 active kinds' : `${activeKinds.size}/3 active kinds`}
              </strong>
            </div>
            <CardBody>
              Registry status: {snapshot.data.registry.status}.{' '}
              {snapshot.data.certificate.supported
                ? `Certificate state: ${snapshot.data.certificate.valid ? 'valid' : 'not issued'}.`
                : 'Certificate contract state is unsupported by this adapter.'}
            </CardBody>
          </PanelCard>

          <section aria-label="Active certification state" className="grid gap-3 md:grid-cols-3">
            {CERTIFICATION_KINDS.map((item) => {
              const records = snapshot.data.attestations.filter((entry) => entry.kind === item.key);
              return (
                <PanelCard key={item.key}>
                  <CardKicker>{item.label}</CardKicker>
                  <p className="text-sm font-medium">
                    {records.length ? `${records.length} active` : 'Missing'}
                  </p>
                  {records.map((record) => (
                    <div
                      key={`${record.certifier}:${record.certificateHash}`}
                      className="border-border border-t pt-2"
                    >
                      <HashValue value={record.certifier} />
                      <HashValue value={record.certificateHash} />
                      <p className="text-muted-foreground text-xs">
                        {new Date(record.attestedAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </PanelCard>
              );
            })}
          </section>

          <PanelCard aria-live="polite">
            <CardKicker>Wallet transaction</CardKicker>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="certification-kind">Certification kind</Label>
                <select
                  id="certification-kind"
                  className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                  value={kind}
                  onChange={(e) => setKind(Number(e.target.value) as CertificationKind)}
                  disabled={busy}
                >
                  {CERTIFICATION_KINDS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.value} · {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="certificate-hash">Certificate hash</Label>
                <Input
                  id="certificate-hash"
                  value={certificateHash}
                  onChange={(e) => setCertificateHash(e.target.value)}
                  placeholder="0x… bytes32 (attest only)"
                  disabled={busy}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => transact('attest')} disabled={busy}>
                Attest with wallet
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => transact('revoke')}
                disabled={busy}
              >
                Revoke my attestation
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => void snapshot.refetch()}
                disabled={busy}
              >
                Refresh chain state
              </Button>
            </div>
            <CardBody>
              {transaction.status === 'preparing'
                ? 'Preparing unsigned calldata…'
                : transaction.status === 'submitting'
                  ? 'Confirm in your wallet…'
                  : 'The API prepares calldata; the connected wallet submits it explicitly. Contract roles remain authoritative.'}
            </CardBody>
            {transaction.error ? (
              <p role="alert" className="text-destructive text-sm">
                {transaction.error.message}
              </p>
            ) : null}
            {transaction.hash ? (
              <p role="status" className="mono break-all text-xs">
                Submitted: {transaction.hash}
              </p>
            ) : null}
          </PanelCard>
        </>
      ) : null}
    </div>
  );
}
