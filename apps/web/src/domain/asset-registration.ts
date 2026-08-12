import type { AssetResponse, CreateAssetInput } from '@app/contracts';
import type { TransactionIntent, TransactionSubmitter } from '@/services/transaction-intent';

export type AssetRegistrationStep =
  | 'idle'
  | 'creating'
  | 'signing'
  | 'confirming'
  | 'confirmed'
  | 'error';

export interface AssetRegistrationState {
  readonly step: AssetRegistrationStep;
  /** Sobrevive a los errores: el expediente ya existe en Postgres. */
  readonly assetId: string | null;
  readonly hash: string | null;
  readonly asset: AssetResponse | null;
  readonly error: Error | null;
}

export const INITIAL_REGISTRATION: AssetRegistrationState = {
  step: 'idle',
  assetId: null,
  hash: null,
  asset: null,
  error: null,
};

export interface AssetRegistrationClient {
  create(input: CreateAssetInput): Promise<AssetResponse>;
  registrationIntent(assetId: string): Promise<TransactionIntent>;
  confirmRegistration(assetId: string): Promise<AssetResponse>;
}

/**
 * Los tres pasos del registro, en orden y sin saltarse ninguno.
 *
 * 1. `create` persiste el expediente y calcula el `merkleRoot` en el servidor.
 * 2. La wallet firma el intent que la API construye **desde lo persistido**.
 * 3. `confirmRegistration` compara lo escrito on-chain contra el borrador.
 *
 * El paso 3 no es decorativo: es lo que impide marcar como registrado un
 * expediente cuya transacción escribió otro root. Cuando la cadena y Postgres
 * discrepan, gana la cadena y la confirmación falla.
 *
 * `resumeAssetId` permite reintentar tras una firma rechazada sin volver a
 * crear: `create` es idempotente por `creationKey`, pero pedirlo de nuevo con
 * un borrador editado crearía un segundo expediente en silencio.
 */
export async function runAssetRegistration(
  client: AssetRegistrationClient,
  submitter: TransactionSubmitter,
  input: CreateAssetInput,
  update: (state: AssetRegistrationState) => void,
  resumeAssetId?: string,
): Promise<AssetResponse> {
  let assetId: string | null = resumeAssetId ?? null;
  let hash: string | null = null;

  try {
    if (!assetId) {
      update({ ...INITIAL_REGISTRATION, step: 'creating' });
      assetId = (await client.create(input)).id;
    }

    update({ ...INITIAL_REGISTRATION, step: 'signing', assetId });
    const intent = await client.registrationIntent(assetId);
    hash = await submitter.submit(intent);

    update({ ...INITIAL_REGISTRATION, step: 'confirming', assetId, hash });
    const asset = await client.confirmRegistration(assetId);

    update({ step: 'confirmed', assetId, hash, asset, error: null });
    return asset;
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error('El registro del expediente falló.');
    update({ step: 'error', assetId, hash, asset: null, error });
    throw error;
  }
}
