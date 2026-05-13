import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

import { cn } from '../../lib/utils';
import { Badge, Button } from '../../shared/view/ui';

import { ArrowRight, ChevronDown, type LucideIcon } from '@/lib/icons';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const toneClasses: Record<Tone, string> = {
  neutral: 'border-border/60 bg-background text-foreground',
  success: 'border-emerald-500/30 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300',
  warning: 'border-amber-500/30 bg-amber-500/8 text-amber-700 dark:text-amber-300',
  danger: 'border-destructive/30 bg-destructive/8 text-destructive',
  info: 'border-primary/25 bg-primary/5 text-primary',
};

export function CommandCard({
  icon: Icon,
  title,
  description,
  meta,
  value,
  tone = 'neutral',
  isActive = false,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  meta?: string;
  value?: string | number;
  tone?: Tone;
  isActive?: boolean;
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>['onClick'];
}) {
  return (
    <button
      type="button"
      data-gsap-list-item
      onClick={onClick}
      className={cn(
        'group min-h-[132px] rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35',
        'hover:border-primary/35 hover:bg-primary/5',
        toneClasses[tone],
        isActive && 'border-primary/50 bg-primary/10',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-background/70 text-foreground shadow-sm ring-1 ring-border/60">
          <Icon className="h-5 w-5" />
        </span>
        {value !== undefined && (
          <span className="rounded-md bg-background/80 px-2.5 py-1 text-sm font-semibold text-foreground ring-1 ring-border/60">
            {value}
          </span>
        )}
      </div>
      <div className="mt-4 text-sm font-semibold text-foreground">{title}</div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      <div className="mt-3 flex min-h-[22px] items-center justify-between gap-2 text-xs">
        <span className="truncate text-muted-foreground">{meta}</span>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
    </button>
  );
}

export function SummaryCard({
  label,
  value,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: Tone;
}) {
  return (
    <div data-gsap-list-item className={cn('rounded-lg border px-4 py-3', toneClasses[tone])}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

export function ControlRoomPanel({
  title,
  description,
  children,
  action,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('min-w-0 rounded-lg border border-border/60 bg-background', className)}>
      <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function ContextDrawer({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <aside className={cn('min-h-0 rounded-lg border border-border/60 bg-muted/15', className)}>
      <div className="border-b border-border/60 px-4 py-4">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-4 p-4">{children}</div>
    </aside>
  );
}

export function GuidanceCard({
  title = 'What this means',
  description,
  action,
  tone = 'info',
}: {
  title?: string;
  description: string;
  action?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className={cn('rounded-lg border px-4 py-3', toneClasses[tone])}>
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function EmptyGuidance({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border/70 px-4 py-6 text-sm">
      <div className="font-medium text-foreground">{title}</div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      {actionLabel && onAction && (
        <Button className="mt-4 min-h-[44px]" variant="outline" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export function TimelineItem({
  time,
  actor,
  action,
  result,
  tone = 'neutral',
  children,
}: {
  time: string;
  actor: string;
  action: string;
  result: string;
  tone?: Tone;
  children?: ReactNode;
}) {
  return (
    <div data-gsap-list-item className="relative pl-6">
      <span className={cn('absolute left-0 top-1.5 h-3 w-3 rounded-full border bg-background', toneClasses[tone])} />
      <div className="rounded-lg border border-border/60 bg-background px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{time}</span>
          <Badge variant="secondary">{actor}</Badge>
        </div>
        <div className="mt-2 text-sm font-medium text-foreground">{action}</div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{result}</p>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </div>
  );
}

export function ActionRow({
  title,
  description,
  status,
  action,
}: {
  title: string;
  description?: string;
  status?: string;
  action?: ReactNode;
}) {
  return (
    <div data-gsap-list-item className="flex flex-col gap-3 border-b border-border/50 px-3 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{title}</div>
        {description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {status && <Badge variant="secondary">{status}</Badge>}
        {action}
      </div>
    </div>
  );
}

export function ResponsiveDataList<T>({
  items,
  empty,
  render,
}: {
  items: T[];
  empty: ReactNode;
  render: (item: T, index: number) => ReactNode;
}) {
  if (items.length === 0) {
    return <>{empty}</>;
  }

  return <div className="divide-y divide-border/50">{items.map(render)}</div>;
}

export function AdvancedDisclosure({
  title,
  description,
  children,
  defaultOpen = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="group rounded-lg border border-border/60 bg-muted/10" open={defaultOpen}>
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-foreground">
        <span>
          {title}
          {description && <span className="mt-0.5 block text-xs font-normal leading-5 text-muted-foreground">{description}</span>}
        </span>
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border/60 p-4">{children}</div>
    </details>
  );
}

export function StatusBanner({ tone, children, className }: HTMLAttributes<HTMLDivElement> & { tone: Tone }) {
  return <div className={cn('rounded-lg border px-4 py-3 text-sm', toneClasses[tone], className)}>{children}</div>;
}
