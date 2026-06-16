import { sendSocketMessage } from './socket';

const TERMINAL_INPUT_CHUNK_SIZE = 4096;
const TERMINAL_INPUT_CHUNK_DELAY_MS = 1;

export function sendTerminalInput(socket: WebSocket | null | undefined, data: string) {
  if (!data) return false;
  const activeSocket = socket || null;

  if (data.length <= TERMINAL_INPUT_CHUNK_SIZE) {
    sendSocketMessage(activeSocket, { type: 'input', data });
    return true;
  }

  const chunks: string[] = [];
  for (let index = 0; index < data.length; index += TERMINAL_INPUT_CHUNK_SIZE) {
    chunks.push(data.slice(index, index + TERMINAL_INPUT_CHUNK_SIZE));
  }

  const sendChunk = (index: number) => {
    const chunk = chunks[index];
    if (!chunk) return;
    sendSocketMessage(activeSocket, { type: 'input', data: chunk });
    if (index + 1 < chunks.length) {
      window.setTimeout(() => sendChunk(index + 1), TERMINAL_INPUT_CHUNK_DELAY_MS);
    }
  };

  sendChunk(0);
  return true;
}
