import { Reveal } from './reveal';

interface Step {
  route: string;
  title: string;
  body: string;
}

/**
 * Los cinco pasos del caso de referencia (Contafácil SAC), uno por pantalla
 * real del panel — ver `docs/design/README.md`. La ruta debajo del título no
 * es un enlace: son todas protegidas, y mandar a un visitante sin sesión a
 * mitad de un formulario de login no cuenta la historia mejor que decir
 * "esto existe, andá a verlo" desde el botón de arriba.
 */
const STEPS: Step[] = [
  {
    route: '/expediente',
    title: 'Registrás el expediente',
    body: 'Cada cuota de la cartera se convierte en una hoja de un árbol de Merkle. AssetRegistry.sol guarda un único root de 32 bytes — nunca el documento completo.',
  },
  {
    route: '/certificacion',
    title: 'Tres partes certifican, por separado',
    body: 'Ingresos, derechos cedibles y continuidad del servicio: cada certificador atesta solo lo suyo, con su propio scope EIP-712. Ninguno ve el expediente completo del otro.',
  },
  {
    route: '/divulgacion',
    title: 'Divulgás selectivamente',
    body: 'Elegís qué cuotas mostrarle al fondo. Un multiproof demuestra que pertenecen al expediente certificado, sin revelar las demás ni sus contrapartes. Sin ZK: solo un árbol de Merkle.',
  },
  {
    route: '/borrowing-base',
    title: 'El fondo recomputa, no te cree',
    body: 'La base prestable se recalcula en un contrato Stylus (Rust) que corre en Arbitrum. Mismo resultado que la fórmula de referencia en Solidity, una fracción del gas.',
  },
  {
    route: '/prestamo',
    title: 'Se fondea en USDC',
    body: 'CollateralVault.sol transfiere USDC nativo de Circle y el expediente pasa a Pledged en la máquina de estados on-chain. Ocho transiciones, todas con require().',
  },
];

export function HowItWorks() {
  return (
    <section
      id="como-funciona"
      aria-labelledby="how-it-works-heading"
      className="mx-auto max-w-2xl scroll-mt-14 px-6 py-24"
    >
      <Reveal className="mb-14 flex flex-col items-center gap-3 text-center">
        <p className="text-brand-400 text-xs font-semibold tracking-wider uppercase">
          Cómo funciona
        </p>
        <h2
          id="how-it-works-heading"
          className="text-3xl font-extrabold tracking-tight sm:text-4xl"
        >
          Un expediente, cinco pasos, cero confianza ciega
        </h2>
        <p className="text-muted-foreground max-w-lg text-base leading-relaxed">
          El caso de referencia completo — Contafácil SAC, una PYME de software contable — de
          expediente a fondeo.
        </p>
      </Reveal>

      <ol className="relative flex flex-col gap-10">
        <div aria-hidden="true" className="bg-brand-800 absolute top-2 bottom-2 left-[15px] w-px" />
        {STEPS.map((step, index) => (
          <Reveal key={step.route} delayMs={index * 90}>
            <li className="relative grid grid-cols-[32px_1fr] gap-4">
              <span
                className="bg-brand-500 relative z-10 grid size-8 flex-none place-items-center rounded-full text-[13px] font-bold text-white"
                style={{
                  boxShadow:
                    '0 0 0 6px var(--background), 0 4px 16px color-mix(in srgb, var(--nocturne-brand) 45%, transparent)',
                }}
              >
                {index + 1}
              </span>
              <div>
                <h3 className="text-base font-bold">{step.title}</h3>
                <p className="mono text-brand-400/70 mb-1.5 text-[11px]">{step.route}</p>
                <p className="text-muted-foreground text-sm leading-relaxed">{step.body}</p>
              </div>
            </li>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}
