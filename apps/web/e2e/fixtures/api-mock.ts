import type { Page, Route } from '@playwright/test';
import {
  CURRENCY_CODES,
  UserRole,
  authUserSchema,
  disclosurePreviewResponseSchema,
  persistedDisclosurePreviewRequestSchema,
  publicVerificationSchema,
  samplePortfolioSchema,
  type AssetResponse,
  type AuthConfig,
  type AuthUser,
  type DisclosurePreviewRequest,
  type DisclosurePreviewResponse,
  type EvidenceResponse,
  type PublicVerificationResponse,
  type Receivable,
  type SamplePortfolio,
} from '@app/contracts';
import {
  buildTree,
  hashDebtor,
  hashLeaf,
  serializeMultiProof,
  toDueDate,
  verifyMultiProof,
  type Hex,
  type ReceivableLeaf,
} from '@app/merkle';

/**
 * Intercepción de la API para los tests E2E.
 *
 * En este entorno no hay backend: ni `.env`, ni Postgres, ni `@app/api`. Todo
 * se resuelve con `page.route()`.
 *
 * Dos decisiones gobiernan este archivo:
 *
 * 1. **Nada se inventa.** La cartera reproduce el caso Contafácil SAC de
 *    `apps/api/src/disclosure/disclosure.service.ts`, y el root, el proof y
 *    las hojas divulgadas se calculan aquí con `@app/merkle` — el mismo
 *    paquete que usa el servicio real. Un proof inventado haría pasar tests
 *    contra datos imposibles.
 * 2. **Todo se valida contra los contratos.** Cada respuesta pasa por su
 *    schema Zod de `@app/contracts` antes de salir. Si el contrato cambia, el
 *    mock falla en vez de mentirle al test.
 */

/** El salt real es aleatorio por sesión; el del fixture es fijo para que el root sea reproducible. */
export const SAMPLE_SALT = `0x${'a1b2c3d4'.repeat(8)}` as const;
export const VERIFY_ASSET_ID = `0x${'ab'.repeat(32)}` as const;

export function buildPublicVerification(): PublicVerificationResponse {
  return publicVerificationSchema.parse({
    supported: true,
    network: 'arbitrum',
    chainId: 421614,
    safeBlock: '12345',
    registry: {
      assetId: VERIFY_ASSET_ID,
      merkleRoot: `0x${'cd'.repeat(32)}`,
      ownerIdHash: `0x${'ef'.repeat(32)}`,
      controller: `0x${'12'.repeat(20)}`,
      registeredAt: '2026-08-08T15:00:00.000Z',
      status: 'Attested',
    },
    attestations: [
      {
        kind: 'REVENUE_VERIFIED',
        certifier: `0x${'34'.repeat(20)}`,
        certificateHash: `0x${'56'.repeat(32)}`,
        attestedAt: '2026-08-08T15:01:00.000Z',
      },
    ],
    certificate: {
      supported: true,
      valid: true,
      owner: `0x${'12'.repeat(20)}`,
      issuanceCount: '1',
    },
    explorer: {
      baseUrl: 'https://sepolia.arbiscan.io',
      registryUrl: `https://sepolia.arbiscan.io/address/0x${'78'.repeat(20)}`,
      controllerUrl: `https://sepolia.arbiscan.io/address/0x${'12'.repeat(20)}`,
    },
  });
}

export async function mockPublicVerification(
  page: Page,
  response: PublicVerificationResponse = buildPublicVerification(),
): Promise<void> {
  await page.route('**/api/verification/assets/*', (route) => fulfillJson(route, response));
}

/** Contratos del caso Contafácil SAC, copiados de `DisclosureService.samplePortfolio()`. */
const SAMPLE_CONTRACTS = [
  { taxId: '20512345678', label: 'Supermercados Andinos SAC', monthly: 800_000 },
  { taxId: '20487654321', label: 'Farmacias del Norte SAC', monthly: 1_250_000 },
  { taxId: '20100200300', label: 'Distribuidora Lima Sur EIRL', monthly: 450_000 },
  { taxId: '20655544433', label: 'Municipalidad de Ate', monthly: 620_000 },
];

/** Reproduce la cartera de muestra del servicio: 4 contratos x 4 cuotas. */
export function buildSamplePortfolio(): SamplePortfolio {
  const receivables: Receivable[] = [];

  for (const [contractIndex, contract] of SAMPLE_CONTRACTS.entries()) {
    for (let installment = 0; installment < 4; installment++) {
      const month = String(installment * 3 + 1).padStart(2, '0');
      receivables.push({
        debtorTaxId: contract.taxId,
        debtorLabel: contract.label,
        amountMinor: String(contract.monthly),
        dueDate: `2026-${month}-15`,
        currency: CURRENCY_CODES.USD,
        docHash: `0x${(contractIndex * 4 + installment + 1).toString(16).padStart(64, '0')}`,
      });
    }
  }

  return samplePortfolioSchema.parse({ salt: SAMPLE_SALT, receivables });
}

/** Usuario de sesión por defecto. Valida contra `authUserSchema`. */
export function buildAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return authUserSchema.parse({
    id: '3f6f9c6e-7b1a-4c2f-9d3e-5a8b1c2d4e6f',
    email: 'operador@contafacil.pe',
    name: 'Operador Contafácil',
    avatarUrl: null,
    role: UserRole.USER,
    createdAt: '2026-01-15T09:00:00.000Z',
    ...overrides,
  });
}

export function buildAssetResponse(portfolio = buildSamplePortfolio()): AssetResponse {
  return {
    id: `0x${'1'.repeat(64)}`,
    ownerIdHash: `0x${'2'.repeat(64)}`,
    controller: `0x${'3'.repeat(40)}`,
    merkleRoot: `0x${'4'.repeat(64)}`,
    registrationTxHash: `0x${'5'.repeat(64)}`,
    registrationConfirmed: true,
    registrationBlockNumber: 12_345,
    createdAt: '2026-08-08T15:00:00.000Z',
    receivables: portfolio.receivables.slice(0, 2).map((item, index) => ({
      ...item,
      id: `8fb79494-272c-4be1-8204-885c0bba352${index}`,
      evidenceId: `7fb79494-272c-4be1-8204-885c0bba352${index}`,
      position: 1 - index,
    })),
  };
}

/**
 * Misma conversión que `DisclosureService.toLeaves()`.
 *
 * Se exporta para que un spec pueda alimentar `computeBorrowingBase` con las
 * mismas hojas que el panel deriva de la cartera, y comparar los importes del
 * desglose con los del motor en vez de con números escritos a mano.
 */
export function toLeaves(receivables: Receivable[], salt: Hex): ReceivableLeaf[] {
  return receivables.map((item) => ({
    debtorHash: hashDebtor(item.debtorTaxId, salt),
    amountMinor: BigInt(item.amountMinor),
    dueDate: toDueDate(item.dueDate),
    currency: item.currency,
    docHash: item.docHash as Hex,
  }));
}

/**
 * Calcula la respuesta de `POST /api/disclosure/preview` con Merkle de verdad.
 *
 * Se expone además de usarse en el mock para que un spec pueda predecir el
 * root y afirmar que la UI muestra exactamente ese valor.
 */
export function computeDisclosurePreview(
  request: DisclosurePreviewRequest,
): DisclosurePreviewResponse {
  const leaves = toLeaves(request.receivables, request.salt as Hex);
  const tree = buildTree(leaves);
  const multiProof = tree.multiProof(request.disclosedIndices);
  const serialized = serializeMultiProof(multiProof);

  const nominalByCurrency = new Map<number, bigint>();
  for (const leaf of multiProof.leaves) {
    nominalByCurrency.set(
      leaf.currency,
      (nominalByCurrency.get(leaf.currency) ?? 0n) + leaf.amountMinor,
    );
  }

  return disclosurePreviewResponseSchema.parse({
    root: tree.root,
    totalLeaves: leaves.length,
    disclosedCount: multiProof.leaves.length,
    hiddenCount: leaves.length - multiProof.leaves.length,
    disclosedNominalByCurrency: [...nominalByCurrency].map(([currency, amountMinor]) => ({
      currency,
      amountMinor: amountMinor.toString(),
    })),
    // El `leafHash` no viaja en `serializeMultiProof`: se añade aquí igual que
    // hace el servicio, para que la UI pueda mostrar la hoja.
    disclosedLeaves: serialized.leaves.map((leaf, index) => ({
      ...leaf,
      leafHash: hashLeaf(multiProof.leaves[index]!),
    })),
    proof: serialized.proof,
    proofFlags: serialized.proofFlags,
    verified: verifyMultiProof(tree.root, multiProof),
  });
}

export interface ApiMockOptions {
  /** Flags de `GET /api/auth/config`. Por defecto, login local y Google activos. */
  authConfig?: AuthConfig;
  /** Sesión de `GET /api/auth/me`. `null` responde 401, que es lo que ve un anónimo. */
  user?: AuthUser | null;
  /** Cartera de `GET /api/disclosure/sample`. */
  portfolio?: SamplePortfolio;
  evidence?: EvidenceResponse[];
  evidenceUploadError?: string;
  asset?: AssetResponse;
  assetErrorStatus?: 403 | 404;
}

function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/**
 * Registra todos los interceptores de la API en la página.
 *
 * Llamar antes de `page.goto()`: las queries arrancan en el primer render.
 */
export async function mockApi(page: Page, options: ApiMockOptions = {}): Promise<void> {
  const authConfig: AuthConfig = options.authConfig ?? { localEnabled: true, googleEnabled: true };
  const user = options.user ?? null;
  const portfolio = options.portfolio ?? buildSamplePortfolio();
  const evidence = [...(options.evidence ?? [])];
  const asset = options.asset ?? buildAssetResponse(portfolio);

  await page.route('**/api/auth/config', (route) => fulfillJson(route, authConfig));

  await page.route('**/api/auth/me', (route) =>
    user
      ? fulfillJson(route, user)
      : fulfillJson(route, { statusCode: 401, message: 'Unauthorized' }, 401),
  );

  await page.route('**/api/auth/login', (route) => fulfillJson(route, user ?? buildAuthUser()));

  await page.route('**/api/auth/logout', (route) => fulfillJson(route, {}));

  await page.route('**/api/evidence', (route) => {
    if (route.request().method() === 'GET') return fulfillJson(route, evidence);
    if (options.evidenceUploadError) {
      return fulfillJson(route, { statusCode: 503, message: options.evidenceUploadError }, 503);
    }
    const uploaded: EvidenceResponse = {
      id: '7fb79494-272c-4be1-8204-885c0bba3528',
      originalName: 'factura.xml',
      mimeType: 'application/xml',
      sizeBytes: '18',
      sha256: `0x${'a'.repeat(64)}`,
      createdAt: '2026-08-08T15:00:00.000Z',
    };
    evidence.unshift(uploaded);
    return fulfillJson(route, uploaded, 201);
  });

  await page.route('**/api/assets/*', (route) =>
    options.assetErrorStatus
      ? fulfillJson(route, { statusCode: options.assetErrorStatus }, options.assetErrorStatus)
      : fulfillJson(route, asset),
  );

  await page.route('**/api/disclosure/sample', (route) => fulfillJson(route, portfolio));

  await page.route('**/api/disclosure/*/preview', (route) => {
    // El request se valida con el mismo schema que usaría el controller: si la
    // UI manda algo fuera de contrato, el test lo ve como 400 y no como éxito.
    const parsed = persistedDisclosurePreviewRequestSchema.safeParse(
      JSON.parse(route.request().postData() ?? '{}'),
    );

    if (!parsed.success) {
      return fulfillJson(route, { statusCode: 400, message: parsed.error.message }, 400);
    }

    try {
      return fulfillJson(
        route,
        computeDisclosurePreview({
          salt: portfolio.salt,
          receivables: portfolio.receivables,
          disclosedIndices: parsed.data.disclosedIndices,
        }),
      );
    } catch (error) {
      // Los errores de `@app/merkle` son de dominio: el servicio real los
      // traduce a 400 con el mensaje original.
      return fulfillJson(route, { statusCode: 400, message: (error as Error).message }, 400);
    }
  });
}
