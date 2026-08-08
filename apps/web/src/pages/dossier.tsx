import { CodeBlock } from '@/components/panel/code-block';
import { CardBody, CardKicker, PanelCard } from '@/components/panel/panel-card';
import { PendingData } from '@/components/panel/pending-data';

/**
 * Expediente y árbol de Merkle.
 *
 * La grilla de celdas y las tres tarjetas de identidad describen un activo
 * registrado. Lo que sí es verdad hoy —y es lo importante de esta pantalla— es
 * la codificación de la hoja: está definida en `packages/merkle` y verificada
 * por `fixtures/golden-vectors.json`, y es la frontera exacta entre Web2 y
 * Web3. Cambiarla rompe la verificación on-chain.
 */

/** La tupla que Solidity y el motor Stylus decodifican, en ese orden. */
const LEAF_FIELDS = [
  { type: 'bytes32', name: 'debtorHash' },
  { type: 'uint256', name: 'amountMinor' },
  { type: 'uint64', name: 'dueDate' },
  { type: 'uint16', name: 'currency' },
  { type: 'bytes32', name: 'docHash' },
];

export default function DossierPage() {
  return (
    <div className="flex max-w-[1180px] flex-col gap-4 sm:gap-5">
      <section
        aria-label="Identidad del activo"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <PendingData
          title="assetId"
          reason="Identificador del activo en el registro: la clave del mapping assets(bytes32)."
          unblockedBy="AssetRegistry desplegado en Arbitrum Sepolia"
        />
        <PendingData
          title="merkleRoot certificado"
          reason="Los 32 bytes que resumen todo el expediente. Es el único dato del activo que llega a la cadena."
          unblockedBy="un expediente registrado con registerAsset()"
        />
        <PendingData
          title="controller"
          reason="Smart account ERC-4337 que controla el activo y firma sus transacciones."
          unblockedBy="el despliegue de smart accounts para las cuentas del panel"
        />
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
        <PendingData
          title="Mapa de hojas del expediente"
          reason="Una celda por cuota: divulgada al fondo, presente en el root pero oculta, o no elegible por cláusula de no-cesión. Es la misma selección que se hace en Divulgación selectiva, vista como superficie."
          unblockedBy="un expediente registrado; la selección ya funciona sobre la cartera de muestra en Divulgación selectiva"
        />

        <div className="flex min-w-0 flex-col gap-3">
          <PanelCard>
            <CardKicker>Anatomía de la hoja</CardKicker>
            <CodeBlock
              lines={LEAF_FIELDS.map((field) => ({
                label: field.type,
                value: <span className="text-brand-300">{field.name}</span>,
              }))}
            />
            <CardBody>
              Definición normativa: Solidity y el motor Stylus decodifican exactamente esta tupla.{' '}
              <span className="mono">keccak256(keccak256(abi.encode(...)))</span> — doble hash
              contra segunda preimagen, formato <span className="mono">StandardMerkleTree</span>.
            </CardBody>
          </PanelCard>

          <PanelCard>
            <CardKicker>El deudor viaja con salt</CardKicker>
            <CardBody>
              Un RUC son 11 dígitos: un <span className="mono">keccak256</span> pelado se rompe por
              fuerza bruta en minutos y expone la cartera de clientes. Con salt de 32 bytes el
              espacio deja de ser enumerable, y quien tenga el salt igual recomputa.
            </CardBody>
          </PanelCard>

          <PanelCard>
            <CardKicker>Dos algoritmos, dos usos</CardKicker>
            <CardBody>
              <span className="mono">SHA-256</span> para los archivos y{' '}
              <span className="mono">keccak256</span> para las hojas del árbol. No son
              intercambiables: el primero es el que recomputa cualquiera desde el documento
              original, el segundo es el que la EVM sabe calcular barato.
            </CardBody>
          </PanelCard>
        </div>
      </div>
    </div>
  );
}
