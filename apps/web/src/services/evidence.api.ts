import type { EvidenceResponse } from '@app/contracts';
import { api } from '@/lib/api';

export async function fetchEvidence(): Promise<EvidenceResponse[]> {
  return (await api.get<EvidenceResponse[]>('/evidence')).data;
}

export async function uploadEvidence(file: File): Promise<EvidenceResponse> {
  const form = new FormData();
  form.append('file', file);
  // Do not set Content-Type manually; Axios adds the multipart boundary.
  return (await api.post<EvidenceResponse>('/evidence', form)).data;
}
