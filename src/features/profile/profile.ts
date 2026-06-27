import type { Profile } from '../../shared/types';

export interface ProfileFormValues {
  full_name: string;
  email: string;
  phone: string;
  current_title: string;
  current_company: string;
  linkedin_url: string;
  github_url: string;
}

export type ProfileFieldErrors = Partial<Record<keyof ProfileFormValues, string>>;

export const EMPTY_PROFILE_FORM: ProfileFormValues = {
  full_name: '',
  email: '',
  phone: '',
  current_title: '',
  current_company: '',
  linkedin_url: '',
  github_url: '',
};

const PROFILE_FIELDS = Object.keys(EMPTY_PROFILE_FORM) as Array<keyof ProfileFormValues>;

export function profileToForm(profile: Profile | null, fallbackEmail = ''): ProfileFormValues {
  if (!profile) return { ...EMPTY_PROFILE_FORM, email: fallbackEmail };

  return PROFILE_FIELDS.reduce<ProfileFormValues>((values, field) => {
    values[field] = profile[field] ?? '';
    return values;
  }, { ...EMPTY_PROFILE_FORM });
}

export function profileFormToPayload(values: ProfileFormValues): Record<keyof ProfileFormValues, string | null> {
  return PROFILE_FIELDS.reduce<Record<keyof ProfileFormValues, string | null>>((payload, field) => {
    const value = values[field].trim();
    payload[field] = value || null;
    return payload;
  }, {} as Record<keyof ProfileFormValues, string | null>);
}

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function validateProfileForm(values: ProfileFormValues): ProfileFieldErrors {
  const errors: ProfileFieldErrors = {};
  const email = values.email.trim();

  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    errors.email = 'Enter a valid email address.';
  }

  const linkedIn = values.linkedin_url.trim();
  if (linkedIn && !isWebUrl(linkedIn)) {
    errors.linkedin_url = 'Enter a complete URL beginning with http:// or https://.';
  }

  const github = values.github_url.trim();
  if (github && !isWebUrl(github)) {
    errors.github_url = 'Enter a complete URL beginning with http:// or https://.';
  }

  return errors;
}

export function baseResumePath(userId: string): string {
  return `${userId}/base-resume.pdf`;
}

export async function validatePdfFile(file: File): Promise<string | null> {
  if (!file.name.toLowerCase().endsWith('.pdf')) return 'Choose a PDF file.';
  if (file.size === 0) return 'The selected PDF is empty.';

  const header = new TextDecoder('ascii').decode(await file.slice(0, 1024).arrayBuffer());
  return header.includes('%PDF-') ? null : 'This file does not appear to be a valid PDF.';
}
