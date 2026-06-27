import { ArrowRight, BriefcaseBusiness, CheckCircle2, FileText, LockKeyhole, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import Brand from '../../shared/ui/Brand';
import ThemeToggle from '../../shared/ui/ThemeToggle';
import { useAuth } from '../auth/AuthProvider';

const PREVIEW_COLUMNS = [
  { label: 'Lead', count: 2, color: 'bg-stage-lead', cards: ['Acme · Product Ops', 'Orbit · Strategy'] },
  { label: 'Applied', count: 1, color: 'bg-stage-applied', cards: ['Linear · BizOps'] },
  { label: 'Interviewing', count: 1, color: 'bg-stage-interviewing', cards: ['Stripe · Backend'] },
  { label: 'Offer', count: 0, color: 'bg-stage-offer', cards: [] },
  { label: 'Rejected', count: 1, color: 'bg-stage-rejected', cards: ['Northstar · PM'] },
];

const FEATURES = [
  { Icon: BriefcaseBusiness, title: 'Track the pipeline', text: 'Every lead and application, with stage, priority, last activity, and the next honest action.' },
  { Icon: FileText, title: 'Tailor per role', text: 'Turn a job description into a truthful resume and cover letter without inventing missing experience.' },
  { Icon: Sparkles, title: 'Prep the night before', text: 'Open one place for company memory cards, likely questions, and a role-specific preparation plan.' },
];

export default function LandingPage() {
  const { status } = useAuth();
  const trackerHref = status === 'authenticated' ? '/tracker' : '/sign-in?next=%2Ftracker';

  return (
    <div className="min-h-screen bg-canvas">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-7">
        <Brand compact />
        <nav className="flex items-center gap-1 sm:gap-4" aria-label="Landing navigation">
          <a href="#how-it-works" className="hidden text-sm text-ink-soft transition hover:text-ink sm:block">How it works</a>
          <a href="#privacy" className="hidden text-sm text-ink-soft transition hover:text-ink sm:block">Privacy</a>
          <ThemeToggle />
          <Link to={status === 'authenticated' ? '/tracker' : '/sign-in'} className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-strong">
            {status === 'authenticated' ? 'Open app' : 'Sign in'}
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-5 pb-10 pt-14 text-center sm:px-7 sm:pt-20">
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs text-ink-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-stage-offer" /> Private · your data, your API key
          </div>
          <h1 className="mx-auto mt-7 max-w-3xl text-[2.65rem] font-semibold leading-[1.06] tracking-[-0.035em] text-ink sm:text-[3.25rem]">
            Run your whole job search<br className="hidden sm:block" /> from one quiet place.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-ink-soft sm:text-lg">
            Stop juggling a spreadsheet, ChatGPT, and five tabs. Track every application, then build a tailored kit and night-before prep — without inventing anything.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to={trackerHref} className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white shadow-card transition hover:bg-accent-strong">
              Open the tracker <ArrowRight className="h-4 w-4" />
            </Link>
            {status !== 'authenticated' && (
              <Link to="/sign-in" className="rounded-xl border border-line bg-surface px-5 py-3 text-sm font-medium text-ink transition hover:bg-surface-2">
                Sign in with email
              </Link>
            )}
          </div>
          <p className="mt-4 text-xs text-ink-faint">No fabricated skills. No auto-apply. Salary says “unspecified” when it’s unknown.</p>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-7 sm:px-7" aria-label="Tracker preview">
          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-panel">
            <div className="flex items-center gap-1.5 border-b border-line px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-line" /><span className="h-2.5 w-2.5 rounded-full bg-line" /><span className="h-2.5 w-2.5 rounded-full bg-line" />
              <span className="ml-2 text-xs text-ink-faint">tracker — board</span>
            </div>
            <div className="grid min-w-[760px] grid-cols-5 gap-2.5 bg-canvas p-4">
              {PREVIEW_COLUMNS.map((column) => (
                <div key={column.label} className="min-h-32 rounded-xl bg-surface-2 p-2.5">
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-ink-soft">
                    <span className={`h-1.5 w-1.5 rounded-full ${column.color}`} /> {column.label}
                    <span className="ml-auto font-medium text-ink-faint">{column.count}</span>
                  </div>
                  <div className="space-y-2">
                    {column.cards.map((card) => <div key={card} className="rounded-lg border border-line bg-surface p-2 text-left text-[10px] font-medium text-ink shadow-card">{card}</div>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto grid max-w-5xl gap-4 px-5 py-16 sm:grid-cols-3 sm:px-7">
          {FEATURES.map(({ Icon, title, text }) => (
            <article key={title} className="rounded-2xl border border-line bg-surface p-6">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent"><Icon className="h-4.5 w-4.5" /></span>
              <h2 className="mt-4 font-semibold tracking-[-0.01em]">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-ink-soft">{text}</p>
            </article>
          ))}
        </section>

        <section id="privacy" className="mx-auto max-w-5xl px-5 pb-20 sm:px-7">
          <div className="flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-line bg-surface-2 p-7 sm:p-8">
            <div className="max-w-xl">
              <div className="flex items-center gap-2"><LockKeyhole className="h-5 w-5 text-accent" /><h2 className="text-xl font-semibold tracking-[-0.01em]">Privacy you can actually see.</h2></div>
              <p className="mt-2 text-sm leading-6 text-ink-soft">Every call to an outside service is logged: what categories left, what was withheld, and the cost. Two egress targets, ever. Your key, your data.</p>
              <div className="mt-4 flex flex-wrap gap-3 text-xs text-ink-soft"><span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-stage-offer" /> RLS on every row</span><span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-stage-offer" /> Passwordless login</span></div>
            </div>
            <Link to={trackerHref} className="rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white transition hover:bg-accent-strong">See it in the app</Link>
          </div>
          <p className="mt-11 text-center text-xs text-ink-faint">Job Tracker — a personal tool. Built for one job search, honestly.</p>
        </section>
      </main>
    </div>
  );
}
