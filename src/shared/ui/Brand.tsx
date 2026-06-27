import { BriefcaseBusiness } from 'lucide-react';

export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2.5 text-ink">
      <span className={`${compact ? 'h-7 w-7 rounded-lg' : 'h-8 w-8 rounded-[9px]'} inline-flex items-center justify-center bg-accent text-white`}>
        <BriefcaseBusiness size={compact ? 15 : 17} strokeWidth={2.2} />
      </span>
      <span className={`${compact ? 'text-[15px]' : 'text-[17px]'} font-semibold tracking-[-0.01em]`}>
        Job Tracker
      </span>
    </div>
  );
}
