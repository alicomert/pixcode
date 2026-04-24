import { PillBar, Pill } from '../../../../../../shared/view/ui';
import SessionProviderLogo from '../../../../../llm-logo-provider/SessionProviderLogo';
import type { AgentProvider } from '../../../../types/types';
import type { AgentSelectorSectionProps } from '../types';

const AGENT_NAMES: Record<AgentProvider, string> = {
  claude: 'Claude',
  cursor: 'Cursor',
  codex: 'Codex',
  gemini: 'Gemini',
  qwen: 'Qwen Code',
  opencode: 'OpenCode',
};

export default function AgentSelectorSection({
  agents,
  selectedAgent,
  onSelectAgent,
  agentContextById,
}: AgentSelectorSectionProps) {
  return (
    <div className="flex-shrink-0 border-b border-border px-3 py-2 md:px-4 md:py-3">
      {/* Horizontal scroll container — with 5 providers (soon 6 with
       *  OpenCode) flex-1 cramming made mobile pills unreadable and
       *  wrap-stacked the list into two rows, which users described as
       *  "Claude Claude Cursor Cursor…" duplication. Natural pill width
       *  + overflow-x-auto keeps every provider legible on any viewport. */}
      <div
        className="-mx-1 overflow-x-auto px-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Providers"
      >
        <PillBar className="w-max">
          {agents.map((agent) => {
            const dotColor =
              agent === 'claude' ? 'bg-blue-500' :
              agent === 'cursor' ? 'bg-purple-500' :
              agent === 'gemini' ? 'bg-indigo-500' :
              agent === 'qwen' ? 'bg-orange-500' : 'bg-foreground/60';

            return (
              <Pill
                key={agent}
                isActive={selectedAgent === agent}
                onClick={() => onSelectAgent(agent)}
                className="whitespace-nowrap"
              >
                <SessionProviderLogo provider={agent} className="h-4 w-4 flex-shrink-0" />
                <span>{AGENT_NAMES[agent]}</span>
                {agentContextById[agent].authStatus.authenticated && (
                  <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${dotColor}`} />
                )}
              </Pill>
            );
          })}
        </PillBar>
      </div>
    </div>
  );
}
