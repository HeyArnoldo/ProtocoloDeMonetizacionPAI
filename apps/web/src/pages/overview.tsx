import { CardBody, CardKicker, PanelCard } from '@/components/panel/panel-card';
import { PendingData } from '@/components/panel/pending-data';

/**
 * Resumen del expediente.
 *
 * Los cuatro KPIs de la maqueta (nominal certificado, base prestable, monto
 * solicitado, días hasta el desembolso) describen un expediente concreto que
 * todavía no existe en ninguna parte: no hay `AssetRegistry` desplegado, ni
 * préstamo, ni motor de riesgo. En su lugar va la explicación de qué mide cada
 * uno y qué falta para poder medirlo.
 */

/** Los seis estados del ciclo de vida y qué transición los produce. */
const LIFECYCLE = [
  { name: 'Registered', trigger: 'registerAsset() escribe el merkleRoot' },
  { name: 'Attested', trigger: 'las tres atestaciones vigentes' },
  { name: 'Pledged', trigger: 'el activo entra al vault como colateral' },
  { name: 'Funded', trigger: 'fundLoan() desembolsa USDC' },
  { name: 'Repaid', trigger: 'repay() libera el colateral' },
  { name: 'Defaulted', trigger: 'vencimiento sin repago' },
];

/**
 * Reparto de responsabilidad del diseño.
 *
 * No es telemetría: es la decisión de arquitectura de `docs/referencia-pai-arbitrum.md`
 * (~55% Web2 / 45% Arbitrum) sobre dónde vive cada parte del sistema.
 */
const RESPONSIBILITY_SPLIT = [
  { label: 'Expediente, evidencias y CRUD', where: 'Web2 · NestJS', pct: 55, color: 'bg-ink-600' },
  {
    label: 'Registro y ciclo de vida del activo',
    where: 'Solidity',
    pct: 15,
    color: 'bg-brand-600',
  },
  { label: 'Valorización', where: 'Stylus (Rust)', pct: 18, color: 'bg-brand-500' },
  {
    label: 'Custodia y dinero',
    where: 'CollateralVault + USDC',
    pct: 12,
    color: 'bg-brand-400',
  },
];

const KPIS = [
  {
    title: 'Nominal certificado',
    reason:
      'Suma del valor contratado remanente de las cuotas incluidas en el árbol certificado del expediente.',
    unblockedBy: 'un expediente registrado con AssetRegistry.registerAsset()',
  },
  {
    title: 'Base prestable',
    reason:
      'Monto máximo financiable. Lo produce el motor de riesgo sobre las hojas divulgadas, no el backend.',
    unblockedBy: 'BorrowingBaseEngine desplegado en Arbitrum Sepolia',
  },
  {
    title: 'Solicitado',
    reason: 'Principal en USDC pedido por la PYME contra esa base.',
    unblockedBy: 'CollateralVault desplegado y una solicitud de préstamo',
  },
  {
    title: 'Días hasta el desembolso',
    reason:
      'Tiempo entre el registro del expediente y la transferencia de USDC. Es la cifra que compara el protocolo contra las 6-10 semanas de un banco.',
    unblockedBy: 'los eventos AssetRegistered y LoanFunded indexados',
  },
];

export default function OverviewPage() {
  return (
    <div className="flex max-w-[1180px] flex-col gap-4 sm:gap-5">
      <section aria-label="Indicadores del expediente">
        {/* `auto-fit` con un mínimo de 240px ya refluye solo: a 393px cae a una
            columna sin necesidad de punto de corte. */}
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          {KPIS.map((kpi) => (
            <PendingData key={kpi.title} {...kpi} />
          ))}
        </div>
      </section>

      <section aria-labelledby="lifecycle-heading" className="flex flex-col gap-2.5">
        <h2 id="lifecycle-heading" className="text-muted-foreground text-[13px] font-medium">
          Máquina de estados on-chain
        </h2>
        {/* Seis estados en una sola fila darían 55px de ancho por celda en un
            teléfono: el nombre del estado no cabría. Se reparten en rejilla y
            solo vuelven a ser una fila cuando hay ancho para leerlos. */}
        <ol className="grid grid-cols-2 items-stretch gap-1.5 sm:grid-cols-3 lg:flex">
          {LIFECYCLE.map((state) => (
            <li
              key={state.name}
              className="bg-card flex min-w-0 flex-1 flex-col gap-1.5 rounded-md px-3 py-[11px]"
            >
              <span className="mono text-[12px]">{state.name}</span>
              <span className="text-muted-foreground text-[10.5px] leading-snug">
                {state.trigger}
              </span>
            </li>
          ))}
        </ol>
        <p className="text-muted-foreground text-[12px]">
          Ocho estados con transiciones aplicadas por <span className="mono">require()</span>. Nadie
          —tampoco el backend— puede saltarse el orden. Ninguno aparece marcado como actual porque
          el estado se lee del contrato y todavía no hay contrato desplegado.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <PanelCard className="gap-3">
          <CardKicker>Reparto de responsabilidad</CardKicker>
          {RESPONSIBILITY_SPLIT.map((row) => (
            <div key={row.label} className="flex flex-col gap-1.5">
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-[12.5px]">
                <span>{row.label}</span>
                <span className="mono text-muted-foreground">{row.where}</span>
              </div>
              <div className="bg-ink-800 h-1 overflow-hidden rounded-full">
                <div className={`h-full ${row.color}`} style={{ width: `${row.pct}%` }} />
              </div>
            </div>
          ))}
          <CardBody className="mt-0.5">
            La ruta crítica de confianza —valorización, custodia y dinero— vive on-chain. El backend
            firma atestaciones e indexa eventos; ya no escribe estados. Es el reparto que fija la
            arquitectura, no una medición del sistema en marcha.
          </CardBody>
        </PanelCard>

        <PendingData
          title="Últimos eventos indexados"
          reason="La lista de AssetRegistered, AttestationCreated, CertificateMinted y AssetPledged en orden cronológico, tal como los recibe el Worker."
          unblockedBy="los contratos desplegados y el Worker suscrito a sus eventos"
        />
      </div>
    </div>
  );
}
