import type { UserSettings } from '../../shared/types';

// The default model is the locked Wave-B choice; users can swap it in Settings.
export const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-6';

export interface ModelOption {
  value: string; // OpenRouter model slug
  label: string; // sentence-case display label (SKILL.md: sentence case, no shouting)
  note: string; // calm one-line tradeoff helper
}

// Curated, near-monochrome model list. Slugs are validated against OpenRouter for real when
// B3 wires live tailoring; for B0 the choice is only stored. Default sits first.
export const MODEL_OPTIONS: ModelOption[] = [
  { value: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6', note: 'Default · balanced quality and cost' },
  { value: 'anthropic/claude-opus-4-8', label: 'Claude Opus 4.8', note: 'Highest quality · higher cost' },
  { value: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5', note: 'Fastest · lowest cost' },
  { value: 'openai/gpt-5.1', label: 'GPT-5.1', note: 'Alternative provider' },
];

export function isKnownModel(value: string): boolean {
  return MODEL_OPTIONS.some((option) => option.value === value);
}

export function modelLabel(value: string): string {
  return MODEL_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export interface UserSettingsFormValues {
  model: string;
  no_log: boolean;
}

export const DEFAULT_SETTINGS_FORM: UserSettingsFormValues = {
  model: DEFAULT_MODEL,
  no_log: true,
};

// Hydrate the form from a loaded row, falling back to safe defaults (no stored row yet, or
// an unknown/blank model slug) — never surfaces an empty model picker.
export function settingsToForm(settings: UserSettings | null): UserSettingsFormValues {
  if (!settings) return { ...DEFAULT_SETTINGS_FORM };
  return {
    model: isKnownModel(settings.model) ? settings.model : DEFAULT_MODEL,
    no_log: settings.no_log,
  };
}

// Build the owner-scoped upsert payload. Unknown models normalise to the default so a stale
// or hand-edited slug can never persist.
export function settingsFormToPayload(
  userId: string,
  values: UserSettingsFormValues,
): Pick<UserSettings, 'user_id' | 'model' | 'no_log'> {
  return {
    user_id: userId,
    model: isKnownModel(values.model) ? values.model : DEFAULT_MODEL,
    no_log: values.no_log,
  };
}
