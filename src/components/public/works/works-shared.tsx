import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BellRing,
  BrainCircuit,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  Database,
  ExternalLink,
  FileCheck2,
  Gauge,
  LockKeyhole,
  Megaphone,
  MessageSquare,
  Plug,
  RefreshCw,
  ScrollText,
  Settings2,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import {
  useCaseItems,
  worksPlan,
  type WorksIconName,
  type WorksIntegrationName,
} from '@/components/public/works-content';
import {
  createWorksCta,
  type WorksCtaLink,
} from '@/components/public/works-links';
import { WorksIntegrationIcon } from '@/components/public/works-integration-icon';
import { cn } from '@/lib/utils';

export const consultCta = createWorksCta('無料相談をする');
export const heroCta = createWorksCta('まずは無料で相談する');

export const iconMap: Record<WorksIconName, LucideIcon> = {
  calendar: CalendarDays,
  message: MessageSquare,
  megaphone: Megaphone,
  brief: BellRing,
  workflow: Workflow,
  shield: ShieldCheck,
  plug: Plug,
  gauge: Gauge,
  clipboard: ClipboardCheck,
  users: Users,
  database: Database,
  file: FileCheck2,
  settings: Settings2,
  brain: BrainCircuit,
  lock: LockKeyhole,
  refresh: RefreshCw,
  audit: ScrollText,
  clock: Clock3,
  store: Store,
  building: Building2,
  sparkles: Sparkles,
  money: CircleDollarSign,
};

export function CtaAnchor({
  cta,
  variant = 'copper',
  className,
}: {
  cta: WorksCtaLink;
  variant?: 'copper' | 'dark' | 'light' | 'outline';
  className?: string;
}) {
  return (
    <a
      href={cta.href}
      target={cta.external ? '_blank' : undefined}
      rel={cta.external ? 'noreferrer' : undefined}
      className={cn(
        'inline-flex min-h-12 items-center justify-center gap-2 rounded-[8px] px-6 py-3 text-[14px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        variant === 'copper' &&
          'bg-[#C88755] text-white hover:bg-[#b97646] focus-visible:ring-[#E3A36F]',
        variant === 'dark' &&
          'bg-[#26363B] text-white hover:bg-[#18262A] focus-visible:ring-[#C88755]',
        variant === 'light' &&
          'bg-white text-[#26363B] hover:bg-[#F4EFE7] focus-visible:ring-[#C88755]',
        variant === 'outline' &&
          'border border-current/25 bg-transparent text-current hover:bg-current/5 focus-visible:ring-[#C88755]',
        className
      )}
    >
      {cta.label}
      {cta.external ? (
        <ExternalLink className='h-4 w-4' aria-hidden='true' />
      ) : (
        <ArrowRight className='h-4 w-4' aria-hidden='true' />
      )}
    </a>
  );
}

export function Eyebrow({
  children,
  inverted = false,
}: {
  children: ReactNode;
  inverted?: boolean;
}) {
  return (
    <p
      className={cn(
        'font-mono text-[11px] font-bold uppercase tracking-[0.22em]',
        inverted ? 'text-[#E3A36F]' : 'text-[#B66F3E]'
      )}
    >
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  inverted = false,
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  inverted?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('max-w-3xl space-y-4', className)}>
      <Eyebrow inverted={inverted}>{eyebrow}</Eyebrow>
      <h2
        className={cn(
          'font-serif-jp text-3xl font-bold leading-[1.32] tracking-tight sm:text-4xl',
          inverted ? 'text-white' : 'text-[#172428]'
        )}
      >
        {title}
      </h2>
      {description && (
        <p
          className={cn(
            'text-[15px] leading-8',
            inverted ? 'text-white/65' : 'text-[#5A6264]'
          )}
        >
          {description}
        </p>
      )}
    </div>
  );
}

export function IntegrationNode({
  integration,
  label,
  tone = 'paper',
}: {
  integration: WorksIntegrationName;
  label: string;
  tone?: 'paper' | 'dark' | 'copper';
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-[9px] border px-3 py-3',
        tone === 'paper' && 'border-[#DCD5CA] bg-white text-[#26363B]',
        tone === 'dark' && 'border-white/10 bg-white/[0.07] text-white',
        tone === 'copper' &&
          'border-[#C88755]/30 bg-[#C88755]/10 text-[#8F4E24]'
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[8px]',
          tone === 'paper' && 'bg-[#F2ECE3]',
          tone === 'dark' && 'bg-white',
          tone === 'copper' && 'bg-white'
        )}
      >
        <WorksIntegrationIcon name={integration} size={34} decorative />
      </span>
      <span className='text-[12px] font-bold'>{label}</span>
    </div>
  );
}

export function WorkflowTrail({
  steps,
}: {
  steps: NonNullable<(typeof useCaseItems)[number]['flowSteps']>;
}) {
  return (
    <div className='mt-5 flex flex-wrap items-center gap-2 rounded-[10px] border border-[#E2DBD0] bg-[#F6F1E9] p-3 sm:flex-nowrap'>
      {steps.map((step, index) => (
        <div
          key={`${step.integration}-${step.label}-${index}`}
          className='contents'
        >
          <div className='flex min-w-[70px] flex-1 flex-col items-center gap-1.5 rounded-[8px] bg-white px-2 py-2 text-center shadow-sm'>
            <WorksIntegrationIcon
              name={step.integration}
              size={34}
              decorative
            />
            <span className='text-[9px] font-bold leading-4 text-[#435053]'>
              {step.label}
            </span>
          </div>
          {index < steps.length - 1 && (
            <ArrowRight
              className='h-4 w-4 shrink-0 text-[#B66F3E]'
              aria-hidden='true'
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function FamilyPlanCard({
  plan,
  featured = false,
  showProductLink = false,
}: {
  plan: typeof worksPlan;
  featured?: boolean;
  showProductLink?: boolean;
}) {
  return (
    <article
      className={cn(
        'rounded-[13px] border p-7',
        featured
          ? 'border-[#E3A36F]/35 bg-[#E3A36F]/10'
          : 'border-white/10 bg-white/5'
      )}
    >
      <p className='font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#E3A36F]'>
        {plan.label}
      </p>
      <h3 className='mt-3 font-serif-jp text-2xl font-bold'>{plan.name}</h3>
      <p className='mt-3 text-[13px] leading-7 text-white/60'>
        {plan.description}
      </p>
      <ul className='mt-6 space-y-3'>
        {plan.bullets.map(item => (
          <li
            key={item}
            className='flex items-center gap-2 text-[13px] text-white/82'
          >
            <CheckCircle2
              className='h-4 w-4 shrink-0 text-[#E3A36F]'
              aria-hidden='true'
            />
            {item}
          </li>
        ))}
      </ul>
      {showProductLink && (
        <Link
          href='/'
          className='mt-7 inline-flex items-center gap-2 text-[13px] font-bold text-[#F2B783] underline decoration-white/20 underline-offset-4'
        >
          Tiramisu OSを見る
          <ArrowRight className='h-4 w-4' aria-hidden='true' />
        </Link>
      )}
    </article>
  );
}
