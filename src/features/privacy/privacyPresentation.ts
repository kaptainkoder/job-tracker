import type { PrivacyLogEntry } from '../../shared/types';

export interface PrivacyMetrics {
  totalSpendUsd: number;
  outboundCalls: number;
  egressTargets: number;
}

export function computePrivacyMetrics(entries: readonly PrivacyLogEntry[]): PrivacyMetrics {
  const totalSpendUsd = entries.reduce((total, entry) => total + (entry.cost_usd ?? 0), 0);
  return {
    totalSpendUsd: Math.round(totalSpendUsd * 1_000_000) / 1_000_000,
    outboundCalls: entries.length,
    egressTargets: new Set(entries.map((entry) => entry.target)).size,
  };
}

export function formatPrivacyAction(action: string): string {
  const words = action.trim().replace(/[-_]+/g, ' ');
  return words ? words[0].toUpperCase() + words.slice(1) : 'Unspecified action';
}

export function formatPrivacyCost(costUsd: number | null): string {
  if (costUsd == null) return 'Pending';
  const precision = costUsd > 0 && costUsd < 0.001 ? 6 : 3;
  return `$${costUsd.toFixed(precision)}`;
}

export function shortenPayloadHash(hash: string): string {
  return hash.length > 12 ? `${hash.slice(0, 4)}…${hash.slice(-4)}` : hash;
}
