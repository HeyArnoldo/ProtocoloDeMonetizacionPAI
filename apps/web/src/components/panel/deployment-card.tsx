import { useQuery } from '@tanstack/react-query';
import { CardKicker, PanelCard } from '@/components/panel/panel-card';
import { chainStatusQuery, formatBlock } from '@/services/chain.api';

/** Nombre legible de cada contrato del despliegue canónico. */
const LABELS: Record<string, string> = {
  assetRegistry: 'AssetRegistry',
  certificationAttestor: 'CertificationAttestor',
  paiCertificate: 'PAICertificate',
  borrowingBaseEngine: 'BorrowingBaseEngine',
  collateralVault: 'CollateralVault',
  mockUsdc: 'MockUSDC',
};

/**
 * Despliegue canónico leído de la API, no de una constante del bundle.
 *
 * Es la prueba que un jurado puede contrastar sin credenciales: cada dirección
 * enlaza a Arbiscan, y el bloque seguro dice a qué altura se leyó.
 */
export function DeploymentCard() {
  const { data } = useQuery(chainStatusQuery);

  if (!data || data.status === 'offline' || data.contracts.length === 0) return null;

  return (
    <PanelCard className="gap-3">
      <CardKicker>
        Despliegue canónico · chain {data.chainId}
        {data.status === 'live'
          ? ` · leído en el bloque seguro #${formatBlock(data.safeBlock)}`
          : ' · RPC sin responder ahora mismo'}
      </CardKicker>

      <ul className="flex flex-col gap-1.5">
        {data.contracts.map((contract) => (
          <li key={contract.name} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-brand-300 min-w-48 text-[12.5px]">
              {LABELS[contract.name] ?? contract.name}
            </span>
            {contract.explorerUrl ? (
              // `min-h-11` en móvil: es un enlace que se toca con el dedo y una
              // línea de texto de 17px queda por debajo del mínimo táctil de
              // 44px que exige `e2e/responsive.spec.ts`.
              <a
                href={contract.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="mono text-ink-400 hover:text-foreground inline-flex min-h-11 items-center text-[11.5px] underline underline-offset-2 sm:min-h-0"
              >
                {contract.address}
              </a>
            ) : (
              <span className="mono text-ink-400 text-[11.5px]">{contract.address}</span>
            )}
          </li>
        ))}
      </ul>

      {data.deploymentBlock ? (
        <p className="text-muted-foreground text-[11.5px]">
          Desplegado en el bloque #{formatBlock(data.deploymentBlock)}. Las lecturas de eventos
          arrancan ahí: antes de ese bloque no existe nada que indexar.
        </p>
      ) : null}
    </PanelCard>
  );
}
