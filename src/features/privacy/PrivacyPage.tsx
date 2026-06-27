// Placeholder — the outbound-call log (every call to OpenRouter / EnhanceCV, with a
// plain-English manifest of what was sent + withheld) is chunk A5; it stays empty until
// Wave B actually makes those calls.
export default function PrivacyPage() {
  return (
    <div className="animate-rise space-y-4">
      <h1 className="text-2xl font-semibold text-ink">Privacy</h1>
      <div className="card max-w-md p-4 text-sm text-ink-soft">
        Every call this app makes to a third party (OpenRouter, EnhanceCV) is logged here with
        exactly what data was sent, what was withheld, and the cost. Nothing has left your data yet.
      </div>
    </div>
  );
}
