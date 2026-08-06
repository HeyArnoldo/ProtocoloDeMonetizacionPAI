import type {
  DisclosurePreviewRequest,
  DisclosurePreviewResponse,
  SamplePortfolio,
} from '@app/contracts';
import { api } from '@/lib/api';

export async function fetchSamplePortfolio(): Promise<SamplePortfolio> {
  const { data } = await api.get<SamplePortfolio>('/disclosure/sample');
  return data;
}

export async function previewDisclosure(
  request: DisclosurePreviewRequest,
): Promise<DisclosurePreviewResponse> {
  const { data } = await api.post<DisclosurePreviewResponse>('/disclosure/preview', request);
  return data;
}
