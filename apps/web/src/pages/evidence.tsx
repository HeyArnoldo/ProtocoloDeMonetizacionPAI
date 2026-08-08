import { StatTile } from '@/components/panel/stat-tile';
import { CardKicker, PanelCard } from '@/components/panel/panel-card';
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
 * Evidencias.
 *
 * De las tres cifras de la maqueta solo una es afirmable hoy, y no porque se
 * haya medido: **cero archivos on-chain** es una invariante del diseño, no un
 * contador. El protocolo nunca escribe un documento en la cadena; escribe una
 * huella de 32 bytes. Las otras dos —documentos en storage y costo de
 * registro— dependen de un expediente y de una transacción que no existen.
 */

/**
 * Taxonomía de evidencias del caso de referencia.
 *
 * Es el catálogo de qué se pide y para qué sirve cada cosa, no el inventario
 * de un expediente cargado: por eso no lleva conteos ni hashes de muestra.
 */
const EVIDENCE_CATEGORIES = [
  {
    category: 'Contratos corporativos firmados',
    role: 'El activo: derecho de cobro con obligado conocido',
  },
  { category: 'Facturas XML SUNAT', role: 'Una hoja del árbol por cada cuota' },
  { category: 'Extractos bancarios', role: 'Cruce de abonos contra facturación' },
  { category: 'Reporte de pasarela de pagos', role: 'Comportamiento de cobro real' },
  { category: 'Certificado INDECOPI', role: 'Continuidad: marca vigente' },
  {
    category: 'Cesiones de derechos (ex-contratistas)',
    role: 'Continuidad: sin reclamos sobre el código',
  },
  {
    category: 'Informe de dependencias y licencias',
    role: 'Continuidad: sin licencias contaminantes',
  },
];

export default function EvidencePage() {
  return (
    <div className="flex max-w-[1080px] flex-col gap-[18px]">
      <section
        aria-label="Huella de las evidencias"
        className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]"
      >
        <PendingData
          title="Documentos en storage"
          reason="Cuántos archivos cifrados sostienen el expediente. Nunca salen del servidor."
          unblockedBy="el módulo de evidencias y el storage cifrado conectados"
        />
        <StatTile
          kicker="Archivos on-chain"
          value="0"
          emphasis="brand"
          note="Invariante del diseño: solo viaja la huella, 1 root de 32 bytes"
          valueClassName="text-[25px]"
        />
        <PendingData
          title="Costo de registro"
          reason="El gas de la única transacción que escribe el root. Con paymaster, la PYME no lo paga."
          unblockedBy="una transacción real de registerAsset() en Arbitrum Sepolia"
        />
      </section>

      <PanelCard className="gap-3">
        <CardKicker>Qué entra al expediente y por qué</CardKicker>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Categoría</TableHead>
              <TableHead>Rol en el expediente</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {EVIDENCE_CATEGORIES.map((item) => (
              <TableRow key={item.category}>
                <TableCell className="text-[13px]">{item.category}</TableCell>
                <TableCell className="text-ink-400 text-[13px]">{item.role}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PanelCard>

      <PendingData
        title="Conteo por categoría y muestras SHA-256"
        reason="Cuántos documentos hay de cada tipo y la huella de cada uno, para que quien audite pueda recomputarla desde el archivo original."
        unblockedBy="documentos cargados y hasheados por el módulo de evidencias"
      />

      <p className="text-muted-foreground max-w-[700px] text-[12.5px]">
        El código, la marca INDECOPI y las cesiones no son el activo financiable: entran como
        evidencia de continuidad del servicio. Si el SaaS muere, los contratos no se cobran.
      </p>
    </div>
  );
}
