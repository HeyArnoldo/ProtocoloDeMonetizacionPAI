import { useMemo, useState } from 'react';
import type { DisclosurePreviewResponse, Receivable } from '@app/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDisclosurePreview, useSamplePortfolio } from '@/hooks/use-disclosure';

const CURRENCY_LABEL: Record<number, string> = { 840: 'USD', 604: 'PEN' };

/** Las unidades menores son enteros: formatear con float perdería precisión. */
function formatAmount(amountMinor: string, currency: number): string {
  const minor = BigInt(amountMinor);
  const units = minor / 100n;
  const cents = minor % 100n;
  const grouped = units.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${CURRENCY_LABEL[currency] ?? currency} ${grouped}.${cents.toString().padStart(2, '0')}`;
}

function truncateHex(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function formatDueDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

export default function DisclosurePage() {
  const { data: portfolio, isPending, isError, error } = useSamplePortfolio();
  const preview = useDisclosurePreview();
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Memoizado porque el `?? []` crearia un array nuevo en cada render y
  // recalcularia los useMemo de abajo sin que nada haya cambiado.
  const receivables: Receivable[] = useMemo(() => portfolio?.receivables ?? [], [portfolio]);

  const totalNominal = useMemo(
    () => receivables.reduce((total, item) => total + BigInt(item.amountMinor), 0n),
    [receivables],
  );

  function toggle(index: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleDebtor(label: string) {
    const indices = receivables
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.debtorLabel === label)
      .map(({ index }) => index);

    const allSelected = indices.every((index) => selected.has(index));
    setSelected((current) => {
      const next = new Set(current);
      for (const index of indices) {
        if (allSelected) next.delete(index);
        else next.add(index);
      }
      return next;
    });
  }

  function buildProof() {
    if (!portfolio || selected.size === 0) return;
    preview.mutate({
      salt: portfolio.salt,
      receivables: portfolio.receivables,
      disclosedIndices: [...selected].sort((a, b) => a - b),
    });
  }

  const debtors = useMemo(
    () => [...new Set(receivables.map((item) => item.debtorLabel))],
    [receivables],
  );

  if (isPending) {
    return (
      <div className="space-y-4 py-8">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-12 text-center">
        <p className="text-destructive">No se pudo cargar la cartera: {String(error)}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Divulgación selectiva</h1>
        <p className="text-muted-foreground max-w-3xl text-sm">
          Elige qué cuotas mostrarle al prestamista. La prueba demuestra que pertenecen al
          expediente certificado <strong>sin revelar las demás ni sus contrapartes</strong>. Sin ZK:
          solo un árbol de Merkle.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <span className="text-muted-foreground self-center text-sm">Seleccionar por deudor:</span>
        {debtors.map((label) => (
          <Button key={label} variant="outline" size="sm" onClick={() => toggleDebtor(label)}>
            {label}
          </Button>
        ))}
        <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
          Limpiar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cartera del expediente</CardTitle>
          <CardDescription>
            {receivables.length} cuotas · nominal total {formatAmount(totalNominal.toString(), 840)}{' '}
            · {selected.size} seleccionadas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12" />
                <TableHead>Deudor</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receivables.map((item, index) => (
                <TableRow
                  key={`${item.docHash}`}
                  data-state={selected.has(index) ? 'selected' : undefined}
                  className="cursor-pointer"
                  onClick={() => toggle(index)}
                >
                  <TableCell>
                    {/* El checkbox nativo del navegador ignora el tema oscuro:
                        se usa el primitivo del sistema para que tome los tokens. */}
                    <Checkbox
                      checked={selected.has(index)}
                      onCheckedChange={() => toggle(index)}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`Divulgar cuota de ${item.debtorLabel} con vencimiento ${item.dueDate}`}
                    />
                  </TableCell>
                  <TableCell>{item.debtorLabel}</TableCell>
                  <TableCell className="text-muted-foreground">{item.dueDate}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(item.amountMinor, item.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={buildProof} disabled={selected.size === 0 || preview.isPending}>
          {preview.isPending ? 'Construyendo prueba…' : `Construir prueba (${selected.size})`}
        </Button>
        {preview.isError && (
          <p className="text-destructive text-sm">
            {String(preview.error?.message ?? preview.error)}
          </p>
        )}
      </div>

      {preview.data && <ProofResult result={preview.data} />}
    </div>
  );
}

function ProofResult({ result }: { result: DisclosurePreviewResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Prueba construida
          {/* Sale de los tokens del sistema, no de la paleta cruda de Tailwind:
              un verde/rojo claro no pertenece a Nocturne. */}
          <Badge variant={result.verified ? 'default' : 'destructive'}>
            {result.verified ? 'verifica contra el root' : 'NO verifica'}
          </Badge>
        </CardTitle>
        <CardDescription>
          Esto es lo único que sale hacia el prestamista. Las {result.hiddenCount} cuotas ocultas no
          aparecen: ni deudor, ni monto, ni vencimiento.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-muted-foreground text-xs">Root del expediente</dt>
            <dd className="font-mono text-sm" title={result.root}>
              {truncateHex(result.root)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Nominal divulgado</dt>
            <dd className="text-sm tabular-nums">
              {formatAmount(result.disclosedNominalMinor, 840)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Divulgadas / ocultas</dt>
            <dd className="text-sm tabular-nums">
              {result.disclosedCount} / {result.hiddenCount}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Tamaño del proof</dt>
            <dd className="text-sm tabular-nums">{result.proof.length} hashes</dd>
          </div>
        </dl>

        <div>
          <h3 className="mb-2 text-sm font-medium">Hojas divulgadas</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deudor (hash)</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Hoja</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.disclosedLeaves.map((leaf) => (
                <TableRow key={leaf.leafHash}>
                  <TableCell className="font-mono text-xs" title={leaf.debtorHash}>
                    {truncateHex(leaf.debtorHash)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDueDate(leaf.dueDate)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(leaf.amountMinor, leaf.currency)}
                  </TableCell>
                  <TableCell className="font-mono text-xs" title={leaf.leafHash}>
                    {truncateHex(leaf.leafHash)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="text-muted-foreground text-xs">
          El deudor viaja como hash con salt: el fondo puede ver que dos cuotas comparten deudor —
          lo necesita para el haircut de concentración — pero no quién es.
        </p>
      </CardContent>
    </Card>
  );
}
