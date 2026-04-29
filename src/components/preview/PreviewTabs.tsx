import { ExternalLink, RefreshCw, X } from 'lucide-react';

import { Button } from '../../shared/view/ui';
import type { PreviewTab } from './usePreviewArtifacts';

type PreviewTabsProps = {
  tabs: PreviewTab[];
  activeId?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onReload: () => void;
};

export default function PreviewTabs({
  tabs,
  activeId,
  onSelect,
  onClose,
  onReload,
}: PreviewTabsProps) {
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  return (
    <div className="flex h-11 items-center gap-2 border-b border-border/70 px-3">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className={`h-8 rounded-md px-3 text-sm ${tab.id === active?.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {active?.url ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={() => window.open(active.url, '_blank', 'noopener,noreferrer')}
          aria-label="Open preview externally"
        >
          <ExternalLink />
        </Button>
      ) : null}
      <Button type="button" size="icon" variant="ghost" onClick={onReload} aria-label="Reload preview">
        <RefreshCw />
      </Button>
      <Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label="Close preview">
        <X />
      </Button>
    </div>
  );
}
