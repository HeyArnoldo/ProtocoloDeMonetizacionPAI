import type { LucideIcon } from 'lucide-react';
import { FileLock2, GitBranch, Lock, ShieldOff } from 'lucide-react';
import { Reveal } from './reveal';

interface Benefit {
  icon: LucideIcon;
  title: string;
  body: string;
}

const BENEFITS: Benefit[] = [
  {
    icon: ShieldOff,
    title: 'Cero archivos on-chain',
    body: 'Contratos, facturas y estados de cuenta quedan cifrados en storage. La cadena solo recibe un hash de 32 bytes por activo — nunca el documento.',
  },
  {
    icon: FileLock2,
    title: 'Divulgación sin ZK',
    body: 'Un árbol de Merkle y un multiproof alcanzan para demostrar pertenencia sin revelar el resto. Menos superficie criptográfica que auditar antes del demo.',
  },
  {
    icon: GitBranch,
    title: 'Gas real, no estimado',
    body: 'El recómputo del monto prestable corre en un contrato Stylus (Rust) desplegado en Arbitrum, no en una hoja de cálculo. El fondo compara el gas contra Solidity y ve la diferencia.',
  },
  {
    icon: Lock,
    title: 'Nadie salta un estado',
    body: 'Ocho transiciones —Registered a Defaulted— aplicadas con require() en el contrato. Ni el backend puede forzar un salto en la máquina de estados.',
  },
];

export function Benefits() {
  return (
    <section
      id="que-asegura-la-cadena"
      aria-labelledby="benefits-heading"
      className="mx-auto max-w-5xl scroll-mt-14 px-6 py-24"
    >
      <Reveal className="mx-auto mb-12 flex max-w-lg flex-col items-center gap-3 text-center">
        <p className="text-brand-400 text-xs font-semibold tracking-wider uppercase">
          Qué asegura la cadena
        </p>
        <h2 id="benefits-heading" className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          No todo tiene que vivir on-chain para ser verificable
        </h2>
      </Reveal>

      <div className="grid gap-5 sm:grid-cols-2">
        {BENEFITS.map((benefit, index) => (
          <Reveal key={benefit.title} delayMs={index * 80}>
            <div className="group border-ink-800 bg-card/60 hover:border-brand-600/40 hover:bg-card h-full rounded-2xl border p-6 transition-colors duration-300">
              <div className="bg-brand-500/15 border-brand-500/30 mb-4 grid size-10 place-items-center rounded-xl border">
                <benefit.icon
                  className="text-brand-400 size-5 transition-transform duration-300 group-hover:scale-110"
                  aria-hidden="true"
                />
              </div>
              <h3 className="mb-1.5 text-base font-bold">{benefit.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{benefit.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
