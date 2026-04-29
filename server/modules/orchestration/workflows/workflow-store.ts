import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { builtInWorkflows } from '@/modules/orchestration/workflows/built-in-workflows.js';
import type { Workflow, WorkflowRun } from '@/modules/orchestration/workflows/workflow.types.js';

interface Document {
  version: 1;
  runs: WorkflowRun[];
}

export class WorkflowStore {
  private readonly filePath = process.env.WORKFLOW_RUNS_PATH ??
    path.join(os.homedir(), '.pixcode', 'workflow-runs.json');
  private readonly tmpPath = `${this.filePath}.tmp`;
  private readonly runs = new Map<string, WorkflowRun>();

  constructor() {
    this.load();
  }

  listWorkflows(): Workflow[] {
    return builtInWorkflows;
  }

  getWorkflow(id: string): Workflow | undefined {
    return builtInWorkflows.find((workflow) => workflow.id === id);
  }

  listRuns(): WorkflowRun[] {
    return [...this.runs.values()].sort((a, b) => b.startedAt - a.startedAt);
  }

  getRun(id: string): WorkflowRun | undefined {
    return this.runs.get(id);
  }

  setRun(run: WorkflowRun): void {
    this.runs.set(run.id, run);
    this.flush();
  }

  private load(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      this.flush();
      return;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Partial<Document>;
      for (const run of Array.isArray(parsed.runs) ? parsed.runs : []) {
        if (run && typeof run.id === 'string') {
          this.runs.set(run.id, run);
        }
      }
    } catch {
      this.flush();
    }
  }

  private flush(): void {
    fs.writeFileSync(
      this.tmpPath,
      JSON.stringify({ version: 1, runs: [...this.runs.values()] }, null, 2),
      'utf8',
    );
    fs.renameSync(this.tmpPath, this.filePath);
  }
}

export const workflowStore = new WorkflowStore();
