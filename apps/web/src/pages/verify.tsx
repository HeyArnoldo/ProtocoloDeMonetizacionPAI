import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, PlayCircle } from 'lucide-react';
import { PageHeader } from '@/components/panel/page-header';
import { CardBody, CardKicker, PanelCard } from '@/components/panel/panel-card';
import { PendingData } from '@/components/panel/pending-data';
import { SectionDivider } from '@/components/panel/section-divider';
import { VERIFY_ROUTE } from '@/config/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Verificación pública.
 *
 * Se renderiza fuera de `ProtectedRoute` y fuera de `AppLayout`: un banco tiene
 * que poder abrir este enlace en una ventana de incógnito, sin cuenta y sin
 * pedirle nada a la plataforma. Si necesitara sesión, dejaría de ser una
 * verificación independiente y volvería a ser confianza en el operador.
 */

/** Los cinco pasos de la verificación, en el orden en que se ejecutan. */
const VERIFICATION_STEPS = [
  'Descargar las evidencias del storage cifrado',
  'Recomputar el SHA-256 de cada archivo',
  'Reconstruir las hojas del árbol con el salt del expediente',
  'Calcular el merkleRoot local',
  'Compararlo con AssetRegistry.assets(assetId).merkleRoot',
];

const STEP_INTERVAL_MS = 420;

export default function VerifyPage() {
  const { code } = useParams<{ code: string }>();

  // 0 = nada corrido. 1..5 = ese paso ya se reveló. 6 = terminado, con match.
  const [step, setStep] = useState(0);
  const timeoutRef = useRef(0);

  useEffect(() => () => window.clearTimeout(timeoutRef.current), []);

  const running = step > 0 && step <= VERIFICATION_STEPS.length;
  const done = step > VERIFICATION_STEPS.length;

  function runSimulation() {
    window.clearTimeout(timeoutRef.current);
    // `current` sube de 1 a `length + 1`: el último valor es el que marca
    // "terminado, con match" (`done`, más abajo). El guard va DESPUÉS de
    // fijar el paso — si va antes, nunca se llega a poner ese último valor,
    // el contador se frena en el último paso y el match nunca aparece.
    const next = (current: number) => {
      setStep(current);
      if (current <= VERIFICATION_STEPS.length) {
        timeoutRef.current = window.setTimeout(() => next(current + 1), STEP_INTERVAL_MS);
      }
    };
    next(1);
  }

  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-[18px]">
      <PageHeader title={VERIFY_ROUTE.title} subtitle={VERIFY_ROUTE.subtitle}>
        <Badge variant="outline" className="text-[10px] font-normal">
          público · sin login
        </Badge>
      </PageHeader>

      <div className="bg-card flex flex-wrap items-center gap-2.5 rounded-md px-3 py-2.5">
        <span className="mono text-muted-foreground text-[12px]">/verify/</span>
        <span className="mono text-brand-300 text-[12px]">{code}</span>
      </div>

      <PanelCard className="gap-3.5 p-5">
        <div className="flex flex-col gap-1">
          <CardKicker>PAICertificate · ERC-721 soulbound</CardKicker>
          <CardBody>
            El certificado representa que un activo <em>fue certificado</em>, no su propiedad ni un
            derecho económico: por eso no es transferible. Evita la trampa regulatoria de tokenizar
            derechos de cobro.
          </CardBody>
        </div>

        <SectionDivider />

        <PendingData
          title={`Certificado del código ${code}`}
          reason="El titular del certificado, la cartera que respalda y las tres atestaciones vigentes con su firmante y su fecha. Ningún código resuelve todavía: no hay certificados emitidos."
          unblockedBy="PAICertificate desplegado en Arbitrum Sepolia y un certificado emitido"
        />

        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-3">
            <CardKicker className="mb-0">Qué hará el botón «Verificar»</CardKicker>
            <Badge
              variant="outline"
              className="border-brand-700/60 text-brand-300 text-[9.5px] font-normal"
            >
              simulación — sin contrato desplegado todavía
            </Badge>
          </div>

          <ol className="mono text-ink-400 flex flex-col gap-1.5 text-[11.5px]">
            {VERIFICATION_STEPS.map((stepLabel, index) => {
              const stepNumber = index + 1;
              const reached = step >= stepNumber;
              return (
                <li
                  key={stepLabel}
                  className={cn(
                    'flex items-center gap-2.5 transition-colors duration-300',
                    reached ? 'text-ink-200' : 'text-ink-400',
                  )}
                >
                  <span
                    className={cn(
                      'text-muted-foreground transition-colors duration-300',
                      reached && 'text-brand-400',
                    )}
                  >
                    {stepNumber}/{VERIFICATION_STEPS.length}
                  </span>
                  <span>{stepLabel}</span>
                  {reached && <CheckCircle2 className="text-brand-400 size-3" aria-hidden="true" />}
                </li>
              );
            })}
          </ol>

          {done && (
            <div className="border-brand-700/50 bg-brand-900/40 flex items-center gap-2 rounded-md border px-3 py-2">
              <CheckCircle2 className="text-brand-300 size-4 flex-none" aria-hidden="true" />
              <p className="text-brand-200 text-[12.5px]">
                Coincide con <span className="mono">AssetRegistry.assets(assetId).merkleRoot</span>{' '}
                — así se vería con el certificado real, cuando exista.
              </p>
            </div>
          )}

          <Button
            onClick={runSimulation}
            disabled={running}
            size="sm"
            className="w-fit rounded-full px-4"
          >
            <PlayCircle className="size-3.5" aria-hidden="true" />
            {running ? 'Verificando…' : done ? 'Repetir simulación' : 'Verificar (simulación)'}
          </Button>

          <CardBody className="text-muted-foreground">
            Recomputa las huellas desde los archivos originales y compara el root resultante contra
            el que guarda <span className="mono">AssetRegistry</span>. Si coinciden, el expediente
            no cambió desde que se certificó. La comprobación no depende de esta página: cualquiera
            puede hacerla por su cuenta con los mismos datos.
          </CardBody>
        </div>
      </PanelCard>
    </div>
  );
}
