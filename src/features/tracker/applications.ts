// Application domain contract for the dashboard (A4). Pure / env-neutral: no DOM, no
// network, no browser globals — imported by the UI and exercised directly by tests.
// Salary is nullable on purpose: absent salary renders "unspecified", never a guess.
import type { Application, Priority, SalaryPeriod, Stage } from '../../shared/types';
import type { ParsedLead } from '../../shared/domain/parser';
import { STAGES, isStale } from '../../shared/domain/stages';

export const SALARY_UNSPECIFIED = 'unspecified';

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$',
  INR: '₹',
  EUR: '€',
  GBP: '£',
};

const PERIOD_SUFFIX: Record<SalaryPeriod, string> = {
  year: '/yr',
  month: '/mo',
  hour: '/hr',
};

// Group thousands without locale surprises in the bundled node test runner.
function groupThousands(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatAmount(value: number, currency: string | null): string {
  const symbol = currency ? CURRENCY_SYMBOL[currency] : undefined;
  const grouped = groupThousands(Math.round(value));
  if (symbol) return `${symbol}${grouped}`;
  if (currency) return `${currency} ${grouped}`;
  return grouped;
}

/**
 * Human salary string from the nullable salary columns. Renders exactly
 * "unspecified" whenever no min and no max are present — never invents a number.
 */
export function formatSalary(
  app: Pick<Application, 'salary_min' | 'salary_max' | 'salary_currency' | 'salary_period'>,
): string {
  const { salary_min, salary_max, salary_currency, salary_period } = app;
  if (salary_min == null && salary_max == null) return SALARY_UNSPECIFIED;

  const suffix = salary_period ? PERIOD_SUFFIX[salary_period] : '';
  let core: string;
  if (salary_min != null && salary_max != null) {
    core =
      salary_min === salary_max
        ? formatAmount(salary_min, salary_currency)
        : `${formatAmount(salary_min, salary_currency)}–${formatAmount(salary_max, salary_currency)}`;
  } else if (salary_min != null) {
    core = `${formatAmount(salary_min, salary_currency)}+`;
  } else {
    core = `up to ${formatAmount(salary_max as number, salary_currency)}`;
  }
  return `${core}${suffix}`;
}

const DAY_MS = 1000 * 60 * 60 * 24;

/** Compact relative time for last-activity, e.g. "just now", "today", "2d ago", "3w ago". */
export function formatRelativeActivity(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return SALARY_UNSPECIFIED;
  const days = Math.floor((now.getTime() - then) / DAY_MS);
  if (days <= 0) {
    const hours = Math.floor((now.getTime() - then) / (1000 * 60 * 60));
    if (hours <= 0) return 'just now';
    return 'today';
  }
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export interface StageGroup {
  stage: Stage;
  apps: Application[];
}

/**
 * Group applications into the fixed pipeline order. Within a stage, most recently
 * active first. Always returns one group per stage (possibly empty) so the board
 * renders every column consistently.
 */
export function groupByStage(apps: Application[]): StageGroup[] {
  const byStage = new Map<Stage, Application[]>(STAGES.map((s) => [s, []]));
  for (const app of apps) {
    (byStage.get(app.stage) ?? byStage.set(app.stage, []).get(app.stage)!).push(app);
  }
  return STAGES.map((stage) => ({
    stage,
    apps: (byStage.get(stage) ?? []).sort(
      (a, b) => new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime(),
    ),
  }));
}

/** Count of active applications that have gone stale (drives the "needs follow-up" badge). */
export function countStale(apps: Application[], now: Date = new Date()): number {
  return apps.filter((app) => isStale(app.stage, app.last_activity_at, now)).length;
}

// --- Dashboard metrics (the 4 StatCards above the board) ---------------------

// A card counts as "submitted" once it has been applied or moved past it (incl. rejected).
const SUBMITTED_STAGES: Stage[] = ['applied', 'interviewing', 'offer', 'rejected'];
// A submitted card counts as "responded" if it advanced to an interview or an offer.
const RESPONDED_STAGES: Stage[] = ['interviewing', 'offer'];

export interface BoardMetrics {
  total: number;
  interviewing: number;
  offers: number;
  /**
   * Response rate = responded ÷ submitted, where submitted = applied-or-later and
   * responded = interviewing/offer. Null (renders "—") until at least one app is
   * submitted, so an empty board never shows a fabricated 0%.
   */
  responseRate: number | null;
}

export function computeMetrics(apps: Application[]): BoardMetrics {
  const interviewing = apps.filter((a) => a.stage === 'interviewing').length;
  const offers = apps.filter((a) => a.stage === 'offer').length;
  const submitted = apps.filter((a) => SUBMITTED_STAGES.includes(a.stage)).length;
  const responded = apps.filter((a) => RESPONDED_STAGES.includes(a.stage)).length;
  return {
    total: apps.length,
    interviewing,
    offers,
    responseRate: submitted === 0 ? null : responded / submitted,
  };
}

/** Whole-percent string for the response-rate StatCard; "—" when undefined. */
export function formatResponseRate(rate: number | null): string {
  return rate == null ? '—' : `${Math.round(rate * 100)}%`;
}

// --- Add/edit form -----------------------------------------------------------

export interface ApplicationFormValues {
  company: string;
  role: string;
  stage: Stage;
  priority: Priority;
  job_url: string;
  jd_text: string;
  job_location: string;
  salary_min: string;
  salary_max: string;
  salary_currency: string;
  notes: string;
}

export type ApplicationFieldErrors = Partial<Record<keyof ApplicationFormValues, string>>;

export const EMPTY_APPLICATION_FORM: ApplicationFormValues = {
  company: '',
  role: '',
  stage: 'lead',
  priority: 'medium',
  job_url: '',
  jd_text: '',
  job_location: '',
  salary_min: '',
  salary_max: '',
  salary_currency: '',
  notes: '',
};

export function applicationToForm(app: Application): ApplicationFormValues {
  return {
    company: app.company,
    role: app.role,
    stage: app.stage,
    priority: app.priority,
    job_url: app.job_url ?? '',
    jd_text: app.jd_text ?? '',
    job_location: app.job_location ?? '',
    salary_min: app.salary_min == null ? '' : String(app.salary_min),
    salary_max: app.salary_max == null ? '' : String(app.salary_max),
    salary_currency: app.salary_currency ?? '',
    notes: app.notes ?? '',
  };
}

/** Map a parsed lead into add-form values; whatever the parser couldn't find stays blank. */
export function parsedLeadToForm(parsed: ParsedLead): ApplicationFormValues {
  return {
    ...EMPTY_APPLICATION_FORM,
    company: parsed.company ?? '',
    role: parsed.role ?? '',
    stage: parsed.suggestedStage,
    job_url: parsed.job_url ?? '',
    salary_min: parsed.salary_min == null ? '' : String(parsed.salary_min),
    salary_max: parsed.salary_max == null ? '' : String(parsed.salary_max),
    salary_currency: parsed.salary_currency ?? '',
  };
}

function parseNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function validateApplicationForm(values: ApplicationFormValues): ApplicationFieldErrors {
  const errors: ApplicationFieldErrors = {};
  if (!values.company.trim()) errors.company = 'Company is required.';
  if (!values.role.trim()) errors.role = 'Role is required.';

  const url = values.job_url.trim();
  if (url && !isWebUrl(url)) {
    errors.job_url = 'Enter a complete URL beginning with http:// or https://.';
  }

  const min = values.salary_min.trim();
  if (min && parseNumber(min) == null) errors.salary_min = 'Enter a number.';
  const max = values.salary_max.trim();
  if (max && parseNumber(max) == null) errors.salary_max = 'Enter a number.';

  const minN = parseNumber(min);
  const maxN = parseNumber(max);
  if (minN != null && maxN != null && minN > maxN) {
    errors.salary_max = 'Maximum must be at least the minimum.';
  }

  return errors;
}

export type ApplicationPayload = Pick<
  Application,
  | 'company'
  | 'role'
  | 'stage'
  | 'priority'
  | 'job_url'
  | 'jd_text'
  | 'job_location'
  | 'salary_min'
  | 'salary_max'
  | 'salary_currency'
  | 'notes'
>;

/** Build the insert/update payload: required text trimmed, optional blanks → null. */
export function applicationFormToPayload(values: ApplicationFormValues): ApplicationPayload {
  const min = parseNumber(values.salary_min);
  const max = parseNumber(values.salary_max);
  return {
    company: values.company.trim(),
    role: values.role.trim(),
    stage: values.stage,
    priority: values.priority,
    job_url: values.job_url.trim() || null,
    jd_text: values.jd_text.trim() || null,
    job_location: values.job_location.trim() || null,
    salary_min: min,
    salary_max: max,
    // A currency with no amounts would render oddly; only keep it when there's a number.
    salary_currency: min == null && max == null ? null : values.salary_currency.trim() || null,
    notes: values.notes.trim() || null,
  };
}

export interface StageChangePatch {
  stage: Stage;
  last_activity_at: string;
  date_applied?: string;
}

// Reaching any of these implies the application has been submitted.
const APPLIED_OR_LATER: Stage[] = ['applied', 'interviewing', 'offer'];

/**
 * Patch for a stage change: always bumps last_activity_at; sets date_applied the first
 * time an app reaches 'applied' (or a later in-pipeline stage), never overwriting an
 * existing date_applied.
 */
export function applyStageChange(
  app: Pick<Application, 'date_applied'>,
  nextStage: Stage,
  now: Date = new Date(),
): StageChangePatch {
  const patch: StageChangePatch = {
    stage: nextStage,
    last_activity_at: now.toISOString(),
  };
  if (APPLIED_OR_LATER.includes(nextStage) && !app.date_applied) {
    patch.date_applied = now.toISOString().slice(0, 10);
  }
  return patch;
}
