import { PLATFORM_AUTH_BYPASS_ENABLED } from '../../../constants/config';
import { createStreamAuthUrl } from '../../../utils/api';
import type { ShellIncomingMessage, ShellOutgoingMessage } from '../types/types';

export async function getShellWebSocketUrl(): Promise<string | null> {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  if (PLATFORM_AUTH_BYPASS_ENABLED) {
    return `${protocol}//${window.location.host}/shell`;
  }

  const token = localStorage.getItem('auth-token');
  if (!token) {
    console.error('No authentication token found for Shell WebSocket connection');
    return null;
  }

  const ticketUrl = await createStreamAuthUrl('/shell', 'ws');
  return `${protocol}//${window.location.host}${ticketUrl}`;
}

export function parseShellMessage(payload: string): ShellIncomingMessage | null {
  try {
    return JSON.parse(payload) as ShellIncomingMessage;
  } catch {
    return null;
  }
}

export function sendSocketMessage(ws: WebSocket | null, message: ShellOutgoingMessage): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}
