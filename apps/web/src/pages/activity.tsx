import { CardBody, CardKicker, PanelCard } from '@/components/panel/panel-card';
import { DeploymentCard } from '@/components/panel/deployment-card';
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
 * Actividad on-chain.
 *
 * La pantalla es un espejo del índice: no consulta la cadena, lee lo que el
 * Worker ya guardó en Postgres. Los contratos YA están desplegados —el estado
 * real de la conexión lo publica `GET /api/chain/status` y se muestra arriba—,
 * pero el Worker que indexa sus eventos todavía no existe. Mientras tanto, lo
 * afirmable aquí es el despliegue canónico y qué evento emite cada contrato.
 */

/** Eventos del diseño de los contratos y qué significa cada uno. */
const INDEXED_EVENTS = [
  {
    event: 'AssetRegistered',
    contract: 'AssetRegistry',
    meaning: 'El merkleRoot del expediente queda escrito y fechado',
  },
  {
    event: 'AttestationCreated',
    contract: 'CertificationAttestor',
    meaning: 'Un certificador firma dentro de su ámbito EIP-712',
  },
  {
    event: 'AttestationRevoked',
    contract: 'CertificationAttestor',
    meaning: 'Una atestación deja de estar vigente',
  },
  {
    event: 'CertificateMinted',
    contract: 'PAICertificate',
    meaning: 'Se emite la credencial soulbound verificable',
  },
  {
    event: 'AssetPledged',
    contract: 'CollateralVault',
    meaning: 'Las hojas quedan comprometidas como colateral',
  },
  {
    event: 'LoanFunded',
    contract: 'CollateralVault',
    meaning: 'El principal en USDC llega a la PYME',
  },
  {
    event: 'LoanRepaid',
    contract: 'CollateralVault',
    meaning: 'El colateral se libera y el activo vuelve a Attested',
  },
  {
    event: 'LoanDefaulted',
    contract: 'CollateralVault',
    meaning: 'Queda la prueba fechada que dispara la ejecución legal off-chain',
  },
];

export default function ActivityPage() {
  return (
    <div className="flex max-w-[1240px] flex-col gap-3 sm:gap-3.5">
      <PendingData
        title="Transacciones del expediente"
        reason="Hash enlazable al explorador, contrato, método, firmante, gas y bloque de cada transacción, más los contadores de gas total y wallets distintas."
        unblockedBy="el Worker suscrito a los eventos de los contratos ya desplegados"
      />

      <DeploymentCard />

      <PanelCard className="gap-3">
        <CardKicker>Qué se va a indexar</CardKicker>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Evento</TableHead>
              <TableHead>Contrato</TableHead>
              <TableHead>Qué significa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* La tercera columna es una frase entera: sin envolver, la tabla
                mide el triple que la pantalla y obliga a un gesto lateral por
                cada fila. Envuelve hasta `lg` y recupera la línea única en
                escritorio, donde sí hay ancho. */}
            {INDEXED_EVENTS.map((row) => (
              <TableRow key={row.event}>
                <TableCell className="mono text-brand-300 align-top text-[11.5px] whitespace-normal lg:align-middle lg:whitespace-nowrap">
                  {row.event}
                </TableCell>
                <TableCell className="mono align-top text-[11.5px] whitespace-normal lg:align-middle lg:whitespace-nowrap">
                  {row.contract}
                </TableCell>
                <TableCell className="text-ink-400 align-top text-[12.5px] whitespace-normal lg:align-middle lg:whitespace-nowrap">
                  {row.meaning}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PanelCard>

      <PanelCard>
        <CardKicker>Por qué una cola y no una espera</CardKicker>
        <CardBody>
          El Worker se suscribe a los eventos <span className="mono">indexed</span> y actualiza
          Postgres. La API nunca espera confirmaciones: la cola las absorbe. Cuando Postgres y la
          cadena discrepan, gana la cadena.
        </CardBody>
      </PanelCard>
    </div>
  );
}
