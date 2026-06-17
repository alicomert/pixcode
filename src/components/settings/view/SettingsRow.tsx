import type { ReactNode } from 'react';

import { cn } from '../../../lib/utils';

type SettingsRowProps = {
  label: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export default function SettingsRow({ label, description, children, className }: SettingsRowProps) {
  return (
    <div className={cn('flex flex-col items-start gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4 sm:py-4', className)}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description && (
          <div className="mt-0.5 text-sm text-muted-foreground">{description}</div>
        )}
      </div>
      <div className="w-full flex-shrink-0 sm:w-auto">{children}</div>
    </div>
  );
}
