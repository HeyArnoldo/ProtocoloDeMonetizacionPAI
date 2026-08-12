import {
  AssetNotFoundError,
  AssetStatus,
  AttestationKind,
  InvalidChainTransitionError,
  type Address,
  type AssetId,
  type Hex,
  type RegisterAssetInput,
} from '../chain.port';
import { InMemoryChainAdapter } from './in-memory.adapter';

const ASSET_ID = `0x${'11'.repeat(32)}` as AssetId;
const MERKLE_ROOT = `0x${'22'.repeat(32)}` as Hex;
const OWNER_ID_HASH = `0x${'33'.repeat(32)}` as Hex;
const CONTROLLER = `0x${'44'.repeat(20)}` as Address;
const CERTIFICATE_HASH = `0x${'55'.repeat(32)}` as Hex;
const ACCOUNTANT = `0x${'aa'.repeat(20)}` as Address;
const LAWYER = `0x${'bb'.repeat(20)}` as Address;

function registration(overrides: Partial<RegisterAssetInput> = {}): RegisterAssetInput {
  return {
    assetId: ASSET_ID,
    merkleRoot: MERKLE_ROOT,
    ownerIdHash: OWNER_ID_HASH,
    controller: CONTROLLER,
    ...overrides,
  };
}

describe('InMemoryChainAdapter', () => {
  let chain: InMemoryChainAdapter;

  beforeEach(() => {
    chain = new InMemoryChainAdapter();
  });

  describe('registerAsset', () => {
    it('deja el expediente en Registered', async () => {
      await chain.registerAsset(registration());

      const asset = await chain.getAsset(ASSET_ID);
      expect(asset?.status).toBe(AssetStatus.Registered);
      expect(asset?.merkleRoot).toBe(MERKLE_ROOT);
      expect(asset?.attestations).toEqual([]);
    });

    it('devuelve una referencia de transaccion', async () => {
      const tx = await chain.registerAsset(registration());
      expect(tx.hash).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('rechaza registrar dos veces el mismo assetId', async () => {
      await chain.registerAsset(registration());
      await expect(chain.registerAsset(registration())).rejects.toThrow(
        InvalidChainTransitionError,
      );
    });

    it('expedientes distintos conviven', async () => {
      const otherId = `0x${'99'.repeat(32)}` as AssetId;
      await chain.registerAsset(registration());
      await chain.registerAsset(registration({ assetId: otherId }));

      expect(await chain.getAsset(ASSET_ID)).not.toBeNull();
      expect(await chain.getAsset(otherId)).not.toBeNull();
    });
  });

  describe('getAsset', () => {
    it('devuelve null si el expediente no existe', async () => {
      expect(await chain.getAsset(ASSET_ID)).toBeNull();
    });

    it('no entrega una referencia mutable del estado interno', async () => {
      // Si devolviera la referencia viva, un caller podria mutar el "on-chain"
      // desde fuera. La cadena real no permite eso y el fake tampoco debe.
      await chain.registerAsset(registration());

      const asset = await chain.getAsset(ASSET_ID);
      asset!.status = AssetStatus.Funded;
      asset!.attestations.push({
        kind: AttestationKind.RevenueVerified,
        certifier: ACCOUNTANT,
        certificateHash: CERTIFICATE_HASH,
        attestedAt: new Date(),
        revokedAt: null,
      });

      const fresh = await chain.getAsset(ASSET_ID);
      expect(fresh?.status).toBe(AssetStatus.Registered);
      expect(fresh?.attestations).toEqual([]);
    });
  });

  describe('attest', () => {
    beforeEach(async () => {
      await chain.registerAsset(registration());
    });

    it('mueve el expediente a Attested', async () => {
      await chain.attest({
        assetId: ASSET_ID,
        kind: AttestationKind.RevenueVerified,
        certifier: ACCOUNTANT,
        certificateHash: CERTIFICATE_HASH,
      });

      const asset = await chain.getAsset(ASSET_ID);
      expect(asset?.status).toBe(AssetStatus.Attested);
      expect(asset?.attestations).toHaveLength(1);
      expect(asset?.attestations[0]?.revokedAt).toBeNull();
    });

    it('acumula atestaciones de certificadores distintos', async () => {
      // Ninguno ve todo: esa separacion es lo que hace creible el resultado.
      await chain.attest({
        assetId: ASSET_ID,
        kind: AttestationKind.RevenueVerified,
        certifier: ACCOUNTANT,
        certificateHash: CERTIFICATE_HASH,
      });
      await chain.attest({
        assetId: ASSET_ID,
        kind: AttestationKind.RightsAssignable,
        certifier: LAWYER,
        certificateHash: CERTIFICATE_HASH,
      });

      const asset = await chain.getAsset(ASSET_ID);
      expect(asset?.attestations).toHaveLength(2);
    });

    it('rechaza atestar un expediente inexistente', async () => {
      await expect(
        chain.attest({
          assetId: `0x${'ee'.repeat(32)}` as AssetId,
          kind: AttestationKind.RevenueVerified,
          certifier: ACCOUNTANT,
          certificateHash: CERTIFICATE_HASH,
        }),
      ).rejects.toThrow(AssetNotFoundError);
    });

    it('rechaza dos atestaciones vigentes del mismo tipo y certificador', async () => {
      const input = {
        assetId: ASSET_ID,
        kind: AttestationKind.RevenueVerified,
        certifier: ACCOUNTANT,
        certificateHash: CERTIFICATE_HASH,
      };
      await chain.attest(input);
      await expect(chain.attest(input)).rejects.toThrow(InvalidChainTransitionError);
    });
  });

  describe('revokeAttestation', () => {
    beforeEach(async () => {
      await chain.registerAsset(registration());
      await chain.attest({
        assetId: ASSET_ID,
        kind: AttestationKind.RevenueVerified,
        certifier: ACCOUNTANT,
        certificateHash: CERTIFICATE_HASH,
      });
    });

    it('marca la atestacion como revocada sin borrarla', async () => {
      // El historial no se borra: la revocacion tambien es evidencia.
      await chain.revokeAttestation({
        assetId: ASSET_ID,
        kind: AttestationKind.RevenueVerified,
        certifier: ACCOUNTANT,
      });

      const asset = await chain.getAsset(ASSET_ID);
      expect(asset?.attestations).toHaveLength(1);
      expect(asset?.attestations[0]?.revokedAt).toBeInstanceOf(Date);
    });

    it('devuelve el expediente a Registered si no queda ninguna vigente', async () => {
      await chain.revokeAttestation({
        assetId: ASSET_ID,
        kind: AttestationKind.RevenueVerified,
        certifier: ACCOUNTANT,
      });

      expect((await chain.getAsset(ASSET_ID))?.status).toBe(AssetStatus.Registered);
    });

    it('lo deja en Attested si todavia queda alguna vigente', async () => {
      await chain.attest({
        assetId: ASSET_ID,
        kind: AttestationKind.RightsAssignable,
        certifier: LAWYER,
        certificateHash: CERTIFICATE_HASH,
      });

      await chain.revokeAttestation({
        assetId: ASSET_ID,
        kind: AttestationKind.RevenueVerified,
        certifier: ACCOUNTANT,
      });

      expect((await chain.getAsset(ASSET_ID))?.status).toBe(AssetStatus.Attested);
    });

    it('rechaza revocar una atestacion que no existe', async () => {
      await expect(
        chain.revokeAttestation({
          assetId: ASSET_ID,
          kind: AttestationKind.ServiceContinuity,
          certifier: ACCOUNTANT,
        }),
      ).rejects.toThrow(InvalidChainTransitionError);
    });

    it('rechaza revocar dos veces la misma atestacion', async () => {
      const input = {
        assetId: ASSET_ID,
        kind: AttestationKind.RevenueVerified,
        certifier: ACCOUNTANT,
      };
      await chain.revokeAttestation(input);
      await expect(chain.revokeAttestation(input)).rejects.toThrow(InvalidChainTransitionError);
    });
  });

  describe('computeBorrowingBase', () => {
    it('falla explicitamente en vez de inventar un numero', async () => {
      // El fake NO simula logica de negocio. Si devolviera un monto plausible,
      // el dia que el motor Stylus calcule otro nadie sabria cual esta mal.
      await chain.registerAsset(registration());

      await expect(
        chain.computeBorrowingBase({
          assetId: ASSET_ID,
          disclosure: { leaves: [], proof: [], proofFlags: [] },
        }),
      ).rejects.toThrow(/BorrowingBaseEngine/);
    });
  });

  describe('getCode', () => {
    it('falla explicitamente en vez de fingir un despliegue o negarlo', async () => {
      // Sin cadena no hay bytecode que leer. Devolver algo parecido a codigo
      // seria inventar un despliegue; devolver null afirmaria "confirmado que
      // ahi no hay nada", y tampoco es cierto: no hay red donde confirmarlo.
      // La unica respuesta honesta es no responder.
      await expect(chain.getCode(CONTROLLER)).rejects.toThrow(/adapter en memoria/i);
    });
  });

  describe('hashes sinteticos', () => {
    it('son distintos entre transacciones', async () => {
      const first = await chain.registerAsset(registration());
      const second = await chain.registerAsset(
        registration({ assetId: `0x${'99'.repeat(32)}` as AssetId }),
      );
      expect(first.hash).not.toBe(second.hash);
    });

    it('se distinguen a simple vista de un hash real', async () => {
      // Un hash sintetico que parece real puede terminar mostrandose en la UI
      // como si fuera una tx de Arbiscan. Este no engana a nadie.
      const tx = await chain.registerAsset(registration());
      expect(tx.hash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(tx.hash.startsWith('0xfa4e')).toBe(true);
    });
  });
});
