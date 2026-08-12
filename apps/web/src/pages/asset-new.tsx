import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { CURRENCY_CODES } from '@app/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CardBody, CardKicker, PanelCard } from '@/components/panel/panel-card';
import { HashValue } from '@/components/panel/hash-value';
import { buildCreateAssetInput, emptyRow, type AssetDraftRow } from '@/domain/asset-draft';
import {
  INITIAL_REGISTRATION,
  runAssetRegistration,
  type AssetRegistrationState,
} from '@/domain/asset-registration';
import { formatMinorUnits } from '@/domain/money';
import { useEvidence } from '@/hooks/use-evidence';
import { useWalletSubmitter } from '@/hooks/use-wallet-submitter';
import { useWallet } from '@/context/wallet-provider';
import { assetsClient } from '@/services/assets.api';

const STEP_LABEL: Record<AssetRegistrationState['step'], string> = {
  idle: 'Sin empezar',
  creating: 'Construyendo el árbol y guardando el expediente…',
  signing: 'Confirma la transacción en tu wallet…',
  confirming: 'Contrastando lo escrito on-chain contra el borrador…',
  confirmed: 'Expediente registrado on-chain.',
  error: 'El registro se detuvo.',
};

/**
 * Creación del expediente: de las evidencias ya cargadas al `AssetRegistry`.
 *
 * Es el único punto donde nace un `assetId`. Antes de esta pantalla el panel
 * sabía leer expedientes pero no crear ninguno, así que todo el recorrido
 * —certificación, divulgación, préstamo— no tenía sobre qué operar.
 *
 * El monto va en **unidades menores** (centavos), igual que en el árbol de
 * Merkle y en el motor de riesgo. No se confunde con la escala del token: eso
 * solo aparece en el préstamo, y ahí el campo lo dice.
 */
export default function AssetNewPage() {
  const evidence = useEvidence();
  const wallet = useWallet();
  const submitter = useWalletSubmitter();
  const [controller, setController] = useState('');
  const [rows, setRows] = useState<AssetDraftRow[]>([emptyRow()]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [state, setState] = useState<AssetRegistrationState>(INITIAL_REGISTRATION);

  const busy = state.step === 'creating' || state.step === 'signing' || state.step === 'confirming';
  const done = state.step === 'confirmed';

  const patch = (index: number, change: Partial<AssetDraftRow>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...change } : row)));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setValidationError(null);
    let input;
    try {
      input = buildCreateAssetInput({ controller, rows });
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Borrador inválido.');
      return;
    }
    // `state.assetId` reanuda tras una firma rechazada en vez de crear otro
    // expediente: `create` es idempotente por borrador, no por intención.
    void runAssetRegistration(
      assetsClient,
      submitter,
      input,
      setState,
      state.assetId ?? undefined,
    ).catch(() => undefined);
  };

  return (
    <div className="flex max-w-[1180px] flex-col gap-3 sm:gap-[18px]">
      <PanelCard className="gap-3">
        <CardKicker>AssetRegistry · registro del expediente</CardKicker>
        <CardBody>
          Las cuotas que elijas se convierten en las hojas del árbol de Merkle. Del expediente
          entero, on-chain viajan <span className="mono">32 bytes</span>: el root. El servidor no
          firma nada — la transacción la manda tu wallet.
        </CardBody>
        {wallet.status !== 'connected' ? (
          <p className="text-destructive text-[12.5px]">
            Conecta MetaMask en Arbitrum Sepolia antes de registrar: el último paso lo firmas tú.
          </p>
        ) : null}
      </PanelCard>

      <form className="flex flex-col gap-3 sm:gap-[18px]" onSubmit={submit} noValidate>
        <PanelCard className="gap-3">
          <CardKicker>Wallet controladora</CardKicker>
          <div className="grid gap-1.5">
            <Label htmlFor="asset-controller">Dirección que controlará el expediente</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="asset-controller"
                value={controller}
                onChange={(e) => setController(e.target.value.trim())}
                placeholder="0x… address"
                disabled={busy || done}
                className="max-w-[520px]"
              />
              {wallet.account ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy || done}
                  onClick={() => setController(wallet.account!)}
                >
                  Usar la conectada
                </Button>
              ) : null}
            </div>
            <p className="text-muted-foreground text-[11px] leading-snug">
              Es quien podrá pignorar y pedir el préstamo. Se guarda en minúsculas.
            </p>
          </div>
        </PanelCard>

        <PanelCard className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardKicker>Cuotas por cobrar</CardKicker>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || done}
              onClick={() => setRows((current) => [...current, emptyRow()])}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Agregar cuota
            </Button>
          </div>

          {evidence.isError ? (
            <p className="text-destructive text-[12.5px]">
              No se pudieron leer tus evidencias. Recarga la página.
            </p>
          ) : null}
          {evidence.data && evidence.data.length === 0 ? (
            <p className="text-muted-foreground text-[12.5px]">
              No tienes evidencias cargadas.{' '}
              <Link to="/evidencias" className="text-brand-300 underline underline-offset-2">
                Sube al menos una
              </Link>{' '}
              antes de crear el expediente: cada cuota se respalda con un documento.
            </p>
          ) : null}

          <ul className="flex flex-col gap-3">
            {rows.map((row, index) => (
              <li
                key={index}
                className="border-ink-800 grid gap-3 rounded-md border p-3 sm:grid-cols-2"
              >
                <div className="flex items-center justify-between gap-2 sm:col-span-2">
                  <span className="mono text-ink-400 text-[11px]">Cuota {index + 1}</span>
                  {rows.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Quitar la cuota ${index + 1}`}
                      disabled={busy || done}
                      onClick={() => setRows((c) => c.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>

                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor={`row-${index}-evidence`}>Evidencia que la respalda</Label>
                  <select
                    id={`row-${index}-evidence`}
                    className="border-input bg-background h-9 min-h-11 rounded-md border px-3 text-sm lg:min-h-0"
                    value={row.evidenceId}
                    disabled={busy || done}
                    onChange={(e) => patch(index, { evidenceId: e.target.value })}
                  >
                    <option value="">Elige un documento…</option>
                    {(evidence.data ?? []).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.originalName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor={`row-${index}-tax`}>RUC del deudor</Label>
                  <Input
                    id={`row-${index}-tax`}
                    value={row.debtorTaxId}
                    inputMode="numeric"
                    disabled={busy || done}
                    onChange={(e) => patch(index, { debtorTaxId: e.target.value })}
                    placeholder="20512345678"
                  />
                  <p className="text-muted-foreground text-[11px] leading-snug">
                    On-chain viaja hasheado con un salt. El RUC en claro nunca sale del servidor.
                  </p>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor={`row-${index}-label`}>Razón social</Label>
                  <Input
                    id={`row-${index}-label`}
                    value={row.debtorLabel}
                    disabled={busy || done}
                    onChange={(e) => patch(index, { debtorLabel: e.target.value })}
                    placeholder="Supermercados Andinos SAC"
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor={`row-${index}-amount`}>Monto (unidades menores)</Label>
                  <Input
                    id={`row-${index}-amount`}
                    value={row.amountMinor}
                    inputMode="numeric"
                    disabled={busy || done}
                    onChange={(e) => patch(index, { amountMinor: e.target.value })}
                    placeholder="800000"
                  />
                  <p className="text-muted-foreground text-[11px] leading-snug">
                    {/^[1-9]\d*$/.test(row.amountMinor)
                      ? formatMinorUnits(row.amountMinor, row.currency)
                      : 'Centavos, sin decimales: 8 000,00 → 800000.'}
                  </p>
                </div>

                <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor={`row-${index}-due`}>Vencimiento</Label>
                    <Input
                      id={`row-${index}-due`}
                      type="date"
                      value={row.dueDate}
                      disabled={busy || done}
                      onChange={(e) => patch(index, { dueDate: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`row-${index}-currency`}>Moneda</Label>
                    <select
                      id={`row-${index}-currency`}
                      className="border-input bg-background h-9 min-h-11 rounded-md border px-3 text-sm lg:min-h-0"
                      value={row.currency}
                      disabled={busy || done}
                      onChange={(e) => patch(index, { currency: Number(e.target.value) })}
                    >
                      <option value={CURRENCY_CODES.USD}>USD</option>
                      <option value={CURRENCY_CODES.PEN}>PEN</option>
                    </select>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </PanelCard>

        <PanelCard className="gap-3" aria-live="polite">
          <CardKicker>Registro on-chain</CardKicker>
          <CardBody>{STEP_LABEL[state.step]}</CardBody>

          {state.assetId ? (
            <div className="grid gap-1.5">
              <span className="text-muted-foreground text-[11px]">
                Asset ID — no lo confundas con el SHA-256 de una evidencia
              </span>
              <HashValue value={state.assetId} />
            </div>
          ) : null}
          {state.hash ? (
            <div className="grid gap-1.5">
              <span className="text-muted-foreground text-[11px]">Transacción</span>
              <HashValue value={state.hash} />
            </div>
          ) : null}

          {validationError || state.error ? (
            <p role="alert" className="text-destructive text-sm">
              {validationError ?? state.error?.message}
            </p>
          ) : null}

          {done ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link to={`/expediente?assetId=${state.assetId}`}>Abrir el expediente</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to={`/verify/${state.assetId}`}>Ver la verificación pública</Link>
              </Button>
            </div>
          ) : (
            <Button type="submit" disabled={busy || wallet.status !== 'connected'}>
              {busy
                ? 'Registro en curso…'
                : state.assetId
                  ? 'Reintentar la firma'
                  : 'Crear y registrar on-chain'}
            </Button>
          )}
        </PanelCard>
      </form>
    </div>
  );
}
