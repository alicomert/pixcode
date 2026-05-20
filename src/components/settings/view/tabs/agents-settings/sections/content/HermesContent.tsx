import { Button } from '../../../../../../../shared/view/ui';

import { Download, Terminal, Workflow } from '@/lib/icons';

export default function HermesContent() {
  const openHermesTerminal = (mode: 'start' | 'install') => {
    window.dispatchEvent(new CustomEvent('pixcode:hermes-terminal', {
      detail: { mode },
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Workflow className="h-5 w-5 text-emerald-500" />
        <div>
          <h3 className="text-lg font-medium text-foreground">Hermes Agent</h3>
          <p className="text-sm text-muted-foreground">
            Pixcode configures its MCP server before Hermes starts, so Hermes can inspect the active project and request visible CLI launches inside Pixcode.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/40 dark:bg-emerald-900/10">
        <div className="space-y-3 text-sm text-emerald-900 dark:text-emerald-100">
          <div className="font-medium">Runtime controls</div>
          <p className="text-emerald-800/80 dark:text-emerald-200/80">
            Tools, skills, LSP, curator, cron, delegation, and kanban are managed from the Hermes CLI. Pixcode keeps the install/start path project-scoped and visible in the terminal.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => openHermesTerminal('start')}
            >
              <Terminal className="mr-2 h-4 w-4" />
              Start Hermes
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => openHermesTerminal('install')}
            >
              <Download className="mr-2 h-4 w-4" />
              Install or repair
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
