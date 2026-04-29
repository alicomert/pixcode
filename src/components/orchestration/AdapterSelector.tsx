import { useTranslation } from 'react-i18next';

import type { AgentCard } from './useOrchestrationTasks';

type AdapterSelectorProps = {
  agents: AgentCard[];
  value: string;
  onChange: (value: string) => void;
};

function adapterIdFromName(name: string): string {
  return name.replace(/^pixcode-/, '').replace('claude-code', 'claude-code');
}

export default function AdapterSelector({ agents, value, onChange }: AdapterSelectorProps) {
  const { t } = useTranslation();

  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
    >
      <option value="auto">{t('orchestration.auto')}</option>
      {agents.map((agent) => {
        const id = adapterIdFromName(agent.name);
        return (
          <option key={agent.name} value={id}>
            {agent.name.replace(/^pixcode-/, '')}
          </option>
        );
      })}
    </select>
  );
}
