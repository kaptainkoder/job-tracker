import { CircleAlert, GitBranch, ShieldCheck } from 'lucide-react';
import Badge from '../../shared/ui/Badge';
import type {
  EvidenceStrength,
  FitBand,
  FitResult,
  JdSkillClassification,
} from '../../shared/domain/fit';

// Band → the existing stage palette (good / attention / weak). Reuses canonical stage tokens so the
// fit signal reads with the same colour language as the board, no new hues invented.
const BAND_CLASS: Record<FitBand, string> = {
  High: 'bg-stage-offer/15 text-stage-offer',
  Medium: 'bg-stage-interviewing/15 text-stage-interviewing',
  Low: 'bg-stage-rejected/15 text-stage-rejected',
};

// Evidence strength → chip tint. Direct = solid green, inferable = accent, unconfirmed = quiet.
const EVIDENCE_CLASS: Record<EvidenceStrength, string> = {
  direct: 'bg-stage-offer/12 text-stage-offer border-stage-offer/30',
  inferable: 'bg-accent-soft text-accent border-accent/30',
  unconfirmed: 'bg-surface-2 text-ink-faint border-line',
};

const EVIDENCE_LABEL: Record<EvidenceStrength, string> = {
  direct: 'evidenced',
  inferable: 'inferable',
  unconfirmed: 'not evidenced',
};

function SkillChip({ c }: { c: JdSkillClassification }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${EVIDENCE_CLASS[c.evidence]}`}
      title={`${c.requirement} · ${EVIDENCE_LABEL[c.evidence]}`}
    >
      <span className="font-medium">{c.label}</span>
      <span className="text-2xs uppercase tracking-wide opacity-70">{EVIDENCE_LABEL[c.evidence]}</span>
    </span>
  );
}

// G4: explainable profile-fit, shown beside a captured job. No ATS percentage — a High/Medium/Low
// band + confidence, backed by transparent counts and per-skill classification. A missing required
// skill lowers the band but the job is always shown.
export default function FitPanel({ fit }: { fit: FitResult }) {
  const required = fit.classifications.filter((c) => c.requirement === 'required');
  const preferred = fit.classifications.filter((c) => c.requirement === 'preferred');
  const unclear = fit.classifications.filter((c) => c.requirement === 'unclear');

  return (
    <section aria-labelledby="fit-heading" className="rounded-xl border border-line-soft bg-surface-2/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-accent" />
          <h4 id="fit-heading" className="text-sm font-semibold text-ink">Profile fit</h4>
        </div>
        <div className="flex items-center gap-2">
          <span className={`pill ${BAND_CLASS[fit.band]}`}>{fit.band} fit</span>
          <Badge tone="neutral">{fit.confidence} confidence</Badge>
        </div>
      </div>

      <p className="text-sm text-ink-soft">{fit.summary}</p>

      {required.length > 0 && (
        <div className="mt-3">
          <Badge tone="eyebrow">Required</Badge>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {required.map((c) => <SkillChip key={c.skill} c={c} />)}
          </div>
        </div>
      )}

      {preferred.length > 0 && (
        <div className="mt-3">
          <Badge tone="eyebrow">Preferred</Badge>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {preferred.map((c) => <SkillChip key={c.skill} c={c} />)}
          </div>
        </div>
      )}

      {unclear.length > 0 && (
        <div className="mt-3">
          <Badge tone="eyebrow">Mentioned (unclear)</Badge>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {unclear.map((c) => <SkillChip key={c.skill} c={c} />)}
          </div>
        </div>
      )}

      {fit.bridges.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <Badge tone="eyebrow">Bridge opportunities</Badge>
          <ul className="space-y-1">
            {fit.bridges.map((b) => (
              <li key={b.skill} className="flex items-start gap-2 text-xs text-ink-soft">
                <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                <span>{b.note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {fit.notes.length > 0 && (
        <ul className="mt-3 space-y-1">
          {fit.notes.map((n, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-ink-faint">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{n}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 border-t border-line-soft pt-2 text-2xs text-ink-faint">
        Explained from your confirmed résumé skills — not an ATS match score. Nothing here is invented.
      </p>
    </section>
  );
}
