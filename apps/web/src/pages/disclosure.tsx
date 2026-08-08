import { useMemo, useState } from 'react';
import type { DisclosurePreviewResponse, Receivable } from '@app/contracts';
import { CodeBlock } from '@/components/panel/code-block';
import { HashValue } from '@/components/panel/hash-value';
import { CardBody, CardKicker, PanelCard } from '@/components/panel/panel-card';
import { PendingData } from '@/components/panel/pending-data';
import { SectionDivider } from '@/components/panel/section-divider';
import { StatTile } from '@/components/panel/stat-tile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

/**
 * Divulgación selectiva: la única pantalla del panel con datos reales de punta
 * a punta. La cartera viene de `GET /api/disclosure/sample` y el multiproof lo
 * construye `POST /api/disclosure/preview` con `@app/merkle` — el mismo
 * paquete que verifica los vectores dorados.
 */

const CURRENCY_LABEL: Record<number, string> = { 840: 'USD', 604: 'PEN' };

/** Las unidades menores son enteros: formatear con float perdería precisión. */
function formatAmount(amountMinor: string | bigint, currency: number): string {
  const minor = BigInt(amountMinor);
  const units = minor / 100n;
  const cents = minor % 100n;
  const grouped = units.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${CURRENCY_LABEL[currency] ?? currency} ${grouped}.${cents.toString().padStart(2, '0')}`;
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

  const selectedNominal = useMemo(
    () =>
      receivables.reduce(
        (total, item, index) => (selected.has(index) ? total + BigInt(item.amountMinor) : total),
        0n,
      ),
    [receivables, selected],
  );

  /**
   * Una prueba construida deja de valer en cuanto cambia la selección: el root
   * seguiría siendo el mismo, pero las hojas y el proof ya no corresponderían a
   * lo que muestra la tabla. Se descarta en vez de dejarla envejecer en
   * pantalla.
   */
  function updateSelection(next: Set<number>) {
    preview.reset();
    setSelected(next);
  }

  function toggle(index: number) {
    const next = new Set(selected);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    updateSelection(next);
  }

  function toggleDebtor(label: string) {
    const indices = receivables
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.debtorLabel === label)
      .map(({ index }) => index);

    const allSelected = indices.every((index) => selected.has(index));
    const next = new Set(selected);
    for (const index of indices) {
      if (allSelected) next.delete(index);
      else next.add(index);
    }
    updateSelection(next);
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
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-destructive py-12 text-center">
        No se pudo cargar la cartera: {String(error)}
      </p>
    );
  }

  const result = preview.data;
  const disclosedCount = result?.disclosedCount ?? selected.size;
  const hiddenCount = result?.hiddenCount ?? receivables.length - selected.size;
  const disclosedNominal = result?.disclosedNominalMinor ?? selectedNominal;

  return (
    <div className="flex max-w-[1240px] flex-col gap-[18px]">
      <div className="grid items-start gap-[18px] xl:grid-cols-[1.45fr_1fr]">
        <PanelCard className="gap-3">
          <div className="flex flex-col gap-0.5">
            <CardKicker>Cartera del expediente</CardKicker>
            <p className="text-muted-foreground text-[11.5px]">
              {receivables.length} cuotas · nominal total {formatAmount(totalNominal, 840)} ·{' '}
              {selected.size} seleccionadas
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-[11.5px]">Seleccionar por deudor:</span>
            {debtors.map((label) => (
              <Button key={label} variant="outline" size="xs" onClick={() => toggleDebtor(label)}>
                {label}
              </Button>
            ))}
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[34px]" />
                <TableHead>Deudor</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receivables.map((item, index) => (
                <TableRow
                  key={item.docHash}
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
                  <TableCell className="text-[13px]">{item.debtorLabel}</TableCell>
                  <TableCell className="text-muted-foreground">{item.dueDate}</TableCell>
                  <TableCell className="mono text-right text-[12.5px]">
                    {formatAmount(item.amountMinor, item.currency)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={selected.has(index) ? 'default' : 'secondary'}
                      className="text-[10px] font-normal"
                    >
                      {selected.has(index) ? 'divulgada' : 'oculta'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PanelCard>

        <div className="flex flex-col gap-3">
          <PanelCard className="gap-2.5">
            <CardKicker>Multiproof</CardKicker>
            <div className="grid grid-cols-2 gap-3">
              <StatTile bare kicker="Hojas divulgadas" value={String(disclosedCount)} />
              <StatTile bare kicker="Hojas ocultas" value={String(hiddenCount)} />
              <StatTile
                bare
                kicker="Nominal divulgado"
                emphasis="brand"
                value={formatAmount(disclosedNominal, 840)}
                valueClassName="text-[17px]"
              />
              <StatTile
                bare
                kicker="Tamaño del proof"
                value={result ? String(result.proof.length) : '—'}
                note={result ? 'hashes' : 'al construir la prueba'}
              />
            </div>

            <SectionDivider className="my-0.5" />

            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-[11px]">
                Root del expediente (no cambia)
              </span>
              {result ? (
                <HashValue
                  value={result.root}
                  leading={22}
                  trailing={6}
                  className="text-brand-300"
                />
              ) : (
                <span className="text-muted-foreground text-[11.5px]">
                  Lo devuelve el servidor junto con la prueba.
                </span>
              )}
            </div>

            <div className="mt-1 flex gap-2">
              <Button onClick={buildProof} disabled={selected.size === 0 || preview.isPending}>
                {preview.isPending ? 'Construyendo prueba…' : `Construir prueba (${selected.size})`}
              </Button>
              <Button
                variant="secondary"
                onClick={() => updateSelection(new Set())}
                disabled={selected.size === 0}
              >
                Limpiar
              </Button>
            </div>

            {preview.isError && (
              <p className="text-destructive text-[12px]">
                {String(preview.error?.message ?? preview.error)}
              </p>
            )}
          </PanelCard>

          <PanelCard>
            <CardKicker>Lo único que sale hacia el fondo</CardKicker>
            <CodeBlock
              lines={[
                { label: 'root', value: result ? result.root : '—' },
                { label: 'leaves', value: `[${disclosedCount}] · debtorHash con salt` },
                { label: 'proof', value: `[${result ? result.proof.length : '—'}]` },
                { label: 'flags', value: `bool[${result ? result.proofFlags.length : '—'}]` },
              ]}
            />
            <CardBody>
              Las hojas ocultas no viajan. El fondo sí ve que dos cuotas comparten deudor —lo
              necesita para el haircut de concentración— pero no quién es.{' '}
              <strong>Privacidad comercial real, sin ZK.</strong>
            </CardBody>
          </PanelCard>

          <PendingData
            title="Elegibilidad por contrato"
            reason="Qué contratos son cedibles y cuáles no. En el caso de referencia el abogado encuentra dos con cláusula de no-cesión, y esos quedan fuera del cálculo sin tumbar el expediente entero."
            unblockedBy="las atestaciones de CertificationAttestor con ámbito RIGHTS_ASSIGNABLE"
          />
        </div>
      </div>

      {result && <ProofResult result={result} />}
    </div>
  );
}

function ProofResult({ result }: { result: DisclosurePreviewResponse }) {
  return (
    <PanelCard className="gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[17px] font-medium">Prueba construida</h2>
        {/* Sale de los tokens del sistema, no de la paleta cruda de Tailwind:
            un verde/rojo claro no pertenece a Nocturne. */}
        <Badge variant={result.verified ? 'default' : 'destructive'}>
          {result.verified ? 'verifica contra el root' : 'NO verifica'}
        </Badge>
      </div>
      <p className="text-muted-foreground text-[12.5px]">
        Esto es lo único que sale hacia el prestamista. Las {result.hiddenCount} cuotas ocultas no
        aparecen: ni deudor, ni monto, ni vencimiento.
      </p>

      <div>
        <h3 className="mb-2 text-[13px] font-medium">Detalle de la prueba</h3>
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
                <TableCell>
                  <HashValue value={leaf.debtorHash} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDueDate(leaf.dueDate)}
                </TableCell>
                <TableCell className="mono text-right text-[12.5px]">
                  {formatAmount(leaf.amountMinor, leaf.currency)}
                </TableCell>
                <TableCell>
                  <HashValue value={leaf.leafHash} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </PanelCard>
  );
}
