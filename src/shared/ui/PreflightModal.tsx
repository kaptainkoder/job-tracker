import { useEffect } from 'react';
import { LoaderCircle, ShieldCheck } from 'lucide-react';
import Badge from './Badge';
import Button from './Button';
import { PRIVACY_CATEGORY_LABEL, type PrivacyManifest } from '../domain/privacy';

// Pre-flight approve-before-send gate (Wave B · B1). No external call leaves until the owner
// approves this dialog. It lists, in plain English, exactly what WILL be sent and — explicitly —
// what will NOT. Cancelling sends nothing (zero egress). Built from the canonical primitives
// (near-monochrome, one accent, two manifest eyebrows) ahead of the dedicated Claude Design pass.

export interface PreflightModalProps {
  open: boolean;
  /** Plain-English target, e.g. "OpenRouter". */
  targetLabel: string;
  /** Plain-English action, e.g. "Ping the model". */
  actionLabel: string;
  manifest: PrivacyManifest;
  busy?: boolean;
  onApprove: () => void;
  onCancel: () => void;
}

export default function PreflightModal({
  open,
  targetLabel,
  actionLabel,
  manifest,
  busy = false,
  onApprove,
  onCancel,
}: PreflightModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={() => !busy && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="preflight-title"
        className="card animate-rise w-full max-w-md overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-line-soft px-5 py-4">
          <span className="rounded-xl bg-accent-soft p-2 text-accent"><ShieldCheck className="h-5 w-5" /></span>
          <div>
            <h2 id="preflight-title" className="font-semibold text-ink">Approve before sending</h2>
            <p className="mt-0.5 text-sm text-ink-soft">
              {actionLabel} sends a request to {targetLabel}. Review what leaves your device.
            </p>
          </div>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <Badge tone="eyebrow">Sent</Badge>
            {manifest.sent.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm text-ink">
                {manifest.sent.map((category) => (
                  <li key={category}>{PRIVACY_CATEGORY_LABEL[category]}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-ink-soft">
                Nothing from your profile — only a short test message.
              </p>
            )}
          </div>
          <div>
            <Badge tone="eyebrow">Not sent</Badge>
            <ul className="mt-2 space-y-1 text-sm text-ink-soft">
              {manifest.withheld.map((category) => (
                <li key={category}>{PRIVACY_CATEGORY_LABEL[category]}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line-soft bg-surface-2/50 px-5 py-4">
          <Button variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button>
          <Button autoFocus disabled={busy} onClick={onApprove}>
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {busy ? 'Sending…' : 'Approve & send'}
          </Button>
        </div>
      </div>
    </div>
  );
}
