import { CalloutCard } from '@/components/panel/callout-card';
import { CardBody, CardKicker, PanelCard } from '@/components/panel/panel-card';
import { PendingData } from '@/components/panel/pending-data';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/**
 * Historial crediticio on-chain.
 *
 * Las dos filas de la maqueta —ciclo real y ciclo proyectado— son el argumento
 * de impacto más fuerte del proyecto, y también el más fácil de convertir en
 * dato falso. Se conservan como **ejemplo ilustrativo del caso de referencia**,
 * marcado como tal, separado del historial real, que está vacío porque todavía
 * no hay ningún ciclo cerrado.
 */

const REFERENCE_CYCLES = [
  {
    cycle: 'Primer préstamo · sin historial',
    rate: '18.0%',
    advance: '52.8%',
  },
  {
    cycle: 'Segundo préstamo · un ciclo limpio',
    rate: '14.5%',
    advance: '61.0%',
  },
];

export default function CreditHistoryPage() {
  return (
    <div className="flex max-w-[1080px] flex-col gap-3 sm:gap-[18px]">
      <PendingData
        title="Ciclos de préstamo de esta PYME"
        reason="Monto, plazo, tasa, advance rate y cierre de cada ciclo, reconstruidos desde los eventos del vault. Hoy no hay ningún ciclo: no hay préstamos originados."
        unblockedBy="CollateralVault desplegado y sus eventos indexados por el Worker"
      />

      <CalloutCard kicker="Ejemplo ilustrativo del caso de referencia">
        <p className="max-w-[820px] text-[13.5px]">
          Así se mueven las condiciones cuando una PYME cierra un ciclo sin incidencias. Son números
          del caso Contafácil SAC de <span className="mono">docs/referencia-pai-arbitrum.md</span>,
          calibrados para ser representativos del mercado SaaS B2B peruano —{' '}
          <strong>no son el historial de ninguna empresa registrada en el protocolo</strong>.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ciclo</TableHead>
              <TableHead>Tasa anual</TableHead>
              <TableHead>Advance rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {REFERENCE_CYCLES.map((row) => (
              <TableRow key={row.cycle}>
                {/* La descripción del ciclo es la única celda larga: envuelve en
                    móvil para que las dos cifras quepan sin gesto lateral. */}
                <TableCell className="align-top text-[13px] whitespace-normal lg:align-middle lg:whitespace-nowrap">
                  {row.cycle}
                </TableCell>
                <TableCell className="mono text-[12.5px]">{row.rate}</TableCell>
                <TableCell className="mono text-[12.5px]">{row.advance}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CalloutCard>

      <PanelCard>
        <CardKicker>Portabilidad</CardKicker>
        <CardBody>
          El track record no pertenece al prestamista. Vive en los eventos de la cadena, firmado y
          fechado, y la PYME puede llevárselo a cualquier otro prestamista del protocolo. Es la
          diferencia entre conseguir capital una vez y construir acceso al crédito.
        </CardBody>
      </PanelCard>
    </div>
  );
}
