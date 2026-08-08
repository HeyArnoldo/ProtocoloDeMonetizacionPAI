import { CodeBlock } from '@/components/panel/code-block';
import { CardBody, CardKicker, PanelCard } from '@/components/panel/panel-card';
import { PendingData } from '@/components/panel/pending-data';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Originación y fondeo.
 *
 * El desenlace de default es la parte de la pantalla que más importa que esté
 * escrita con precisión: el contrato **produce la prueba**, no ejecuta la
 * garantía. Decir lo contrario es falso y, ante un jurado técnico, destruye la
 * credibilidad del proyecto entero.
 */

export default function LoanPage() {
  return (
    <div className="grid max-w-[1180px] items-start gap-[18px] lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <PanelCard>
          <CardKicker>CollateralVault · USDC nativo</CardKicker>
          <CardBody>
            El vault custodia el colateral, desembolsa el principal y registra el repago o el
            incumplimiento. USDC nativo de Circle y no un wrapper: un préstamo sobre activos reales
            necesita una stablecoin creíble.
          </CardBody>
          <CodeBlock
            lines={[
              { value: 'transferFrom(fondo → vault, principal)' },
              { value: 'transfer(vault → PYME, principal)' },
              { value: '// misma tx · el dinero nunca toca el servidor', muted: true },
            ]}
          />
          <CardBody>
            Ese par en la misma transacción es lo que saca a la plataforma de ser intermediario
            financiero: el desembolso no pasa por el backend en ningún momento.
          </CardBody>
        </PanelCard>

        <PendingData
          title="Datos del préstamo"
          reason="Principal, plazo, tasa, base prestable, uso de la base y hojas comprometidas como colateral. Son estado del vault, no cifras de catálogo."
          unblockedBy="CollateralVault desplegado en Arbitrum Sepolia con un préstamo originado"
        />
      </div>

      <Tabs defaultValue="repayment" className="gap-3.5">
        <TabsList>
          <TabsTrigger value="repayment">Desenlace A · repago</TabsTrigger>
          <TabsTrigger value="default">Desenlace B · default</TabsTrigger>
        </TabsList>

        <TabsContent value="repayment">
          <PanelCard>
            <CardKicker>Desenlace A</CardKicker>
            <h2 className="text-[17px] font-medium">Repago y efecto compuesto</h2>
            <CardBody>
              La PYME repaga el principal más el interés. El vault libera el colateral y el activo
              vuelve a <span className="mono">Attested</span>, listo para un segundo ciclo.
            </CardBody>
            <CodeBlock lines={[{ value: 'repay(loanId, principal + interés) → Status.Repaid' }]} />
            <CardBody className="text-muted-foreground">
              Lo interesante viene después: queda un historial crediticio portable que hoy no existe
              en ningún lado.
            </CardBody>
          </PanelCard>
        </TabsContent>

        <TabsContent value="default">
          <PanelCard>
            <CardKicker>Desenlace B</CardKicker>
            <h2 className="text-[17px] font-medium">
              El contrato produce la prueba, no ejecuta la garantía
            </h2>
            <CardBody>
              Transiciona a <span className="mono">DEFAULTED</span> y emite el evento con fecha
              exacta, monto pendiente y atestaciones vigentes. No se apodera de nada: no puede —los
              derechos de cobro son un contrato bajo ley peruana.
            </CardBody>
            <CodeBlock
              lines={[{ value: 'emit LoanDefaulted(loanId, pendiente, block.timestamp)' }]}
            />
            <CardBody className="text-muted-foreground">
              El evento es el disparador contractual pactado: el fondo notifica notarialmente a los
              deudores para que paguen directamente. La ejecución es legal y off-chain; la prueba
              que la sostiene es on-chain — y es lo que hoy toma meses litigar.
            </CardBody>
          </PanelCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
