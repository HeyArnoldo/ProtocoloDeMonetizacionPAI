import { useState, type FormEvent } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CodeBlock } from '@/components/panel/code-block';
import { CardBody, CardKicker, PanelCard } from '@/components/panel/panel-card';
import { buildLoanIntentRequest, type LoanAction } from '@/domain/loan-intent';
import { formatTokenUnits } from '@/domain/money';
import { useDisclosureSelection } from '@/hooks/use-disclosure-selection';
import { useTransactionIntent } from '@/hooks/use-transaction-intent';
import { useWalletSubmitter } from '@/hooks/use-wallet-submitter';
const ASSET_STORAGE_KEY = 'pai:disclosure-asset-id';
function rememberedAssetId(): string {
  try {
    return window.sessionStorage.getItem(ASSET_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}
export default function LoanPage() {
  const disclosure = useDisclosureSelection();
  const submitter = useWalletSubmitter();
  const transaction = useTransactionIntent(submitter);
  const [action, setAction] = useState<LoanAction>('originate');
  const [assetId, setAssetId] = useState(rememberedAssetId);
  const [lender, setLender] = useState('');
  const [principal, setPrincipal] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const busy = transaction.status === 'preparing' || transaction.status === 'submitting';
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setValidationError(null);
    transaction.reset();
    let body: Record<string, unknown>;
    try {
      body = buildLoanIntentRequest(
        { action, assetId, lender, principal, dueDate },
        disclosure.proof
          ? {
              verified: disclosure.proof.verified,
              proof: disclosure.proof.proof,
              proofFlags: disclosure.proof.proofFlags,
              selectedLeaves: disclosure.selectedLeaves,
            }
          : null,
      );
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Invalid transaction fields.');
      return;
    }
    void transaction.execute(action, body).catch(() => undefined);
  };
  const explorerBase = import.meta.env.VITE_EXPLORER_TX_URL?.replace(/\/$/, '');
  const statusText =
    transaction.status === 'preparing'
      ? 'Preparing unsigned intent…'
      : transaction.status === 'submitting'
        ? 'Confirm the transaction in your wallet…'
        : transaction.status === 'success'
          ? 'Transaction submitted.'
          : 'Ready. Your wallet opens only after you submit.';
  return (
    <div className="grid max-w-[1180px] items-start gap-3 sm:gap-[18px] lg:grid-cols-[1.2fr_0.8fr]">
      <PanelCard>
        <CardKicker>CollateralVault · unsigned transaction intent</CardKicker>
        <h2 className="text-[17px] font-medium">Prepare and submit a loan transaction</h2>
        <CardBody>
          The authenticated API prepares calldata; your injected wallet checks the network and
          submits it. The connector boundary can support account abstraction later, but this demo
          does not claim a smart account is deployed.
        </CardBody>
        <form className="mt-2 grid gap-4" onSubmit={submit} noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="loan-action">Action</Label>
            {/* `min-h-11` hasta `lg`, igual que `Button` e `Input`: los 36px de
                `h-9` están por debajo del mínimo táctil de 44px. */}
            <select
              id="loan-action"
              className="border-input bg-background h-9 min-h-11 rounded-md border px-3 text-sm lg:min-h-0"
              value={action}
              onChange={(event) => setAction(event.target.value as LoanAction)}
              disabled={busy}
            >
              <option value="originate">Originate</option>
              <option value="fund">Fund</option>
              <option value="repay">Repay</option>
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="loan-asset-id">Asset ID</Label>
            <Input
              id="loan-asset-id"
              value={assetId}
              onChange={(event) => setAssetId(event.target.value.trim())}
              placeholder="0x… bytes32"
              autoComplete="off"
              disabled={busy}
            />
          </div>
          {action === 'originate' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="loan-lender">Lender wallet address</Label>
                <Input
                  id="loan-lender"
                  value={lender}
                  onChange={(e) => setLender(e.target.value.trim())}
                  placeholder="0x… address"
                  disabled={busy}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="loan-principal">Principal (unidades de mUSDC · 6 decimales)</Label>
                <Input
                  id="loan-principal"
                  inputMode="numeric"
                  value={principal}
                  onChange={(e) => setPrincipal(e.target.value)}
                  placeholder="5000000000"
                  disabled={busy}
                />
                {/* En este sistema conviven dos escalas: las cuotas y la base
                    prestable van en centavos, y mUSDC tiene 6 decimales. Decir
                    solo "minor units" obliga a adivinar cuál de las dos, y
                    equivocarse revierte la transacción — momento en el que
                    MetaMask deja de poder estimar el gas y muestra cifras
                    absurdas. La equivalencia se escribe, no se supone. */}
                <p className="text-muted-foreground text-[11px] leading-snug">
                  1 mUSDC = 1 000 000 unidades.{' '}
                  {formatTokenUnits(principal) ?? 'Escribe un entero para ver el equivalente.'}
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="loan-due-date">Due date</Label>
                <Input
                  id="loan-due-date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={busy}
                />
              </div>
            </div>
          ) : null}
          <Button type="submit" disabled={busy}>
            {busy ? 'Transaction in progress…' : `Prepare and submit ${action}`}
          </Button>
        </form>
      </PanelCard>
      <PanelCard aria-live="polite">
        <CardKicker>Wallet boundary</CardKicker>
        <h2 className="text-[17px] font-medium">Transaction status</h2>
        <CardBody>{statusText}</CardBody>
        {action === 'originate' ? (
          <CardBody>
            Disclosure proof: {disclosure.proof?.verified ? 'verified and ready' : 'build it first'}
            .
          </CardBody>
        ) : null}
        {validationError || transaction.error ? (
          <p role="alert" className="text-destructive text-sm">
            {validationError ?? transaction.error?.message}
          </p>
        ) : null}
        {transaction.hash ? <p className="mono break-all text-xs">{transaction.hash}</p> : null}
        {transaction.hash && explorerBase ? (
          <Button asChild variant="link" className="w-fit px-0">
            <a href={`${explorerBase}/tx/${transaction.hash}`} target="_blank" rel="noreferrer">
              View in explorer <ExternalLink aria-hidden="true" />
            </a>
          </Button>
        ) : null}
      </PanelCard>
      <Tabs defaultValue="repayment" className="min-w-0 gap-3.5 lg:col-span-2">
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
          </PanelCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
