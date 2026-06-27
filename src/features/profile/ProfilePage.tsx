import {
  BriefcaseBusiness,
  CheckCircle2,
  Download,
  FileText,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Save,
  Upload,
  UserRound,
} from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type InputHTMLAttributes } from 'react';
import type { Profile } from '../../shared/types';
import { supabase } from '../../shared/lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import {
  EMPTY_PROFILE_FORM,
  baseResumePath,
  profileFormToPayload,
  profileToForm,
  validatePdfFile,
  validateProfileForm,
  type ProfileFieldErrors,
  type ProfileFormValues,
} from './profile';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

function FormField({ label, error, id, ...props }: FormFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-ink-soft">{label}</label>
      <input
        {...props}
        id={id}
        className={`input mt-2 ${error ? 'border-stage-rejected focus:border-stage-rejected focus-visible:ring-stage-rejected' : ''}`}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
      />
      {error && <span id={errorId} className="mt-1.5 block text-xs text-stage-rejected">{error}</span>}
    </div>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [values, setValues] = useState<ProfileFormValues>(EMPTY_PROFILE_FORM);
  const [fieldErrors, setFieldErrors] = useState<ProfileFieldErrors>({});
  const [resumePath, setResumePath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [resumeSuccess, setResumeSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    setLoadError(null);

    void supabase
      .from('profile')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setLoadError(error.message);
        } else {
          const profile = data as Profile | null;
          setValues(profileToForm(profile, user.email ?? ''));
          setResumePath(profile?.resume_path ?? null);
        }
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reloadKey, user]);

  function updateField(field: keyof ProfileFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setFormError(null);
    setFormSuccess(null);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    const errors = validateProfileForm(values);
    setFieldErrors(errors);
    setFormError(null);
    setFormSuccess(null);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    const { data, error } = await supabase
      .from('profile')
      .upsert({ id: user.id, ...profileFormToPayload(values) }, { onConflict: 'id' })
      .select('*')
      .single();
    setSaving(false);

    if (error) {
      setFormError(`Could not save your profile. ${error.message}`);
      return;
    }

    const profile = data as Profile;
    setValues(profileToForm(profile, user.email ?? ''));
    setResumePath(profile.resume_path);
    setFormSuccess('Profile saved.');
  }

  async function handleResumeSelection(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || !user) return;

    setResumeError(null);
    setResumeSuccess(null);
    const validationError = await validatePdfFile(file);
    if (validationError) {
      setResumeError(validationError);
      input.value = '';
      return;
    }

    setUploading(true);
    const path = baseResumePath(user.id);
    const { error: uploadError } = await supabase.storage
      .from('resumes')
      .upload(path, file, { cacheControl: '3600', contentType: 'application/pdf', upsert: true });

    if (uploadError) {
      setResumeError(`Could not upload the resume. ${uploadError.message}`);
      setUploading(false);
      input.value = '';
      return;
    }

    const { error: profileError } = await supabase
      .from('profile')
      .upsert({ id: user.id, resume_path: path }, { onConflict: 'id' });
    setUploading(false);
    input.value = '';

    if (profileError) {
      setResumeError(`The PDF uploaded, but the profile link could not be saved. Retry the upload. ${profileError.message}`);
      return;
    }

    setResumePath(path);
    setResumeSuccess(resumePath ? 'Base resume replaced.' : 'Base resume uploaded.');
  }

  async function handleDownload() {
    if (!resumePath) return;
    setDownloading(true);
    setResumeError(null);
    setResumeSuccess(null);

    const { data, error } = await supabase.storage.from('resumes').download(resumePath);
    setDownloading(false);
    if (error) {
      setResumeError(`Could not download the resume. ${error.message}`);
      return;
    }

    const objectUrl = URL.createObjectURL(data);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = 'base-resume.pdf';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    setResumeSuccess('Resume downloaded.');
  }

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center" role="status">
        <LoaderCircle className="h-6 w-6 animate-spin text-accent" />
        <span className="sr-only">Loading profile</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <section className="card max-w-xl p-6" role="alert">
        <h1 className="text-xl font-semibold text-ink">We couldn’t load your profile</h1>
        <p className="mt-2 text-sm text-stage-rejected">{loadError}</p>
        <button type="button" onClick={() => setReloadKey((key) => key + 1)} className="mt-5 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-strong">
          Try again
        </button>
      </section>
    );
  }

  return (
    <div className="animate-rise space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Your source of truth</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">Profile</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-soft">
          Keep your core details and base resume here. Tailoring will use this profile without inventing missing experience.
        </p>
      </div>

      <form onSubmit={handleSave} noValidate className="card overflow-hidden">
        <div className="flex items-start gap-3 border-b border-line-soft px-5 py-4 sm:px-6">
          <span className="rounded-xl bg-accent-soft p-2 text-accent"><UserRound className="h-5 w-5" /></span>
          <div>
            <h2 className="font-semibold text-ink">Personal details</h2>
            <p className="mt-0.5 text-sm text-ink-soft">Contact details used in applications and generated documents.</p>
          </div>
        </div>
        <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
          <FormField id="full-name" label="Full name" autoComplete="name" value={values.full_name} onChange={(event) => updateField('full_name', event.target.value)} placeholder="Karan Sharma" />
          <FormField id="email" label="Email" type="email" autoComplete="email" value={values.email} onChange={(event) => updateField('email', event.target.value)} error={fieldErrors.email} placeholder="you@example.com" />
          <FormField id="phone" label="Phone" type="tel" autoComplete="tel" value={values.phone} onChange={(event) => updateField('phone', event.target.value)} placeholder="+91 …" />
        </div>

        <div className="flex items-start gap-3 border-y border-line-soft px-5 py-4 sm:px-6">
          <span className="rounded-xl bg-surface-2 p-2 text-ink-soft"><BriefcaseBusiness className="h-5 w-5" /></span>
          <div>
            <h2 className="font-semibold text-ink">Current role</h2>
            <p className="mt-0.5 text-sm text-ink-soft">Your present title and company, if applicable.</p>
          </div>
        </div>
        <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
          <FormField id="current-title" label="Current title" autoComplete="organization-title" value={values.current_title} onChange={(event) => updateField('current_title', event.target.value)} placeholder="Product Manager" />
          <FormField id="current-company" label="Current company" autoComplete="organization" value={values.current_company} onChange={(event) => updateField('current_company', event.target.value)} placeholder="Company name" />
        </div>

        <div className="flex items-start gap-3 border-y border-line-soft px-5 py-4 sm:px-6">
          <span className="rounded-xl bg-surface-2 p-2 text-ink-soft"><Link2 className="h-5 w-5" /></span>
          <div>
            <h2 className="font-semibold text-ink">Professional links</h2>
            <p className="mt-0.5 text-sm text-ink-soft">Complete links beginning with https://.</p>
          </div>
        </div>
        <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
          <FormField id="linkedin-url" label="LinkedIn URL" type="url" inputMode="url" value={values.linkedin_url} onChange={(event) => updateField('linkedin_url', event.target.value)} error={fieldErrors.linkedin_url} placeholder="https://linkedin.com/in/…" />
          <FormField id="github-url" label="GitHub URL" type="url" inputMode="url" value={values.github_url} onChange={(event) => updateField('github_url', event.target.value)} error={fieldErrors.github_url} placeholder="https://github.com/…" />
        </div>

        <div className="flex flex-col gap-3 border-t border-line-soft bg-surface-2/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="min-h-5" aria-live="polite">
            {formError && <p className="text-sm text-stage-rejected" role="alert">{formError}</p>}
            {formSuccess && <p className="flex items-center gap-1.5 text-sm text-stage-offer"><CheckCircle2 className="h-4 w-4" />{formSuccess}</p>}
          </div>
          <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white shadow-card transition hover:bg-accent-strong disabled:cursor-wait disabled:opacity-60">
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>

      <section className="card p-5 sm:p-6" aria-labelledby="resume-heading">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <span className="h-fit rounded-xl bg-accent-soft p-2 text-accent"><FileText className="h-5 w-5" /></span>
            <div>
              <h2 id="resume-heading" className="font-semibold text-ink">Base resume</h2>
              <p className="mt-1 max-w-xl text-sm leading-6 text-ink-soft">Upload the truthful master PDF that future job-specific versions will start from.</p>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-faint"><LockKeyhole className="h-3.5 w-3.5" />Private storage · PDF only</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {resumePath && (
              <button type="button" disabled={downloading || uploading} onClick={handleDownload} className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm font-medium text-ink-soft transition hover:bg-surface-2 hover:text-ink disabled:cursor-wait disabled:opacity-60">
                {downloading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download
              </button>
            )}
            <button type="button" disabled={uploading} onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-strong disabled:cursor-wait disabled:opacity-60">
              {uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? 'Uploading…' : resumePath ? 'Replace PDF' : 'Upload PDF'}
            </button>
            <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" onChange={handleResumeSelection} className="sr-only" aria-label="Choose base resume PDF" />
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-line-soft bg-surface-2 px-4 py-3">
          {resumePath ? (
            <div className="flex items-center gap-2 text-sm text-ink"><CheckCircle2 className="h-4 w-4 text-stage-offer" /><span>base-resume.pdf is securely stored.</span></div>
          ) : (
            <p className="text-sm text-ink-faint">No base resume uploaded yet.</p>
          )}
        </div>
        <div className="mt-3 min-h-5" aria-live="polite">
          {resumeError && <p className="text-sm text-stage-rejected" role="alert">{resumeError}</p>}
          {resumeSuccess && <p className="flex items-center gap-1.5 text-sm text-stage-offer"><CheckCircle2 className="h-4 w-4" />{resumeSuccess}</p>}
        </div>
      </section>
    </div>
  );
}
