import { useQuery } from '@tanstack/react-query';
import type { ChainContractRef } from '@app/contracts';
import { chainStatusQuery, formatBlock } from '@/services/chain.api';
import { summarizeDeployment, type DeploymentSummary } from '@/domain/chain-deployment';

/**
 * Estado de la conexión con la cadena, al pie del sidebar.
 *
 * La maqueta original mostraba un contador de bloques subiendo solo cada 2.4s.
 * Eso era un dato falso: parecía vivo sin estarlo. Ahora el número viene de
 * `GET /api/chain/status`, que la API resuelve leyendo el RPC de Arbitrum.
 *
 * Tres estados, no dos. `unreachable` existe a propósito: una API configurada
 * contra Arbitrum cuyo RPC está caído NO puede pintarse como conectada. El
 * punto solo late cuando hubo una lectura real del RPC en los últimos segundos.
 */
export function NetworkStatus() {
  const { data, isError } = useQuery(chainStatusQuery);

  // Mientras carga o si la propia API falla, no se afirma nada.
  if (!data || isError) {
    return (
      <Shell dotClassName="bg-ink-700" label="Arbitrum Sepolia">
        <Line>
          {isError ? 'No se pudo consultar el estado de la cadena.' : 'Consultando la red…'}
        </Line>
      </Shell>
    );
  }

  if (data.status === 'offline') {
    return (
      <Shell dotClassName="bg-ink-700" label="Sin cadena">
        <Line>Adapter en memoria: los hashes son sintéticos.</Line>
        <Line>Ninguna lectura llega a Arbitrum.</Line>
      </Shell>
    );
  }

  if (data.status === 'unreachable') {
    return (
      <Shell dotClassName="bg-destructive" label={`Arbitrum Sepolia · ${data.chainId}`}>
        <Line className="text-destructive">
          RPC sin responder: el panel no lee la cadena ahora.
        </Line>
        <Line>{data.contracts.length} contratos configurados, sin confirmar contra la red.</Line>
      </Shell>
    );
  }

  // El desfase entre `safe` y `head` es el margen de reorg que el adapter
  // mantiene a propósito. Mostrar ambos es lo que hace auditable el "conectado".
  const lag = Number(data.headBlock) - Number(data.safeBlock);
  const deployment = summarizeDeployment(data.contracts);
  return (
    <Shell
      dotClassName="bg-primary animate-blink"
      label={`Arbitrum Sepolia · ${data.chainId}`}
      title={`safe ${data.safeBlock} · head ${data.headBlock}`}
    >
      <Line className="mono">safe #{formatBlock(data.safeBlock)}</Line>
      <Line>
        head #{formatBlock(data.headBlock)} · {formatBlock(String(lag))} bloques de margen
      </Line>
      <DeploymentLine summary={deployment} />
    </Shell>
  );
}

/**
 * Cuántos contratos tienen bytecode en su dirección configurada.
 *
 * "Configurado" no es "desplegado". Tras un redespliegue las direcciones viejas
 * quedan apuntando a cuentas vacías, y un panel que solo cuenta variables de
 * entorno seguiría diciendo "6 contratos" hasta que una transacción reviente en
 * vivo. Por eso el verde exige los seis confirmados: cualquier otra cosa se
 * pinta como advertencia, y un contrato que no se pudo leer nunca se cuenta
 * como verificado.
 */
function DeploymentLine({ summary }: { summary: DeploymentSummary }) {
  const count = `${summary.verified} de ${summary.expected} contratos verificados on-chain`;

  if (summary.verdict === 'verified') {
    return <Line>{count}.</Line>;
  }

  if (summary.verdict === 'missing') {
    return (
      <>
        <Line className="text-destructive">{count}.</Line>
        <Line className="text-destructive">
          Sin bytecode en su dirección: {names(summary.missing)}.
        </Line>
      </>
    );
  }

  return (
    <>
      <Line className="text-ink-300">{count}.</Line>
      <Line className="text-ink-300">
        {summary.unconfirmed.length > 0
          ? `No se pudo confirmar: ${names(summary.unconfirmed)}. No es lo mismo que no estar desplegado.`
          : 'No se pudo confirmar el despliegue contra la red.'}
      </Line>
    </>
  );
}

function names(list: ChainContractRef['name'][]): string {
  return list.join(', ');
}

function Shell({
  children,
  dotClassName,
  label,
  title,
}: {
  children: React.ReactNode;
  dotClassName: string;
  label: string;
  title?: string;
}) {
  return (
    <div className="bg-card flex flex-col gap-1.5 rounded-md p-2.5" title={title}>
      <div className="text-ink-400 flex items-center gap-1.5 text-[11px]">
        <span className={`size-1.5 rounded-full ${dotClassName}`} aria-hidden="true" />
        {label}
      </div>
      {children}
    </div>
  );
}

function Line({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-muted-foreground text-[10px] leading-snug ${className}`}>{children}</p>
  );
}
