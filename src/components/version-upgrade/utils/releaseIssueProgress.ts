export const RELEASE_ISSUE_PROGRESS_MARKER = 'pixcode:issue-progress';

export type ReleaseIssueState = 'completed' | 'in_progress' | 'pending';

export type ReleaseIssueProgressItem = {
  issue: string;
  title: string;
  state: ReleaseIssueState;
  source: string;
};

export const DEFAULT_V137_ISSUE_PROGRESS: ReleaseIssueProgressItem[] = [
  {
    issue: '#6',
    title: 'Strict orchestration handoff with compact packets',
    state: 'completed',
    source: 'v1.37 tracker',
  },
  {
    issue: '#7',
    title: 'Reliable notification center with browser, desktop, and Telegram fallback',
    state: 'completed',
    source: 'v1.37 tracker',
  },
  {
    issue: '#8',
    title: 'Focused orchestration execution dashboard',
    state: 'completed',
    source: 'v1.37 tracker',
  },
  {
    issue: '#9',
    title: 'Chat hydration and realtime message visibility fixes',
    state: 'completed',
    source: 'v1.37 tracker',
  },
  {
    issue: '#10',
    title: 'Multi-project worker slots from the chat prompt',
    state: 'completed',
    source: 'v1.37 tracker',
  },
  {
    issue: '#11',
    title: 'Optional Taskmaster setup during first account setup',
    state: 'completed',
    source: 'v1.37 tracker',
  },
  {
    issue: '#12',
    title: 'Taskmaster execution across CLI providers and Telegram',
    state: 'completed',
    source: 'v1.37 tracker',
  },
  {
    issue: '#13',
    title: 'Update progress mapped to GitHub issues and tasks',
    state: 'completed',
    source: 'v1.37 tracker',
  },
];

const markedBlockExpression = new RegExp(
  `<!--\\s*${RELEASE_ISSUE_PROGRESS_MARKER}\\s*-->[\\s\\S]*?<!--\\s*/${RELEASE_ISSUE_PROGRESS_MARKER}\\s*-->`,
  'i',
);

function getIssueProgressSource(body: string) {
  const match = body.match(markedBlockExpression);
  if (!match) return body;

  return match[0]
    .replace(new RegExp(`<!--\\s*${RELEASE_ISSUE_PROGRESS_MARKER}\\s*-->`, 'i'), '')
    .replace(new RegExp(`<!--\\s*/${RELEASE_ISSUE_PROGRESS_MARKER}\\s*-->`, 'i'), '');
}

export function stripIssueProgressBlock(body: string) {
  return body.replace(markedBlockExpression, '').trim();
}

function stateFromMarker(marker: string, title: string): ReleaseIssueState {
  const normalizedMarker = marker.trim().toLowerCase();
  const normalizedTitle = title.toLowerCase();

  if (normalizedMarker === 'x' || /\b(done|fixed|complete|completed|shipped)\b/.test(normalizedTitle)) {
    return 'completed';
  }

  if (normalizedMarker === '~' || normalizedMarker === '-' || /\b(in progress|working|started)\b/.test(normalizedTitle)) {
    return 'in_progress';
  }

  return 'pending';
}

function normalizeIssue(rawIssue: string | undefined, fallbackIndex: number) {
  if (!rawIssue) return `Task ${fallbackIndex + 1}`;

  const normalized = rawIssue.trim();
  if (/^gh-\d+$/i.test(normalized)) {
    return `#${normalized.slice(3)}`;
  }

  return normalized.startsWith('#') ? normalized : `#${normalized}`;
}

function cleanTitle(rawTitle: string) {
  return rawTitle
    .replace(/\s+-\s+(done|fixed|complete|completed|in progress|pending|shipped)\s*$/i, '')
    .replace(/\s+\((done|fixed|complete|completed|in progress|pending|shipped)\)\s*$/i, '')
    .trim();
}

export function extractIssueProgress(body: string): ReleaseIssueProgressItem[] {
  if (!body.trim()) return [];

  const source = getIssueProgressSource(body);
  const items: ReleaseIssueProgressItem[] = [];

  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('<!--')) continue;

    const checkedMatch = line.match(/^[*-]\s+\[([xX ~-])\]\s+(?:(#\d+|GH-\d+)\s*[:\-]?\s*)?(.+)$/);
    if (checkedMatch) {
      const title = cleanTitle(checkedMatch[3]);
      if (!title) continue;
      items.push({
        issue: normalizeIssue(checkedMatch[2], items.length),
        title,
        state: stateFromMarker(checkedMatch[1], title),
        source: line,
      });
      continue;
    }

    const issueLineMatch = line.match(/^[*-]\s+(#\d+|GH-\d+)\s*[:\-]\s*(.+)$/i);
    if (issueLineMatch) {
      const title = cleanTitle(issueLineMatch[2]);
      if (!title) continue;
      items.push({
        issue: normalizeIssue(issueLineMatch[1], items.length),
        title,
        state: stateFromMarker('', title),
        source: line,
      });
    }
  }

  return items;
}
