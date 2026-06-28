import {
  ClipboardPaste,
  LoaderCircle,
  Save,
  Sparkles,
  X,
} from 'lucide-react';
import {
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import type { Application } from '../../shared/types';
import { STAGES, STAGE_LABEL } from '../../shared/domain/stages';
import { parseLeadInput } from '../../shared/domain/parser';
import { supabase } from '../../shared/lib/supabase';
import Button from '../../shared/ui/Button';
import Input from '../../shared/ui/Input';
import { useAuth } from '../auth/AuthProvider';
import {
  EMPTY_APPLICATION_FORM,
  applicationFormToPayload,
  applicationToForm,
  parsedLeadToForm,
  validateApplicationForm,
  type ApplicationFieldErrors,
  type ApplicationFormValues,
} from './applications';

const PRIORITIES: Array<{ value: ApplicationFormValues['priority']; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  children: ReactNode;
}

function SelectField({ label, id, children, ...props }: SelectFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-ink-soft">{label}</label>
      <select {...props} id={id} className="input mt-2">{children}</select>
    </div>
  );
}

interface ApplicationFormProps {
  mode: 'add' | 'edit';
  application?: Application;
  onClose: () => void;
  onSaved: () => void;
}

export default function ApplicationForm({ mode, application, onClose, onSaved }: ApplicationFormProps) {
  const { user } = useAuth();
  const [values, setValues] = useState<ApplicationFormValues>(
    mode === 'edit' && application ? applicationToForm(application) : EMPTY_APPLICATION_FORM,
  );
  const [errors, setErrors] = useState<ApplicationFieldErrors>({});
  const [paste, setPaste] = useState('');
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function update(field: keyof ApplicationFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFormError(null);
  }

  function handleParse() {
    if (!paste.trim()) return;
    const parsed = parsedLeadToForm(parseLeadInput(paste));
    // Keep any field the user already typed; fill the blanks the parser found.
    setValues((current) => ({
      ...current,
      company: current.company || parsed.company,
      role: current.role || parsed.role,
      job_url: current.job_url || parsed.job_url,
      salary_currency: current.salary_currency || parsed.salary_currency,
      stage: parsed.stage,
    }));
    const found = [
      parsed.company && 'company',
      parsed.role && 'role',
      parsed.job_url && 'link',
      parsed.salary_currency && 'currency',
    ].filter(Boolean);
    setPasteNote(
      found.length
        ? `Filled ${found.join(', ')}. Review and complete the rest — blanks stay "unspecified".`
        : 'Nothing could be parsed — fill the details in below.',
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const validation = validateApplicationForm(values);
    setErrors(validation);
    setFormError(null);
    if (Object.keys(validation).length > 0) return;

    setSaving(true);
    const payload = applicationFormToPayload(values);
    const now = new Date().toISOString();

    const result =
      mode === 'edit' && application
        ? await supabase
            .from('applications')
            .update({ ...payload, last_activity_at: now })
            .eq('id', application.id)
        : await supabase
            .from('applications')
            .insert({ ...payload, user_id: user.id, last_activity_at: now });
    setSaving(false);

    if (result.error) {
      setFormError(`Could not save the application. ${result.error.message}`);
      return;
    }
    onSaved();
  }

  return (
    <ModalShell title={mode === 'edit' ? 'Edit application' : 'Add application'} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {mode === 'add' && (
          <div className="rounded-xl border border-dashed border-line bg-surface-2/60 p-4">
            <label htmlFor="paste-input" className="flex items-center gap-1.5 text-xs font-medium text-ink-soft">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              Quick add — paste a JD, recruiter InMail, or a link
            </label>
            <textarea
              id="paste-input"
              value={paste}
              onChange={(event) => setPaste(event.target.value)}
              rows={3}
              placeholder="Paste anything you received. We extract what we can and never invent the rest."
              className="input mt-2 resize-y"
            />
            <div className="mt-2 flex items-center gap-3">
              <Button variant="secondary" onClick={handleParse} disabled={!paste.trim()}>
                <ClipboardPaste className="h-4 w-4" />
                Parse
              </Button>
              {pasteNote && <p className="text-xs text-ink-faint">{pasteNote}</p>}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input autoFocus id="company" label="Company *" value={values.company} onChange={(e) => update('company', e.target.value)} error={errors.company} placeholder="Acme Corp" />
          <Input id="role" label="Role *" value={values.role} onChange={(e) => update('role', e.target.value)} error={errors.role} placeholder="Senior Engineer" />
          <SelectField id="stage" label="Stage" value={values.stage} onChange={(e) => update('stage', e.target.value)}>
            {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
          </SelectField>
          <SelectField id="priority" label="Priority" value={values.priority} onChange={(e) => update('priority', e.target.value)}>
            {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </SelectField>
          <Input id="job-url" label="Job link" type="url" inputMode="url" value={values.job_url} onChange={(e) => update('job_url', e.target.value)} error={errors.job_url} placeholder="https://…" />
          <Input id="job-location" label="Location" value={values.job_location} onChange={(e) => update('job_location', e.target.value)} placeholder="Remote · Berlin · …" />
          <Input id="salary-min" label="Salary min" inputMode="numeric" value={values.salary_min} onChange={(e) => update('salary_min', e.target.value)} error={errors.salary_min} helper="Leave blank if unspecified" />
          <Input id="salary-max" label="Salary max" inputMode="numeric" value={values.salary_max} onChange={(e) => update('salary_max', e.target.value)} error={errors.salary_max} helper="Leave blank if unspecified" />
          <Input id="salary-currency" label="Currency" value={values.salary_currency} onChange={(e) => update('salary_currency', e.target.value)} placeholder="USD · INR · EUR" />
        </div>

        <div>
          <label htmlFor="notes" className="text-xs font-medium text-ink-soft">Notes</label>
          <textarea id="notes" value={values.notes} onChange={(e) => update('notes', e.target.value)} rows={3} placeholder="Anything worth remembering about this one." className="input mt-2 resize-y" />
        </div>

        <div className="flex flex-col gap-3 border-t border-line-soft pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-5" aria-live="polite">
            {formError && <p className="text-sm text-stage-rejected" role="alert">{formError}</p>}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="lg" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="lg" disabled={saving}>
              {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </form>
    </ModalShell>
  );
}

export function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-sm sm:p-8" role="dialog" aria-modal="true" aria-label={title}>
      <div className="card my-auto w-full max-w-2xl p-5 sm:p-6 animate-rise">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-xl p-2 text-ink-faint transition hover:bg-surface-2 hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
