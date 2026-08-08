import { CodeBlock } from '@/components/panel/code-block';
import { CardBody, CardKicker, PanelCard } from '@/components/panel/panel-card';
import { PendingData } from '@/components/panel/pending-data';

/**
 * Recómputo del borrowing base.
 *
 * `packages/borrowing-base` ya implementa el motor de riesgo como
 * especificación normativa, pero esta pantalla todavía no lo llama: el punto
 * de la pantalla no es que el panel calcule un número, sino que el prestamista
 * lo recompute contra la cadena. Mientras el motor Stylus no esté desplegado,
 * mostrar una cifra calculada en el navegador diría exactamente lo contrario
 * de lo que la pantalla afirma.
 */

/** Las cinco líneas del desglose, en el orden en que se aplican. */
const BREAKDOWN_STEPS = [
  {
    label: 'Nominal divulgado',
    hint: 'suma de las hojas que la PYME decide mostrar',
  },
  {
    label: 'Valor presente por plazo',
    hint: 'descuento por el tiempo que falta para cobrar',
  },
  { label: 'Haircut de morosidad', hint: 'mora histórica atestada por el contador' },
  {
    label: 'Haircut de concentración',
    hint: 'castigo cuando un solo deudor pesa más que el umbral',
  },
  { label: 'Ajuste de continuidad', hint: 'score del auditor técnico sobre el servicio' },
  { label: 'Valor ajustado por riesgo', hint: 'nominal menos los cuatro descuentos' },
  { label: 'Base prestable', hint: 'valor ajustado × advance rate' },
];

export default function BorrowingBasePage() {
  return (
    <div className="grid max-w-[1240px] items-start gap-[18px] xl:grid-cols-[1fr_1.25fr]">
      <div className="flex flex-col gap-3">
        <PanelCard>
          <CardKicker>BorrowingBaseEngine · Stylus (Rust → WASM)</CardKicker>
          <CodeBlock
            lines={[
              { label: 'root', value: 'root certificado del expediente' },
              { label: 'leaves', value: 'hojas divulgadas' },
              { label: 'proof', value: 'multiproof + flags' },
              { label: 'aging', value: 'tasa anual · duración media' },
              { label: 'mora', value: 'bps atestados' },
              { label: 'conc', value: 'umbral de concentración' },
              { label: 'advance', value: 'advance rate' },
            ]}
          />
          <CardBody>
            Entradas de la función <span className="mono">view</span>. Los valores concretos son
            parámetros del préstamo y salen de las atestaciones; ninguno lo fija el panel.
          </CardBody>
        </PanelCard>

        <PanelCard>
          <CardKicker>Por qué Rust y no Solidity</CardKicker>
          <CardBody>
            Verificar cada inclusión del multiproof, aplicar aging con aritmética de punto fijo y
            dos haircuts es un bucle que en el EVM no cabe económicamente. Stylus solo existe en
            Arbitrum: el motor no es portable a otra L2 sin rediseñarlo, y esa es la razón de fondo
            para elegir esta cadena.
          </CardBody>
          <div className="mt-0.5 flex gap-2.5">
            <div className="bg-background flex-1 rounded-sm px-2.5 py-2.5">
              <p className="text-muted-foreground text-[10.5px]">Solidity (estimación)</p>
              <p className="mono text-ink-400 text-[16px]">~9.4M gas</p>
            </div>
            <div className="bg-brand-900 flex-1 rounded-sm px-2.5 py-2.5">
              <p className="text-brand-300 text-[10.5px]">Stylus (estimación)</p>
              <p className="mono text-brand-200 text-[16px]">~0.7M gas</p>
            </div>
          </div>
          <CardBody className="text-muted-foreground mt-1.5">
            Estimaciones de diseño, no mediciones: nada se ha ejecutado todavía en la red. Además es
            una función <span className="mono">view</span>, así que el fondo la llama sin gastar
            gas; la comparación es sobre el costo si se ejecutara en escritura.
          </CardBody>
        </PanelCard>
      </div>

      <div className="flex flex-col gap-3">
        <PanelCard className="gap-2">
          <CardKicker>Cálculo del borrowing base</CardKicker>
          <ol className="flex flex-col">
            {BREAKDOWN_STEPS.map((step) => (
              <li
                key={step.label}
                className="border-ink-900 flex items-baseline gap-3.5 border-b py-2.5 last:border-b-0"
              >
                <span className="flex-1 text-[13.5px]">{step.label}</span>
                <span className="text-muted-foreground text-[11px]">{step.hint}</span>
              </li>
            ))}
          </ol>
        </PanelCard>

        <PendingData
          title="Los importes de cada línea"
          reason="El desglose completo con su resultado. El valor de esta pantalla es que el número lo produzca la cadena y no el servidor: si el panel lo calculara en el navegador estaría afirmando justo lo que el protocolo evita pedir que se crea."
          unblockedBy="BorrowingBaseEngine desplegado en Arbitrum Sepolia y llamado como función view"
        />

        <PanelCard>
          <CardKicker>Por qué importa el recómputo</CardKicker>
          <CardBody>
            El fondo toma el root certificado, las hojas divulgadas y el proof, llama a la misma
            función y tiene que obtener el mismo número. Si el servidor mintiera, el contrato lo
            contradiría. Ese contraste es toda la pantalla: sin contrato desplegado no hay nada
            contra qué contrastar, y por eso aquí no aparece ninguna cifra.
          </CardBody>
        </PanelCard>
      </div>
    </div>
  );
}
