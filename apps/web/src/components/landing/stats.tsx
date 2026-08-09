import { StatTile } from '@/components/panel/stat-tile';
import { CardKicker, PanelCard } from '@/components/panel/panel-card';
import { Reveal } from './reveal';

const STATS = [
  { kicker: 'Documentos on-chain', value: '0', note: 'solo el hash sale de storage' },
  { kicker: 'Huella por activo', value: '32 bytes', note: 'AssetRegistry.assets(id).merkleRoot' },
  { kicker: 'Certificadores', value: '3', note: 'un scope EIP-712 cada uno' },
  { kicker: 'Motor de riesgo', value: 'Stylus', note: 'Rust · misma fórmula, gas distinto' },
];

/**
 * Mismo reparto de responsabilidad que documenta `docs/referencia-pai-arbitrum.md`
 * y que ya muestra `/panel` (Resumen) — no es telemetría del sistema en
 * marcha, es la decisión de arquitectura de dónde vive cada parte.
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
  { label: 'Custodia y dinero', where: 'CollateralVault + USDC', pct: 12, color: 'bg-brand-400' },
];

export function Stats() {
  return (
    <section aria-labelledby="stats-heading" className="mx-auto max-w-5xl px-6 py-16">
      <Reveal className="mb-8">
        <h2 id="stats-heading" className="sr-only">
          Cifras del protocolo
        </h2>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
          {STATS.map((stat) => (
            <StatTile key={stat.kicker} {...stat} emphasis="brand" />
          ))}
        </div>
      </Reveal>

      <Reveal delayMs={100}>
        <PanelCard className="gap-3">
          <CardKicker>Reparto de responsabilidad</CardKicker>
          {RESPONSIBILITY_SPLIT.map((row) => (
            <div key={row.label} className="flex flex-col gap-1.5">
              <div className="flex justify-between gap-3 text-[12.5px]">
                <span>{row.label}</span>
                <span className="mono text-muted-foreground">{row.where}</span>
              </div>
              <div className="bg-ink-800 h-1 overflow-hidden rounded-full">
                <div className={`h-full ${row.color}`} style={{ width: `${row.pct}%` }} />
              </div>
            </div>
          ))}
        </PanelCard>
      </Reveal>
    </section>
  );
}
