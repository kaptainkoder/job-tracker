import type { Stage } from '../types';
import { STAGE_DOT, STAGE_LABEL, STAGE_PILL } from '../domain/stages';

// Canonical StagePill (Claude Design). Stage hue appears ONLY as an 8px dot or a ~15% tint
// pill — never a large fill. `dotOnly` renders the dot + label without the tint background
// (used as a Kanban column header); the default renders the tinted pill.
export default function StagePill({
  stage,
  dotOnly = false,
  count,
  className = '',
}: {
  stage: Stage;
  dotOnly?: boolean;
  count?: number;
  className?: string;
}) {
  if (dotOnly) {
    return (
      <span className={`inline-flex items-center gap-2 text-xs font-semibold text-ink-soft ${className}`.trim()}>
        <span className={`h-2 w-2 rounded-full ${STAGE_DOT[stage]}`} />
        {STAGE_LABEL[stage]}
        {count != null && <span className="font-medium text-ink-faint">{count}</span>}
      </span>
    );
  }
  return (
    <span className={`pill ${STAGE_PILL[stage]} ${className}`.trim()}>
      <span className={`h-2 w-2 rounded-full ${STAGE_DOT[stage]}`} />
      {STAGE_LABEL[stage]}
      {count != null && <span className="text-ink-faint">{count}</span>}
    </span>
  );
}
