import type { Messages } from '@/i18n/core/types';
import type { CertOrg, CertTrack, Certification } from '@/lib/types';

const ORG_LABEL: Record<CertOrg, string> = { csia: 'CSIA', casi: 'CASI' };

export function trackLabel(track: CertTrack, t: Messages): string {
  if (track === 'park') return t.profile.trackPark;
  if (track === 'carving') return t.profile.trackCarving;
  return t.profile.trackRegular;
}

export function certificationLabel(
  cert: Pick<Certification, 'org' | 'track' | 'level' | 'isPartial'>,
  t: Messages,
): string {
  const parts = [ORG_LABEL[cert.org]];
  if (cert.track !== 'regular') parts.push(trackLabel(cert.track, t));
  parts.push(`${t.profile.level} ${cert.level}`);
  if (cert.track === 'regular' && cert.isPartial) parts.push(t.profile.partial);
  return parts.join(' ');
}
