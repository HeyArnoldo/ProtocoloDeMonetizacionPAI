import type { Page, Route } from '@playwright/test';
import {
  CURRENCY_CODES,
  UserRole,
  authUserSchema,
  chainAssetSnapshotSchema,
  chainStatusSchema,
  disclosurePreviewResponseSchema,
  persistedDisclosurePreviewRequestSchema,
  publicVerificationSchema,
  samplePortfolioSchema,
  type AssetReceivableResponse,
  type AssetResponse,
  type AuthConfig,
  type AuthUser,
  type ChainAssetSnapshotResponse,
  type ChainStatusResponse,
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
 * 1. **Nada se inventa.** La cartera reproduce el caso Contafácil SAC, y el
 *    root, el proof y las hojas divulgadas se calculan aquí con `@app/merkle`
 *    — el mismo paquete que usa `DisclosureService`. Un proof inventado haría
 *    pasar tests contra datos imposibles.
 * 2. **Todo se valida contra los contratos.** Cada respuesta pasa por su
 *    schema Zod de `@app/contracts` antes de salir. Si el contrato cambia, el
 *    mock falla en vez de mentirle al test.
 */

/** El salt real es aleatorio por sesión; el del fixture es fijo para que el root sea reproducible. */
export const SAMPLE_SALT = `0x${'a1b2c3d4'.repeat(8)}` as const;
export const VERIFY_ASSET_ID = `0x${'ab'.repeat(32)}` as const;

/**
 * Expediente de la demo.
 *
 * `/divulgacion` y `/expediente` ya no cargan una cartera de muestra: exigen el
 * identificador del expediente en la query. Es la única constante desde la que
 * los specs construyen esa URL, para que el `assetId` que pide la pantalla y el
 * que sirve el mock no puedan divergir.
 */
export const DEMO_ASSET_ID = `0x${'1d'.repeat(32)}` as const;

export const MOCK_WALLET_ACCOUNT = `0x${'42'.repeat(20)}`;
export const MOCK_TX_HASH = `0x${'ee'.repeat(32)}`;

/** Proveedor EIP-1193 mínimo para ejercitar la conexión sin una extensión real. */
export async function mockInjectedWallet(page: Page): Promise<void> {
  await page.addInitScript(
    ({ account, MOCK_TX_HASH }) => {
      const listeners = new Map<string, Set<(value?: unknown) => void>>();
      let accounts: string[] = [];
      let chainId = '0x1';
      const calls: string[] = [];

      const emit = (event: string, value?: unknown) => {
        listeners.get(event)?.forEach((listener) => listener(value));
      };

      Object.defineProperty(window, 'ethereum', {
        configurable: true,
        value: {
          async request({ method }: { method: string }) {
            calls.push(method);
            if (method === 'eth_accounts') return accounts;
            if (method === 'eth_chainId') return chainId;
            if (method === 'eth_requestAccounts') {
              accounts = [account];
              emit('accountsChanged', accounts);
              return accounts;
            }
            if (method === 'wallet_switchEthereumChain') {
              chainId = '0x66eee';
              emit('chainChanged', chainId);
              return null;
            }
            // Firmar es parte del recorrido de registro y de préstamo: sin esto
            // el proveedor simulado corta justo donde empieza lo interesante.
            if (method === 'eth_sendTransaction') return MOCK_TX_HASH;
            throw new Error(`Unexpected wallet method: ${method}`);
          },
          on(event: string, listener: (value?: unknown) => void) {
            const eventListeners = listeners.get(event) ?? new Set();
            eventListeners.add(listener);
            listeners.set(event, eventListeners);
          },
          removeListener(event: string, listener: (value?: unknown) => void) {
            listeners.get(event)?.delete(listener);
          },
        },
      });
      Object.defineProperty(window, '__walletCalls', { value: calls });
    },
    { account: MOCK_WALLET_ACCOUNT, MOCK_TX_HASH },
  );
}

/**
 * Instantánea de cadena del expediente, para `/assets/:id/chain` y
 * `/assets/:id/certification-chain`.
 *
 * Es lo que alimenta el timeline operativo: sin `registry` no hay etapa de
 * registro que pintar, y sin `certificate`/`loan` el timeline se queda a medias.
 */
export function buildChainSnapshot(): ChainAssetSnapshotResponse {
  return chainAssetSnapshotSchema.parse({
    blockNumber: '296600000',
    registry: {
      assetId: DEMO_ASSET_ID,
      merkleRoot: `0x${'cd'.repeat(32)}`,
      ownerIdHash: `0x${'ef'.repeat(32)}`,
      controller: `0x${'12'.repeat(20)}`,
      registeredAt: '2026-08-08T15:00:00.000Z',
      status: 'Attested',
    },
    attestations: [],
    certificate: { supported: true, valid: false, owner: null, issuanceCount: '0' },
    loan: { supported: true, value: null },
  });
}

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

/**
 * Cuotas persistidas del expediente, tal como las devuelve `GET /api/assets/:id`.
 *
 * El orden del array es el que ve `/divulgacion`: los índices que la pantalla
 * manda en `disclosedIndices` son posiciones de esta lista, no del campo
 * `position` —que solo ordena la vista del expediente—.
 */
export function buildAssetReceivables(
  portfolio = buildSamplePortfolio(),
): AssetReceivableResponse[] {
  return portfolio.receivables.map((item, index) => {
    const suffix = String(index).padStart(2, '0');
    return {
      ...item,
      id: `8fb79494-272c-4be1-8204-885c0bba35${suffix}`,
      evidenceId: `7fb79494-272c-4be1-8204-885c0bba35${suffix}`,
      position: index,
    };
  });
}

/**
 * Expediente persistido.
 *
 * El `merkleRoot` **se calcula** con `@app/merkle` sobre estas mismas cuotas, no
 * se escribe a mano: es el valor que `/divulgacion` enseña como root del
 * expediente y contra el que compara el root que devuelve el servidor al
 * construir la prueba. Un root inventado dejaría esa comparación sin sentido.
 */
export function buildAssetResponse(receivables = buildAssetReceivables()): AssetResponse {
  return {
    id: DEMO_ASSET_ID,
    ownerIdHash: `0x${'2'.repeat(64)}`,
    controller: `0x${'3'.repeat(40)}`,
    merkleRoot: buildTree(toLeaves(receivables, SAMPLE_SALT)).root,
    registrationTxHash: `0x${'5'.repeat(64)}`,
    registrationConfirmed: true,
    registrationBlockNumber: 12_345,
    createdAt: '2026-08-08T15:00:00.000Z',
    receivables,
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
 * Calcula la respuesta de `POST /api/disclosure/:assetId/preview` con Merkle de verdad.
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

/**
 * Estado de cadena por defecto: vivo, con el despliegue canónico de
 * `chain/deployments/421614.json`. Los bloques son fijos a propósito — un
 * número que cambia entre corridas rompería cualquier captura de pantalla.
 */
export function buildChainStatus(
  overrides: Partial<Extract<ChainStatusResponse, { status: 'live' }>> = {},
): ChainStatusResponse {
  const explorerBaseUrl = 'https://sepolia.arbiscan.io';
  const addresses = {
    assetRegistry: '0xb2A15c6BD8c1A409F79a09e46C7Ce047eD6ad7d7',
    certificationAttestor: '0x4008B0e6295A8Bdc9FC12e72b9436197A0FfC1CF',
    paiCertificate: '0x94861a2352646697225F8F921B8Dd3C58A30A56b',
    borrowingBaseEngine: '0xA5b4245bc29567a9742A2327192746166b0118F1',
    collateralVault: '0x7E2552151a04DB4C8D97AaBdE9E2B2d82263cd67',
    mockUsdc: '0x9F16274EDec38f3217fAbE83Dc13dE59Becfe4f1',
  } as const;

  return chainStatusSchema.parse({
    status: 'live',
    network: 'arbitrum',
    chainId: 421614,
    safeBlock: '297262745',
    headBlock: '297265110',
    deploymentBlock: '297286907',
    explorerBaseUrl,
    // Los seis con bytecode: el despliegue sano. Los casos degradados se piden
    // por `overrides.contracts`, no cambiando este default.
    contracts: Object.entries(addresses).map(([name, address]) => ({
      name,
      address,
      explorerUrl: `${explorerBaseUrl}/address/${address}`,
      bytecode: 'present',
    })),
    ...overrides,
  });
}

/**
 * Cadena configurada contra Arbitrum con el RPC caído.
 *
 * Es el estado que no puede pintarse como conectado: los contratos siguen
 * configurados, pero ninguna lectura los confirma contra la red. Se deriva de
 * `buildChainStatus()` para que ambos estados compartan el mismo despliegue.
 */
export function buildUnreachableChainStatus(reason = 'RPC_UNAVAILABLE'): ChainStatusResponse {
  const live = buildChainStatus();
  return chainStatusSchema.parse({
    status: 'unreachable',
    network: 'arbitrum',
    chainId: 421614,
    deploymentBlock: '297286907',
    contracts: live.status === 'live' ? live.contracts : [],
    explorerBaseUrl: 'https://sepolia.arbiscan.io',
    reason,
  });
}

export interface ApiMockOptions {
  /** Flags de `GET /api/auth/config`. Por defecto, login local y Google activos. */
  authConfig?: AuthConfig;
  /** Sesión de `GET /api/auth/me`. `null` responde 401, que es lo que ve un anónimo. */
  user?: AuthUser | null;
  /** Datos de las cuotas del expediente por defecto. Ignorado si se pasa `asset`. */
  portfolio?: SamplePortfolio;
  evidence?: EvidenceResponse[];
  evidenceUploadError?: string;
  asset?: AssetResponse;
  assetErrorStatus?: 403 | 404;
  /** Estado de `GET /api/chain/status`. Por defecto, la cadena responde viva. */
  chainStatus?: ChainStatusResponse;
  /** Expediente que devuelve `POST /api/assets`. */
  createdAsset?: AssetResponse;
  createAssetError?: string;
  confirmRegistrationError?: string;
}

/** Expediente recién creado: sin confirmar, que es como nace. */
export function buildCreatedAsset(overrides: Partial<AssetResponse> = {}): AssetResponse {
  return {
    id: DEMO_ASSET_ID,
    ownerIdHash: `0x${'ef'.repeat(32)}`,
    controller: MOCK_WALLET_ACCOUNT.toLowerCase(),
    merkleRoot: `0x${'cd'.repeat(32)}`,
    registrationTxHash: null,
    registrationConfirmed: false,
    registrationBlockNumber: null,
    receivables: [],
    createdAt: '2026-08-12T00:00:00.000Z',
    ...overrides,
  };
}

function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function fulfillChainStatus(route: Route, status: ChainStatusResponse): Promise<void> {
  return route.fulfill({ status: 200, json: chainStatusSchema.parse(status) });
}

/**
 * Registra todos los interceptores de la API en la página.
 *
 * Llamar antes de `page.goto()`: las queries arrancan en el primer render.
 */
export async function mockApi(page: Page, options: ApiMockOptions = {}): Promise<void> {
  const authConfig: AuthConfig = options.authConfig ?? { localEnabled: true, googleEnabled: true };
  const user = options.user ?? null;
  const evidence = [...(options.evidence ?? [])];
  const asset = options.asset ?? buildAssetResponse(buildAssetReceivables(options.portfolio));

  // Recorrido de creación del expediente: crear -> intent -> confirmar.
  // Se sirven antes que `**/api/assets/*` para que la ruta comodín no se los
  // trague: Playwright resuelve por orden de registro.
  const createdAsset = options.createdAsset ?? buildCreatedAsset();
  await page.route('**/api/assets/*/registration-intent', (route) =>
    fulfillJson(route, {
      chainId: 421614,
      to: `0x${'11'.repeat(20)}`,
      data: `0x${'ab'.repeat(4)}`,
      value: '0',
    }),
  );
  await page.route('**/api/assets/*/confirm-registration', (route) =>
    options.confirmRegistrationError
      ? fulfillJson(route, { statusCode: 409, message: options.confirmRegistrationError }, 409)
      : fulfillJson(route, { ...createdAsset, registrationConfirmed: true }),
  );
  await page.route('**/api/assets', (route) =>
    route.request().method() === 'POST'
      ? options.createAssetError
        ? fulfillJson(route, { statusCode: 400, message: options.createAssetError }, 400)
        : fulfillJson(route, createdAsset, 201)
      : fulfillJson(route, createdAsset),
  );

  // La instantánea de cadena del expediente vive en dos sub-recursos y no en la
  // ruta comodín: `**/api/assets/*` no cruza la barra, así que ampliarla a
  // `**/api/assets/**` se tragaría los endpoints de creación de arriba.
  await page.route('**/api/assets/*/chain', (route) => fulfillJson(route, buildChainSnapshot()));
  await page.route('**/api/assets/*/certification-chain', (route) =>
    fulfillJson(route, buildChainSnapshot()),
  );

  await page.route('**/api/chain/status', (route) =>
    fulfillChainStatus(route, options.chainStatus ?? buildChainStatus()),
  );

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

  // `GET /api/disclosure/sample` ya no existe: la cartera de muestra fija
  // desapareció y toda pantalla trabaja sobre el expediente persistido.

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
      // El árbol se construye sobre las cuotas del expediente que sirve
      // `GET /api/assets/:id`, que son las que la pantalla enseña. Derivarlo de
      // otra lista devolvería un root que no es el del expediente.
      return fulfillJson(
        route,
        computeDisclosurePreview({
          salt: SAMPLE_SALT,
          receivables: asset.receivables,
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
