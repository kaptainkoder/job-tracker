// Lead-capture parser (seed for Wave B). Takes anything pasted/forwarded — a full JD,
// a partial recruiter InMail, a post snippet, or just a link + a line — and extracts
// what it can. Whatever isn't clearly present stays null so the UI shows "unspecified"
// rather than a guess. Pure/env-neutral: no DOM, no network, no browser globals.
import type { Stage } from '../types';

export interface ParsedLead {
  raw: string;
  company: string | null;
  role: string | null;
  job_url: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  /** Suggested starting stage: a bare link/blurb is a 'lead'; a fuller JD is 'applied'-ready. */
  suggestedStage: Stage;
}

const URL_RE = /\bhttps?:\/\/[^\s)>\]]+/i;
// Match "$120,000", "₹15 LPA", "120k–150k", "USD 90000". Conservative on purpose:
// we'd rather miss a salary (→ "unspecified") than invent one.
const SALARY_RE = /(?:(\$|₹|€|£|USD|INR|EUR|GBP)\s?)?(\d{1,3}(?:[,.]\d{3})+|\d+\s?(?:k|lpa|lakh))/i;

const CURRENCY_MAP: Record<string, string> = {
  $: 'USD', '₹': 'INR', '€': 'EUR', '£': 'GBP',
  usd: 'USD', inr: 'INR', eur: 'EUR', gbp: 'GBP',
};

function pickLine(text: string, re: RegExp): string | null {
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(re);
    if (m) return (m[1] ?? line).trim();
  }
  return null;
}

export function parseLeadInput(input: string): ParsedLead {
  const raw = input.trim();
  const lead: ParsedLead = {
    raw,
    company: null,
    role: null,
    job_url: null,
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    suggestedStage: 'lead',
  };
  if (!raw) return lead;

  const url = raw.match(URL_RE);
  if (url) lead.job_url = url[0];

  // "Role at Company" or "Company — Role" patterns on any line.
  lead.role = pickLine(raw, /^(.*?)\s+(?:at|@)\s+.+$/i);
  const company = pickLine(raw, /^.*?\s+(?:at|@)\s+(.+)$/i);
  if (company) lead.company = company.replace(URL_RE, '').trim() || null;

  const sal = raw.match(SALARY_RE);
  if (sal) {
    const cur = (sal[1] ?? '').toLowerCase();
    lead.salary_currency = CURRENCY_MAP[cur] ?? (sal[1] ? sal[1].toUpperCase() : null);
  }

  // A longer paste with role + company reads like a real JD → ready to apply.
  if (raw.length > 400 && lead.role && lead.company) lead.suggestedStage = 'applied';

  return lead;
}
