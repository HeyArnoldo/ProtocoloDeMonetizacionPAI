import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CardBody, CardKicker, PanelCard } from '@/components/panel/panel-card';
import { StatTile } from '@/components/panel/stat-tile';
import { evidenceFileError, formatEvidenceDate, formatFileSize } from '@/domain/evidence-view';
import { useEvidence, useUploadEvidence } from '@/hooks/use-evidence';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Evidence request failed.';
}

export default function EvidencePage() {
  const inventory = useEvidence();
  const upload = useUploadEvidence();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    const error = selected ? evidenceFileError(selected) : null;
    setValidationError(error);
    setFile(error ? null : selected);
    upload.reset();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    upload.mutate(file, {
      onSuccess: () => {
        setFile(null);
        if (inputRef.current) inputRef.current.value = '';
      },
    });
  };

  const documents = inventory.data ?? [];
  return (
    <div className="flex max-w-[1080px] flex-col gap-3 sm:gap-[18px]">
      <section
        aria-label="Evidence footprint"
        className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]"
      >
        <StatTile
          kicker="Documents in storage"
          value={inventory.isPending ? '—' : documents.length}
          note="Encrypted objects represented by persisted metadata"
          valueClassName="text-[25px]"
        />
        <StatTile
          kicker="Files on-chain"
          value="0"
          emphasis="brand"
          note="Design invariant: only a 32-byte root reaches the chain"
          valueClassName="text-[25px]"
        />
      </section>

      <PanelCard>
        <CardKicker>Upload evidence</CardKicker>
        <CardBody>
          Select one file, up to 25 MiB. The API remains authoritative and computes its SHA-256
          fingerprint before persisting metadata.
        </CardBody>
        <form className="mt-1 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={submit}>
          <div className="grid gap-1.5">
            <Label htmlFor="evidence-file">Evidence file</Label>
            <Input
              ref={inputRef}
              id="evidence-file"
              type="file"
              onChange={chooseFile}
              disabled={upload.isPending}
              aria-describedby="evidence-file-hint"
            />
            <p id="evidence-file-hint" className="text-muted-foreground text-xs">
              The file stays off-chain; no private download or preview is exposed here.
            </p>
          </div>
          <Button type="submit" disabled={!file || upload.isPending}>
            {upload.isPending ? 'Uploading…' : 'Upload evidence'}
          </Button>
        </form>
        {validationError || upload.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {validationError ?? errorMessage(upload.error)}
          </p>
        ) : upload.isSuccess ? (
          <p role="status" className="text-brand-300 text-sm">
            Upload completed.
          </p>
        ) : null}
      </PanelCard>

      <PanelCard className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardKicker>Persisted inventory</CardKicker>
            <h2 className="text-[17px] font-medium">Evidence metadata</h2>
          </div>
          {inventory.isError ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void inventory.refetch()}
            >
              Retry
            </Button>
          ) : null}
        </div>

        {inventory.isPending ? (
          <p role="status" className="text-muted-foreground text-sm">
            Loading evidence…
          </p>
        ) : inventory.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage(inventory.error)}
          </p>
        ) : documents.length === 0 ? (
          <CardBody>No evidence has been uploaded for this account.</CardBody>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {documents.map((item) => (
              <li key={item.id} className="border-border min-w-0 rounded-md border p-3">
                <p className="truncate text-sm font-medium" title={item.originalName}>
                  {item.originalName}
                </p>
                <p className="text-muted-foreground text-xs">
                  {item.mimeType} · {formatFileSize(item.sizeBytes)} ·{' '}
                  {formatEvidenceDate(item.createdAt)}
                </p>
                <p className="mono mt-2 break-all text-[11px]" title="SHA-256 fingerprint">
                  {item.sha256}
                </p>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>
    </div>
  );
}
