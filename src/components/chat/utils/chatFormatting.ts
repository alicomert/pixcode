export function decodeHtmlEntities(text: string) {
  if (!text) return text;
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

export function normalizeInlineCodeFences(text: string) {
  if (!text || typeof text !== 'string') return text;
  try {
    return text.replace(/```\s*([^\n\r]+?)\s*```/g, '`$1`');
  } catch {
    return text;
  }
}

export function unescapeWithMathProtection(text: string) {
  if (!text || typeof text !== 'string') return text;

  const mathBlocks: string[] = [];
  const placeholderPrefix = '__MATH_BLOCK_';
  const placeholderSuffix = '__';

  let processedText = text.replace(/\$\$([\s\S]*?)\$\$|\$([^\$\n]+?)\$/g, (match) => {
    const index = mathBlocks.length;
    mathBlocks.push(match);
    return `${placeholderPrefix}${index}${placeholderSuffix}`;
  });

  processedText = processedText.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r');

  processedText = processedText.replace(
    new RegExp(`${placeholderPrefix}(\\d+)${placeholderSuffix}`, 'g'),
    (match, index) => {
      return mathBlocks[parseInt(index, 10)];
    },
  );

  return processedText;
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function formatUsageLimitText(text: string) {
  try {
    if (typeof text !== 'string') return text;
    return text.replace(/Claude AI usage limit reached\|(\d{10,13})/g, (match, ts) => {
      let timestampMs = parseInt(ts, 10);
      if (!Number.isFinite(timestampMs)) return match;
      if (timestampMs < 1e12) timestampMs *= 1000;
      const reset = new Date(timestampMs);

      const timeStr = new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(reset);

      const offsetMinutesLocal = -reset.getTimezoneOffset();
      const sign = offsetMinutesLocal >= 0 ? '+' : '-';
      const abs = Math.abs(offsetMinutesLocal);
      const offH = Math.floor(abs / 60);
      const offM = abs % 60;
      const gmt = `GMT${sign}${offH}${offM ? ':' + String(offM).padStart(2, '0') : ''}`;
      const tzId = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      const cityRaw = tzId.split('/').pop() || '';
      const city = cityRaw
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase());
      const tzHuman = city ? `${gmt} (${city})` : gmt;

      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const dateReadable = `${reset.getDate()} ${months[reset.getMonth()]} ${reset.getFullYear()}`;

      return `Claude usage limit reached. Your limit will reset at **${timeStr} ${tzHuman}** - ${dateReadable}`;
    });
  } catch {
    return text;
  }
}

export function formatProviderErrorText(text: string, provider?: string) {
  if (!text || typeof text !== 'string') return text;

  const lower = text.toLowerCase();
  const label = provider
    ? provider.charAt(0).toUpperCase() + provider.slice(1)
    : 'The selected CLI';

  const reason = (() => {
    if (
      lower.includes('insufficient_quota')
      || lower.includes('insufficient quota')
      || lower.includes('quota exceeded')
      || lower.includes('credit balance')
      || lower.includes('balance')
      || lower.includes('billing')
      || lower.includes('payment required')
      || lower.includes('402')
    ) {
      return 'account balance or quota';
    }

    if (
      lower.includes('rate limit')
      || lower.includes('too many requests')
      || lower.includes('429')
      || lower.includes('usage limit')
    ) {
      return 'rate limit';
    }

    if (
      lower.includes('unauthorized')
      || lower.includes('forbidden')
      || lower.includes('invalid api key')
      || lower.includes('api key')
      || lower.includes('oauth')
      || lower.includes('login')
      || lower.includes('401')
      || lower.includes('403')
    ) {
      return 'authentication';
    }

    if (
      lower.includes('not installed')
      || lower.includes('command not found')
      || lower.includes('enoent')
      || lower.includes('spawn')
    ) {
      return 'installation';
    }

    if (
      lower.includes('timeout')
      || lower.includes('timed out')
    ) {
      return 'timeout';
    }

    return null;
  })();

  if (!reason) return formatUsageLimitText(text);

  const action = reason === 'account balance or quota'
    ? 'Add credits or switch to another provider/model, then retry.'
    : reason === 'rate limit'
      ? 'Wait for the limit to reset or switch to another provider/model, then retry.'
      : reason === 'authentication'
        ? 'Re-authenticate this CLI from provider settings, then retry.'
        : reason === 'installation'
          ? 'Install or repair the CLI binary, refresh provider status, then retry.'
          : 'The CLI did not respond in time. Retry with a shorter prompt or another provider.';

  return [
    `${label} could not answer because of a ${reason} issue.`,
    '',
    action,
    '',
    `Raw error: ${text}`,
  ].join('\n');
}
