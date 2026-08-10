import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { HashValue } from '@/components/panel/hash-value';
import { PageHeader } from '@/components/panel/page-header';
import { CardBody, CardKicker, PanelCard } from '@/components/panel/panel-card';
import { VERIFY_ROUTE } from '@/config/navigation';
import { publicVerificationClient, validateVerificationAssetId } from '@/services/verification.api';

function errorMessage(error: unknown): string {
  const status = (error as { response?: { status?: number } }).response?.status;
  if (status === 404) return 'No se encontró un activo público con este ID.';
  return error instanceof Error ? error.message : 'No se pudo completar la verificación pública.';
}

function explorerAddress(baseUrl: string, address: string) {
  return `${baseUrl.replace(/\/$/, '')}/address/${address}`;
}

/**
 * Verificación pública.
 *
 * Se renderiza fuera de `ProtectedRoute` y fuera de `AppLayout`: un banco tiene
 * que poder abrir este enlace en una ventana de incógnito, sin cuenta y sin
 * pedirle nada a la plataforma. Si necesitara sesión, dejaría de ser una
 * verificación independiente y volvería a ser confianza en el operador.
 */
export default function VerifyPage() {
  const { code = '' } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const assetId = code.trim();
  const validationError = assetId ? validateVerificationAssetId(assetId) : null;
  const [input, setInput] = useState(assetId);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['public-verification', assetId],
    queryFn: () => publicVerificationClient.fetch(assetId),
    enabled: assetId !== '' && validationError === null,
    retry: false,
  });

  useEffect(() => setInput(assetId), [assetId]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = input.trim();
    const error = validateVerificationAssetId(next);
    setSubmitError(error);
    if (!error) navigate(`/verify/${next}`);
  };

  const result = query.data;

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-4 sm:gap-5">
      <PageHeader title={VERIFY_ROUTE.title} subtitle={VERIFY_ROUTE.subtitle}>
        <Badge variant="outline" className="text-[10px] font-normal">
          público · sin login
        </Badge>
      </PageHeader>

      <PanelCard>
        <CardKicker>Consulta pública del activo</CardKicker>
        <form className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={submit}>
          <div className="grid gap-1.5">
            <Label htmlFor="verification-asset-id">Asset ID</Label>
            <Input
              id="verification-asset-id"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="0x… (32 bytes hexadecimales en minúsculas)"
              autoComplete="off"
            />
          </div>
          <Button type="submit">Verificar</Button>
        </form>
        {submitError || validationError ? (
          <p role="alert" className="text-destructive text-sm">
            {submitError ?? validationError}
          </p>
        ) : query.isPending ? (
          <p role="status" className="text-muted-foreground text-sm">
            Consultando el snapshot público de la cadena…
          </p>
        ) : query.isError ? (
          <div className="flex flex-wrap items-center gap-3">
            <p role="alert" className="text-destructive text-sm">
              {errorMessage(query.error)}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
              Reintentar
            </Button>
          </div>
        ) : null}
      </PanelCard>

      {result && !result.supported ? (
        <PanelCard>
          <CardKicker>Verificación no disponible</CardKicker>
          <h2 className="text-lg font-medium">Cadena local en memoria</h2>
          <CardBody>
            Este entorno no ofrece un snapshot de cadena pública verificable de forma independiente.
            No se infieren certificados ni atestaciones.
          </CardBody>
        </PanelCard>
      ) : null}

      {result?.supported ? (
        <>
          <section aria-label="Resumen de la cadena pública" className="grid gap-3 md:grid-cols-3">
            <PanelCard>
              <CardKicker>Red</CardKicker>
              <p className="text-sm font-medium">Arbitrum · chain {result.chainId}</p>
              {result.explorer ? (
                <a
                  className="text-primary text-xs underline-offset-4 hover:underline"
                  href={result.explorer.baseUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir explorador
                </a>
              ) : (
                <p className="text-muted-foreground text-xs">Explorador no configurado</p>
              )}
            </PanelCard>
            <PanelCard>
              <CardKicker>Bloque seguro</CardKicker>
              {result.explorer ? (
                <a
                  className="mono text-primary text-sm underline-offset-4 hover:underline"
                  href={`${result.explorer.baseUrl}/block/${result.safeBlock}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {result.safeBlock}
                </a>
              ) : (
                <p className="mono text-sm">{result.safeBlock}</p>
              )}
            </PanelCard>
            <PanelCard>
              <CardKicker>Estado del activo</CardKicker>
              <p className="text-sm font-medium">{result.registry.status}</p>
              <CardBody>
                Registrado el {new Date(result.registry.registeredAt).toLocaleString()}
              </CardBody>
            </PanelCard>
          </section>

          <PanelCard className="gap-3">
            <div>
              <CardKicker>Registro on-chain</CardKicker>
              <h2 className="text-lg font-medium">Compromiso público</h2>
            </div>
            <dl className="grid gap-3 md:grid-cols-2">
              {[
                ['Asset ID', result.registry.assetId, result.explorer?.registryUrl],
                ['Merkle root', result.registry.merkleRoot, result.explorer?.registryUrl],
                ['Hash del titular', result.registry.ownerIdHash, result.explorer?.registryUrl],
                ['Controlador', result.registry.controller, result.explorer?.controllerUrl],
              ].map(([label, value, href]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-muted-foreground text-xs">{label}</dt>
                  <dd>
                    <HashValue value={value!} leading={18} href={href} />
                  </dd>
                </div>
              ))}
            </dl>
          </PanelCard>

          <section className="grid gap-3 md:grid-cols-2">
            <PanelCard className="gap-3">
              <div>
                <CardKicker>Atestaciones vigentes</CardKicker>
                <h2 className="text-lg font-medium">{result.attestations.length} activas</h2>
              </div>
              {result.attestations.length === 0 ? (
                <CardBody>No se encontraron atestaciones vigentes en el bloque seguro.</CardBody>
              ) : (
                <ul className="grid gap-2">
                  {result.attestations.map((item) => (
                    <li
                      key={`${item.kind}-${item.certifier}`}
                      className="border-border rounded-md border p-3"
                    >
                      <p className="text-sm font-medium">{item.kind}</p>
                      <CardBody>{new Date(item.attestedAt).toLocaleString()}</CardBody>
                      <HashValue
                        value={item.certifier}
                        leading={14}
                        href={
                          result.explorer
                            ? explorerAddress(result.explorer.baseUrl, item.certifier)
                            : undefined
                        }
                      />
                      <HashValue value={item.certificateHash} leading={14} />
                    </li>
                  ))}
                </ul>
              )}
            </PanelCard>

            <PanelCard>
              <CardKicker>Certificado</CardKicker>
              <h2 className="text-lg font-medium">
                {result.certificate.valid ? 'Válido' : 'No válido'}
              </h2>
              <CardBody>Emisiones: {result.certificate.issuanceCount}</CardBody>
              {result.certificate.owner ? (
                <HashValue
                  value={result.certificate.owner}
                  leading={16}
                  href={
                    result.explorer
                      ? explorerAddress(result.explorer.baseUrl, result.certificate.owner)
                      : undefined
                  }
                />
              ) : (
                <CardBody>No existe titular del certificado en este bloque seguro.</CardBody>
              )}
            </PanelCard>
          </section>
        </>
      ) : null}
    </div>
  );
}
