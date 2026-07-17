import { useUiPreferences, type ShellMode } from '../../hooks/useUiPreferences';
import { cn } from '../../lib/utils';

const MODES: Array<{ id: ShellMode; label: string; short: string; description: string }> = [
  {
    id: 'nanoclaw',
    label: 'NanoClaw',
    short: 'NC',
    description: 'PixBot / schedules / Telegram·WhatsApp — no coding IDE chrome',
  },
  {
    id: 'hybrid',
    label: 'Hybrid',
    short: 'Both',
    description: 'VS Code workbench + PixBot (NanoClaw engine always on)',
  },
  {
    id: 'pixcode',
    label: 'Pixcode',
    short: 'IDE',
    description: 'Classic coding UI — messaging still runs via NanoClaw in the background',
  },
];

export function ShellModeSwitcher({ compact = false }: { compact?: boolean }) {
  const { preferences, setPreference } = useUiPreferences();
  const mode = preferences.shellMode || 'hybrid';

  return (
    <div className={cn('flex flex-col gap-1', compact && 'min-w-0')}>
      {!compact && (
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Workspace mode
        </p>
      )}
      <div
        className={cn(
          'inline-flex rounded-xl border border-border bg-muted/30 p-0.5',
          compact ? 'w-full' : 'w-fit',
        )}
        role="group"
        aria-label="Workspace mode"
      >
        {MODES.map((entry) => {
          const active = mode === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              title={entry.description}
              onClick={() => setPreference('shellMode', entry.id)}
              className={cn(
                'rounded-lg px-2.5 py-1.5 text-xs font-semibold transition',
                compact && 'flex-1',
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {compact ? entry.short : entry.label}
            </button>
          );
        })}
      </div>
      {!compact && (
        <p className="max-w-md text-[11px] leading-4 text-muted-foreground">
          {MODES.find((entry) => entry.id === mode)?.description}
          {' '}
          Telegram/WhatsApp always use NanoClaw — independent of this switch.
        </p>
      )}
    </div>
  );
}

export default ShellModeSwitcher;
