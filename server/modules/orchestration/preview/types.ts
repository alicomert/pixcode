export interface PortEvent {
  taskId: string;
  workspaceId?: string;
  port: number;
  host: string;
  url: string;
  processName?: string;
  confidence: 'low' | 'medium' | 'high';
  detectedAt: number;
}

export interface PreviewArtifactData {
  url: string;
  proxiedUrl: string;
  port: number;
  host: string;
  processName?: string;
  confidence: 'low' | 'medium' | 'high';
}
