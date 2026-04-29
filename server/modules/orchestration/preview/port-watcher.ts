import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { PortEvent } from '@/modules/orchestration/preview/types.js';
import type { WorkspaceHandle } from '@/modules/orchestration/workspace/types.js';

const execFileAsync = promisify(execFile);

interface WatchOptions {
  taskId: string;
  workspace: WorkspaceHandle;
  intervalMs?: number;
  onPort(event: PortEvent): void;
}

interface ListeningPort {
  port: number;
  host: string;
  processName?: string;
}

const knownPreviewPorts = new Map<number, PortEvent>();

function parseAddress(address: string): { host: string; port: number } | null {
  const normalized = address.trim();
  const idx = normalized.lastIndexOf(':');
  if (idx === -1) return null;
  const port = Number.parseInt(normalized.slice(idx + 1), 10);
  if (!Number.isFinite(port) || port <= 0) return null;
  const host = normalized.slice(0, idx).replace(/^\[|\]$/g, '') || '127.0.0.1';
  return { host: host === '*' || host === '0.0.0.0' ? '127.0.0.1' : host, port };
}

function parseSs(output: string): ListeningPort[] {
  const ports: ListeningPort[] = [];
  for (const line of output.split('\n')) {
    if (!line.includes('LISTEN')) continue;
    const parts = line.trim().split(/\s+/);
    const address = parts[3] ?? parts[4];
    const parsed = address ? parseAddress(address) : null;
    if (!parsed) continue;
    const processMatch = line.match(/users:\(\("([^"]+)"/);
    ports.push({
      ...parsed,
      processName: processMatch?.[1],
    });
  }
  return ports;
}

async function readListeningPorts(): Promise<ListeningPort[]> {
  try {
    const { stdout } = await execFileAsync('ss', ['-ltnp'], {
      maxBuffer: 1024 * 1024,
    });
    return parseSs(String(stdout));
  } catch {
    return [];
  }
}

export function getKnownPreviewPort(port: number): PortEvent | undefined {
  return knownPreviewPorts.get(port);
}

export class PortWatcher {
  watch(options: WatchOptions): () => void {
    const {
      taskId,
      workspace,
      intervalMs = 1000,
      onPort,
    } = options;
    const seen = new Set<number>();
    let stopped = false;
    let timer: NodeJS.Timeout | undefined;
    let initialized = false;

    const tick = async () => {
      if (stopped) return;
      const ports = await readListeningPorts();
      for (const port of ports) {
        if (seen.has(port.port)) continue;
        seen.add(port.port);
        if (!initialized) continue;
        const event: PortEvent = {
          taskId,
          workspaceId: workspace.id,
          port: port.port,
          host: port.host,
          url: `http://${port.host}:${port.port}`,
          processName: port.processName,
          confidence: 'low',
          detectedAt: Date.now(),
        };
        knownPreviewPorts.set(port.port, event);
        onPort(event);
      }
      initialized = true;
      timer = setTimeout(tick, intervalMs);
    };

    void tick();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }
}

export const portWatcher = new PortWatcher();
