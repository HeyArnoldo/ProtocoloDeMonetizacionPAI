import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DisclosurePreviewResponse } from '@app/contracts';
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
import { formatDueDate, formatMinorUnits } from '@/domain/money';
import { useDisclosureSelection } from '@/hooks/use-disclosure-selection';

/**
 * Divulgación selectiva: la única pantalla del panel con datos reales de punta
 * a punta. La cartera viene de `GET /api/disclosure/sample` y el multiproof lo
 * construye `POST /api/disclosure/preview` con `@app/merkle` — el mismo
 * paquete que verifica los vectores dorados.
 *
 * La selección no es estado local: vive en `DisclosureSelectionProvider` y la
 * comparte con `/borrowing-base`. Ese es el guion de la demo — marcar cuotas
 * aquí y ver el número moverse allá.
 */

/**
 * Cuántas selecciones distintas se han probado desde que se abrió la pantalla.
 *
 * Es el argumento de la pantalla convertido en evidencia: el root que se
 * muestra al lado no se ha movido en ninguna de ellas. Se deriva durante el
 * render con el patrón de «ajustar estado al cambiar una prop», que es
 * idempotente si React vuelve a renderizar en modo estricto.
 */
function useSelectionChangeCount(selectionKey: string): number {
  const [seen, setSeen] = useState({ key: selectionKey, count: 0 });

  if (seen.key !== selectionKey) {
    setSeen({ key: selectionKey, count: seen.count + 1 });
  }

  return seen.count;
}

export default function DisclosurePage() {
  const {
    isPending,
    isError,
    error,
    receivables,
    treeRoot,
    selectedIndices,
    isSelected,
    toggle,
    toggleDebtor,
    clear,
    disclosedCount,
    hiddenCount,
    totalNominalMinor,
    selectedNominalMinor,
    currency,
    proof,
    isBuildingProof,
    proofError,
    buildProof,
  } = useDisclosureSelection();

  const debtors = useMemo(
    () => [...new Set(receivables.map((item) => item.debtorLabel))],
    [receivables],
  );

  const selectionChanges = useSelectionChangeCount(selectedIndices.join(','));

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

  return (
    <div className="flex max-w-[1240px] flex-col gap-[18px]">
      <div className="grid items-start gap-[18px] xl:grid-cols-[1.45fr_1fr]">
        <PanelCard className="gap-3">
          <div className="flex flex-col gap-0.5">
            <CardKicker>Cartera del expediente</CardKicker>
            <p className="text-muted-foreground text-[11.5px]">
              {receivables.length} cuotas · nominal total{' '}
              {formatMinorUnits(totalNominalMinor, currency)} · {disclosedCount} seleccionadas
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
                  data-state={isSelected(index) ? 'selected' : undefined}
                  className="cursor-pointer"
                  onClick={() => toggle(index)}
                >
                  <TableCell>
                    {/* El checkbox nativo del navegador ignora el tema oscuro:
                        se usa el primitivo del sistema para que tome los tokens. */}
                    <Checkbox
                      checked={isSelected(index)}
                      onCheckedChange={() => toggle(index)}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`Divulgar cuota de ${item.debtorLabel} con vencimiento ${item.dueDate}`}
                    />
                  </TableCell>
                  <TableCell className="text-[13px]">{item.debtorLabel}</TableCell>
                  <TableCell className="text-muted-foreground">{item.dueDate}</TableCell>
                  <TableCell className="mono text-right text-[12.5px]">
                    {formatMinorUnits(item.amountMinor, item.currency)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={isSelected(index) ? 'default' : 'secondary'}
                      className="text-[10px] font-normal"
                    >
                      {isSelected(index) ? 'divulgada' : 'oculta'}
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
                value={formatMinorUnits(selectedNominalMinor, currency)}
                valueClassName="text-[17px]"
              />
              <StatTile
                bare
                kicker="Tamaño del proof"
                // El tamaño real lo devuelve el servidor en `proof.length`. La
                // maqueta lo estima con `ceil(ocultas / 4) + 8`, una fórmula
                // que no describe ningún multiproof: aquí no se inventa.
                value={proof ? String(proof.proof.length) : '—'}
                note={proof ? 'hashes' : 'al construir la prueba'}
              />
            </div>

            <SectionDivider className="my-0.5" />

            <RootPanel root={treeRoot} proof={proof} selectionChanges={selectionChanges} />

            <div className="mt-1 flex gap-2">
              <Button onClick={buildProof} disabled={disclosedCount === 0 || isBuildingProof}>
                {isBuildingProof ? 'Construyendo prueba…' : `Construir prueba (${disclosedCount})`}
              </Button>
              <Button variant="secondary" onClick={clear} disabled={disclosedCount === 0}>
                Limpiar
              </Button>
            </div>

            {proofError != null && (
              <p className="text-destructive text-[12px]">
                {String((proofError as Error)?.message ?? proofError)}
              </p>
            )}

            <CardBody className="text-muted-foreground">
              Con esta selección, el{' '}
              <Link
                to="/borrowing-base"
                className="text-brand-300 underline-offset-4 hover:underline"
              >
                recómputo del borrowing base
              </Link>{' '}
              usa exactamente estas {disclosedCount} cuotas.
            </CardBody>
          </PanelCard>

          <PanelCard>
            <CardKicker>Lo único que sale hacia el fondo</CardKicker>
            <CodeBlock
              lines={[
                { label: 'root', value: treeRoot ?? '—' },
                { label: 'leaves', value: `[${disclosedCount}] · debtorHash con salt` },
                { label: 'proof', value: `[${proof ? proof.proof.length : '—'}]` },
                { label: 'flags', value: `bool[${proof ? proof.proofFlags.length : '—'}]` },
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

      {proof && <ProofResult result={proof} />}
    </div>
  );
}

/**
 * El root del expediente y la razón por la que la pantalla existe.
 *
 * El root se recomputa en el navegador sobre la cartera **completa**, así que
 * no depende de la selección. Eso es lo que hace que el fondo pueda confiar en
 * él: la PYME elige qué enseña, pero no puede cambiar el compromiso contra el
 * que se verifica. La maqueta rotula «(no cambia)» y ahí lo deja; aquí se
 * cuenta cuántas selecciones se han probado sin que el valor se mueva.
 */
function RootPanel({
  root,
  proof,
  selectionChanges,
}: {
  root: string | null;
  proof: DisclosurePreviewResponse | null;
  selectionChanges: number;
}) {
  // Si el servidor devolviera otro root, la prueba no diría nada sobre el
  // expediente que muestra la tabla. Es la comprobación que el fondo hace y no
  // cuesta nada hacerla aquí.
  const serverAgrees = proof ? proof.root === root : null;

  return (
    <div className="bg-brand-900/40 flex flex-col gap-1.5 rounded-sm p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-[11px]">Root del expediente</span>
        <Badge variant="outline" className="mono text-[9.5px] font-normal">
          {selectionChanges === 0 ? 'no cambia' : `el mismo tras ${selectionChanges} selecciones`}
        </Badge>
      </div>

      {root ? (
        <HashValue value={root} leading={22} trailing={6} className="text-brand-300" />
      ) : (
        <span className="text-muted-foreground text-[11.5px]">
          Sin cartera cargada no hay árbol que construir.
        </span>
      )}

      <p className="text-muted-foreground text-[11.5px] leading-relaxed">
        El root es el mismo con cualquier selección: por eso el prestamista puede confiar en él. La
        empresa decide qué cuotas enseña, no contra qué se verifican.
      </p>

      {serverAgrees !== null && (
        <p className="text-[11.5px]">
          {serverAgrees ? (
            <span className="text-brand-300">
              El servidor devolvió este mismo root al construir la prueba.
            </span>
          ) : (
            <span className="text-destructive">
              El servidor devolvió un root distinto: la prueba no corresponde a esta cartera.
            </span>
          )}
        </p>
      )}
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
                  {formatMinorUnits(leaf.amountMinor, leaf.currency)}
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
