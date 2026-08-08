import { CalloutCard } from '@/components/panel/callout-card';
import { CardBody, CardKicker, PanelCard } from '@/components/panel/panel-card';
import { PendingData } from '@/components/panel/pending-data';

/**
 * Cola de atestaciones.
 *
 * Los tres ámbitos EIP-712 y el reparto de lo que cada certificador ve —y no
 * ve— son parte del diseño de `CertificationAttestor.sol`, así que se pueden
 * describir hoy. Las wallets, las métricas atestadas y el estado de cada firma
 * salen de la cadena.
 */

const CERTIFIERS = [
  {
    role: 'Contador público',
    scope: 'REVENUE_VERIFIED',
    checks:
      'Cruza cada factura contra SUNAT y contra los abonos de los extractos bancarios. No ve los contratos ni el código.',
    metricLabel: 'Mora histórica',
    metricReason:
      'Los puntos básicos de morosidad que el motor de riesgo usa como haircut. Los afirma el contador con su firma, no el backend.',
  },
  {
    role: 'Abogado',
    scope: 'RIGHTS_ASSIGNABLE',
    checks:
      'Revisa que la cesión esté permitida, que no haya prenda previa y que la marca esté vigente. No ve facturas ni infraestructura.',
    metricLabel: 'Contratos cedibles',
    metricReason:
      'Cuántos contratos del expediente admiten cesión. Es lo que determina qué hojas entran al cálculo.',
  },
  {
    role: 'Auditor técnico',
    scope: 'SERVICE_CONTINUITY',
    checks:
      'Comprueba que el servicio opera, que no hay licencias contaminantes y que la infraestructura es sostenible. No ve montos ni deudores.',
    metricLabel: 'Score de continuidad',
    metricReason:
      'El puntaje que alimenta el ajuste de continuidad. Si el servicio muere, los contratos no se cobran.',
  },
];

export default function CertificationPage() {
  return (
    <div className="flex max-w-[1180px] flex-col gap-[18px]">
      <p className="text-ink-400 max-w-[760px] text-[13px]">
        Ningún certificador ve todo el expediente. Cada firma es acotada a su ámbito, fechada y
        revocable — y esa separación es lo que hace creíble el resultado.
      </p>

      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
        {CERTIFIERS.map((certifier) => (
          <PanelCard key={certifier.scope} className="gap-2.5">
            <CardKicker>{certifier.role}</CardKicker>
            <p className="mono text-brand-300 text-[11.5px]">{certifier.scope}</p>
            <CardBody>{certifier.checks}</CardBody>
            <PendingData
              title={certifier.metricLabel}
              reason={certifier.metricReason}
              unblockedBy="una atestación firmada en CertificationAttestor"
            />
          </PanelCard>
        ))}
      </div>

      <PanelCard>
        <CardKicker>Cómo se firma</CardKicker>
        <CardBody>
          Cada certificador llama <span className="mono">attest()</span> desde su propia wallet con{' '}
          <span className="mono">CERTIFIER_ROLE</span>. El rol es literalmente un hash y el contrato
          revierte si quien firma no lo tiene. La API no firma transacciones de valor: solo
          atestaciones EIP-712 y lectura de eventos. Todavía no hay contrato desplegado, así que no
          hay ninguna firma que emitir ni revocar desde aquí.
        </CardBody>
      </PanelCard>

      <CalloutCard kicker="El hallazgo del abogado (ejemplo ilustrativo del caso de referencia)">
        <p className="max-w-[860px] text-[13.5px]">
          En el caso Contafácil SAC, 2 de los 18 contratos —dos municipalidades— tienen cláusula de
          no-cesión. Con un solo <span className="mono">manifestHash</span> eso sería invisible: el
          expediente estaría certificado o no. Con el árbol de Merkle esos dos se marcan no
          elegibles y los otros 16 siguen financiables.
        </p>
        <p className="text-muted-foreground text-[12.5px]">
          La granularidad no es un detalle técnico: es lo que evita que un expediente entero se
          caiga por dos documentos malos.
        </p>
      </CalloutCard>
    </div>
  );
}
