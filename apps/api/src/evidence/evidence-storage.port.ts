export interface PutEvidenceObject {
  key: string;
  body: Buffer;
  contentType: string;
  sha256: string;
}

export interface EvidenceStorage {
  put(input: PutEvidenceObject): Promise<void>;
}

export const EVIDENCE_STORAGE = Symbol('EVIDENCE_STORAGE');
