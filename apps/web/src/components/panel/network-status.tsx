/**
 * Estado de la conexión con la cadena, al pie del sidebar.
 *
 * La maqueta muestra un punto latiendo, `block #92,501,903` subiendo de uno en
 * uno cada 2.4s y `gas 0.01 gwei`. Nada de eso existe todavía: `apps/web` no
 * tiene cliente RPC y `chain/` no tiene ningún contrato desplegado. Un
 * contador que sube solo es la peor clase de dato falso, porque parece vivo.
 *
 * Así que la tarjeta declara lo que hay. La forma —punto de estado, red,
 * dos líneas de métrica— queda lista para que la integración con la cadena
 * sustituya el texto por `chainId`, número de bloque y gas reales, y encienda
 * el punto con `animate-blink` cuando la suscripción esté viva.
 */
export function NetworkStatus() {
  return (
    <div className="bg-card flex flex-col gap-1.5 rounded-md p-2.5">
      <div className="text-ink-400 flex items-center gap-1.5 text-[11px]">
        {/* Punto apagado: `ink-700` y sin latido. El latido significa
            suscripción viva y hoy no hay ninguna. */}
        <span className="bg-ink-700 size-1.5 rounded-full" aria-hidden="true" />
        Arbitrum Sepolia
      </div>
      <p className="text-muted-foreground text-[10px] leading-snug">
        Sin RPC configurado: el panel no lee la cadena todavía.
      </p>
      <p className="text-muted-foreground text-[10px] leading-snug">
        Sin contratos desplegados en la red.
      </p>
    </div>
  );
}
