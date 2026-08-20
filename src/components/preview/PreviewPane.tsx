import { useMemo, useState } from 'react';

import PreviewTabs from './PreviewTabs';
import type { PreviewTab } from './usePreviewArtifacts';

type PreviewPaneProps = {
  tabs: PreviewTab[];
  mobile?: boolean;
  onClose: () => void;
};

export default function PreviewPane({ tabs, mobile = false, onClose }: PreviewPaneProps) {
  const [activeId, setActiveId] = useState<string | undefined>(tabs[0]?.id);
  const [reloadKey, setReloadKey] = useState(0);
  const active = useMemo(
    () => tabs.find((tab) => tab.id === activeId) ?? tabs[0],
    [activeId, tabs],
  );
  const source = active ? active.proxiedUrl || active.url : '';
  // Never copy the reusable browser JWT/API key into an iframe URL. Apart
  // from leaking into history and proxy logs, the old `/preview/?token=…`
  // fallback had no matching backend route in current Pixcode builds. Live
  // View share paths are already scoped by their random share id; other
  // previews should provide a public/signed URL in the artifact itself.
  const src = useMemo(() => {
    if (!source || typeof window === 'undefined') return '';
    try {
      const parsed = new URL(source, window.location.origin);
      if (!['http:', 'https:'].includes(parsed.protocol)) return '';
      for (const key of ['token', 'apiKey', 'access_token', 'auth']) {
        parsed.searchParams.delete(key);
      }
      return parsed.toString();
    } catch {
      return '';
    }
  }, [source]);

  if (!active) return null;

  return (
    <section
      className={
        mobile
          ? 'fixed inset-x-0 bottom-0 z-50 h-[70vh] border-t border-border bg-background shadow-xl'
          : 'flex h-full min-w-[360px] max-w-[48vw] flex-1 flex-col border-l border-border bg-background'
      }
    >
      <PreviewTabs
        tabs={tabs}
        activeId={active.id}
        onSelect={setActiveId}
        onClose={onClose}
        onReload={() => setReloadKey((current) => current + 1)}
      />
      <iframe
        key={`${active.id}:${reloadKey}`}
        title={`Preview ${active.label}`}
        src={src}
        className="h-full w-full flex-1 bg-white"
        sandbox="allow-forms allow-modals allow-popups allow-scripts allow-same-origin"
      />
    </section>
  );
}
