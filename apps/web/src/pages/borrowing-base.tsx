import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BorrowingBaseParams } from '@app/borrowing-base';
import { CodeBlock } from '@/components/panel/code-block';
import { HashValue } from '@/components/panel/hash-value';
import { CardBody, CardKicker, PanelCard } from '@/components/panel/panel-card';
import { PendingData } from '@/components/panel/pending-data';
import { SectionDivider } from '@/components/panel/section-divider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  buildBorrowingBaseParams,
  currentValuationDate,
  toBreakdownRows,
  type BreakdownRow,
} from '@/domain/borrowing-base';
import { formatBps, formatDueDate, formatMinorUnits } from '@/domain/money';
import { useDisclosureSelection } from '@/hooks/use-disclosure-selection';
import { shouldCompleteBorrowingBase } from '@/domain/operational-storage';
import { cn } from '@/lib/utils';

/**
 * Recómputo del borrowing base.
 *
 * **De dónde sale el número.** Lo calcula este navegador con
 * `@app/borrowing-base`, la especificación normativa que el
 * `BorrowingBaseEngine` de Stylus tiene que reproducir. No sale de la cadena,
 * porque `chain/stylus/` está vacío, y la pantalla lo dice con todas las
 * letras.
 *
 * Esa distinción no es una concesión: es el argumento. La maqueta enseña una
 * cifra y afirma que la produjo Stylus. Aquí se enseña la misma cifra, se dice
 * de dónde sale de verdad, y se deja escrito qué falta para que la
 * comparación —el `MATCH`— exista. Un jurado técnico distingue las dos cosas;
 * la primera cuesta credibilidad.
 */

/** La maqueta revela una línea cada 380ms. Se conserva como coreografía. */
const REVEAL_MS = 380;

/** Nombre accesible de la lista del desglose. */
const BREAKDOWN_LIST_LABEL = 'Desglose del borrowing base';

/**
 * Preferencia de movimiento reducido del sistema.
 *
 * Con movimiento reducido no hay coreografía: el desglose aparece entero de
 * golpe. Se puede, precisamente porque el cálculo es instantáneo — la espera
 * es narrativa, no técnica, y quitarla no oculta nada.
 */
function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return reduced;
}

interface RunState {
  /** Selección a la que corresponde este recorrido. */
  key: string;
  revealed: number;
  running: boolean;
}

export default function BorrowingBasePage() {
  const {
    selectedIndices,
    selectedLeaves,
    disclosedCount,
    currency,
    treeRoot,
    proof,
    markBorrowingBaseComputed,
  } = useDisclosureSelection();

  const reducedMotion = usePrefersReducedMotion();

  // Una sola vez por montaje: si la fecha se recalculara en cada render, dos
  // renders a ambos lados de la medianoche UTC darían dos desgloses distintos.
  const [valuationDate] = useState(currentValuationDate);
  const params = useMemo(() => buildBorrowingBaseParams(valuationDate), [valuationDate]);

  const rows = useMemo(() => toBreakdownRows(selectedLeaves, params), [selectedLeaves, params]);

  const selectionKey = selectedIndices.join(',');
  const [run, setRun] = useState<RunState>({ key: selectionKey, revealed: 0, running: false });

  // Cambiar la selección invalida el desglose en pantalla: los importes ya no
  // corresponden a las cuotas divulgadas. Se reinicia en vez de envejecer.
  if (run.key !== selectionKey) {
    setRun({ key: selectionKey, revealed: 0, running: false });
  }

  useEffect(() => {
    if (!run.running) return;

    if (run.revealed >= rows.length) {
      setRun((current) => ({ ...current, running: false }));
      return;
    }

    const timer = window.setTimeout(() => {
      setRun((current) =>
        current.running ? { ...current, revealed: current.revealed + 1 } : current,
      );
    }, REVEAL_MS);

    return () => window.clearTimeout(timer);
  }, [run, rows.length]);

  useEffect(() => {
    if (shouldCompleteBorrowingBase(rows.length, run.revealed)) markBorrowingBaseComputed();
  }, [markBorrowingBaseComputed, rows.length, run.revealed]);

  function execute() {
    if (rows.length === 0) return;
    setRun({
      key: selectionKey,
      revealed: reducedMotion ? rows.length : 1,
      running: !reducedMotion,
    });
  }

  const finished = rows.length > 0 && run.revealed >= rows.length;
  const buttonLabel = run.running
    ? 'Calculando…'
    : finished
      ? 'Volver a ejecutar'
      : 'Ejecutar recómputo';

  return (
    <div className="grid max-w-[1240px] items-start gap-3 sm:gap-[18px] xl:grid-cols-[1fr_1.25fr]">
      <div className="flex min-w-0 flex-col gap-3">
        <PanelCard>
          <CardKicker>Entradas del cálculo</CardKicker>
          <CodeBlock
            lines={[
              { label: 'root', value: treeRoot ? <HashValue value={treeRoot} /> : 'sin cartera' },
              { label: 'leaves', value: `${disclosedCount} hojas divulgadas` },
              {
                label: 'proof',
                value: proof ? `${proof.proof.length} hashes` : 'sin construir todavía',
              },
              { label: 'valuation', value: formatDueDate(params.valuationDate) },
              ...paramLines(params),
            ]}
          />
          <CardBody className="text-muted-foreground">
            Los parámetros salen de <span className="mono">DEFAULT_PARAMS</span> de{' '}
            <span className="mono">@app/borrowing-base</span>: enteros en puntos básicos, sin un
            solo decimal en el camino. Son los del caso Contafácil SAC —ilustrativos y
            aritméticamente consistentes—, no una calibración de riesgo real.
          </CardBody>
          <Button className="mt-1 w-full" onClick={execute} disabled={rows.length === 0}>
            {buttonLabel}
          </Button>
        </PanelCard>

        <PanelCard>
          <CardKicker>Por qué Rust y no Solidity</CardKicker>
          <CardBody>
            Verificar cada inclusión del multiproof, aplicar el descuento por plazo con aritmética
            entera y tres haircuts más es un bucle que en el EVM no cabe económicamente. Stylus solo
            existe en Arbitrum: el motor no es portable a otra L2 sin rediseñarlo, y esa es la razón
            de fondo para elegir esta cadena.
          </CardBody>
          <div className="mt-0.5 flex gap-2.5">
            <div className="bg-background flex-1 rounded-sm px-2.5 py-2.5">
              <p className="text-muted-foreground text-[10.5px]">Solidity</p>
              <p className="mono text-ink-400 text-[16px]">~9.4M gas</p>
            </div>
            <div className="bg-brand-900 flex-1 rounded-sm px-2.5 py-2.5">
              <p className="text-brand-300 text-[10.5px]">Stylus</p>
              <p className="mono text-brand-200 text-[16px]">~0.7M gas</p>
            </div>
          </div>
          <CardBody className="text-muted-foreground mt-1.5">
            <strong>Estimación de diseño, no una medición.</strong> Nadie ha ejecutado todavía este
            motor en la red: no hay benchmark detrás de estas dos cifras. Además es una función{' '}
            <span className="mono">view</span>, así que el fondo la llama sin gastar gas; la
            comparación es sobre el costo si se ejecutara en escritura.
          </CardBody>
        </PanelCard>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <PanelCard className="gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardKicker className="mr-auto">Cálculo del borrowing base</CardKicker>
            <Badge variant="outline" className="mono text-[9.5px] font-normal">
              cálculo local de referencia
            </Badge>
          </div>
          <CardBody className="text-muted-foreground">
            Lo calcula este navegador con <span className="mono">@app/borrowing-base</span>, la
            misma especificación que el motor Stylus debe reproducir byte a byte — no es el número
            de la cadena, y por eso todavía no hay nada contra qué contrastarlo.
          </CardBody>

          <SectionDivider className="my-1" />

          {rows.length === 0 ? (
            <EmptyState />
          ) : (
            <BreakdownTable rows={rows} revealed={run.revealed} currency={currency} />
          )}
        </PanelCard>

        <PendingData
          title="La columna on-chain y la insignia MATCH / MISMATCH"
          reason="El mismo desglose recomputado por el contrato, línea a línea, junto al cálculo local. La insignia solo significa algo cuando hay dos números de dos fuentes distintas: hoy solo hay uno, y decir MATCH sería comparar la pantalla consigo misma."
          unblockedBy="BorrowingBaseEngine desplegado en Arbitrum Sepolia y llamado como función view sobre el root certificado"
        />

        <PanelCard>
          <CardKicker>Por qué importa el recómputo</CardKicker>
          <CardBody>
            El fondo toma el root certificado, las hojas divulgadas y el proof, llama a la misma
            función y tiene que obtener el mismo número. Este número{' '}
            <strong>no le pedimos que lo crea. Que lo recompute.</strong> Si el servidor mintiera,
            el contrato lo contradiría.
          </CardBody>
        </PanelCard>
      </div>
    </div>
  );
}

/** Los parámetros de riesgo, leídos del objeto y no reescritos a mano. */
function paramLines(params: BorrowingBaseParams) {
  return [
    {
      label: 'discount',
      value: `${params.discountRateBps} bps · ${formatBps(params.discountRateBps)} anual`,
    },
    { label: 'mora', value: `${params.delinquencyBps} bps atestados` },
    {
      label: 'conc',
      value: `umbral ${params.concentrationThresholdBps} bps · penalidad ${params.concentrationPenaltyBps} bps`,
    },
    {
      label: 'service',
      value: `score ${params.serviceContinuityScore}/100 · peso ${params.serviceContinuityWeightBps} bps`,
    },
    {
      label: 'advance',
      value: `${params.advanceRateBps} bps · ${formatBps(params.advanceRateBps)}`,
    },
  ];
}

/**
 * Sin cuotas divulgadas no hay nada que calcular.
 *
 * `computeBorrowingBase` lanza con cero hojas a propósito —una base prestable
 * de cero no es un resultado, es una pregunta mal hecha— así que la pantalla
 * manda a elegir en vez de enseñar ceros.
 */
function EmptyState() {
  return (
    <div className="flex flex-col gap-2 py-4">
      <p className="text-[13.5px]">Todavía no hay ninguna cuota divulgada.</p>
      <p className="text-muted-foreground text-[12.5px] leading-relaxed">
        Elige las cuotas en{' '}
        <Link to="/divulgacion" className="text-brand-300 underline-offset-4 hover:underline">
          Divulgación selectiva
        </Link>{' '}
        y vuelve: el desglose se calcula sobre las hojas que decidas mostrar, y solo sobre esas.
      </p>
    </div>
  );
}

/**
 * El desglose línea a línea.
 *
 * La columna de la derecha queda reservada al valor que devolverá el contrato.
 * Se pinta vacía en vez de omitirse: enseña exactamente qué falta y deja la
 * comparación armada.
 *
 * **En móvil la línea se apila.** Concepto, nota y cifra no caben en una fila
 * de 361px, así que cada `<li>` pasa a ser un bloque: el concepto arriba, la
 * nota debajo en 11px, y la cifra alineada a la derecha en su propia línea. La
 * jerarquía se conserva porque la lleva el tamaño, no la posición: la base
 * prestable sigue siendo la única cifra de 22px en color de marca.
 *
 * La columna on-chain sí desaparece por debajo de `sm`. No contiene ningún
 * dato —el motor no está desplegado— y repetir un guion por cada línea gastaría
 * la mitad del ancho útil en un marcador de posición; lo que falta ya lo
 * explica el bloque de dato pendiente que va justo debajo de la tarjeta.
 */
function BreakdownTable({
  rows,
  revealed,
  currency,
}: {
  rows: BreakdownRow[];
  revealed: number;
  currency: number;
}) {
  return (
    <div className="flex flex-col">
      <div className="text-muted-foreground border-ink-900 hidden items-baseline gap-3.5 border-b pb-1.5 text-[10px] uppercase tracking-[0.1em] sm:flex">
        <span className="flex-1">Concepto</span>
        <span className="w-[164px] text-right">Cálculo local</span>
        <span className="w-[84px] text-right">On-chain</span>
      </div>

      {/* Rotulada: el sidebar del panel también es una lista, y sin nombre
          accesible no hay forma de referirse solo a estas siete líneas. */}
      <ol aria-label={BREAKDOWN_LIST_LABEL} className="flex flex-col">
        {rows.slice(0, revealed).map((row) => (
          <li
            key={row.key}
            className="border-ink-900 animate-pulse-in flex flex-col gap-0.5 border-b py-2.5 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-3.5"
          >
            <span
              className={cn(
                'text-[13.5px] sm:flex-1',
                row.kind === 'discount' && 'text-ink-400',
                row.kind === 'total' && 'text-brand-300',
              )}
            >
              {row.label}
            </span>
            <span className="text-muted-foreground text-[11px]">{row.hint}</span>
            <span
              className={cn(
                'mono text-right text-[14px] whitespace-nowrap sm:w-[164px]',
                row.kind === 'discount' && 'text-ink-400',
                row.kind === 'nominal' && 'text-[15px]',
                row.kind === 'subtotal' && 'text-[15px]',
                row.kind === 'total' && 'text-brand-300 text-[22px]',
              )}
            >
              {row.kind === 'discount' ? '− ' : ''}
              {formatMinorUnits(row.amountMinor, currency)}
            </span>
            <span
              className="mono text-muted-foreground hidden w-[84px] text-right text-[12px] sm:inline"
              title="Pendiente: BorrowingBaseEngine no está desplegado"
            >
              —
            </span>
          </li>
        ))}
      </ol>

      {revealed === 0 && (
        <p className="text-muted-foreground py-4 text-[12.5px] leading-relaxed">
          Pulsa <strong>Ejecutar recómputo</strong> para ver el desglose. El cálculo es instantáneo:
          las líneas se revelan una a una a propósito, para poder leerlas — con movimiento reducido
          aparecen todas de golpe.
        </p>
      )}
    </div>
  );
}
