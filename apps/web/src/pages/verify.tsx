import { useParams } from 'react-router-dom';
import { PageHeader } from '@/components/panel/page-header';
import { CardBody, CardKicker, PanelCard } from '@/components/panel/panel-card';
import { PendingData } from '@/components/panel/pending-data';
import { SectionDivider } from '@/components/panel/section-divider';
import { VERIFY_ROUTE } from '@/config/navigation';
import { Badge } from '@/components/ui/badge';

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

export default function VerifyPage() {
  const { code } = useParams<{ code: string }>();

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

        <div className="flex flex-col gap-2">
          <CardKicker>Qué hará el botón «Verificar»</CardKicker>
          <ol className="mono text-ink-400 flex flex-col gap-1 text-[11.5px]">
            {VERIFICATION_STEPS.map((step, index) => (
              <li key={step} className="flex gap-2.5">
                <span className="text-muted-foreground">{index + 1}/5</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
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
