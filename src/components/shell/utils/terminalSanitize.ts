/**
 * Kill-switch for xterm mouse / device-attribute feedback loops.
 *
 * Root failure mode we hit in production:
 *   apps enable SGR mouse tracking → xterm emits \x1b[<btn;x;yM on move
 *   → we forward that as PTY "input" → PTY echoes / apps re-enable tracking
 *   → when cell metrics glitch, y becomes the literal string "NaN"
 *     (\x1b[<35;11;NaNM) which old digit-only filters did NOT match.
 *
 * Strategy:
 *  1. Drop every mouse report shape (incl. NaN / partial).
 *  2. Drop device-attribute / DSR replies that self-loop.
 *  3. Strip mouse-mode *enable* sequences from PTY→UI traffic so tracking
 *     never stays on, even if an app requests it.
 */

/** SGR mouse: ESC [ < btn ; col ; row M/m  — coords may be digits OR "NaN". */
const MOUSE_SGR_REGEX = /\x1b\[<(?:NaN|\d+)(?:;(?:NaN|\d+))*[Mm]/giu;

/** Anything that looks like a broken/partial SGR mouse CSI ending in M/m. */
const MOUSE_SGR_LOOSE_REGEX = /\x1b\[<[^Mm\x1b]{0,40}[Mm]/gu;

/** Default xterm mouse: ESC [ M + up to 3 payload bytes. */
const MOUSE_DEFAULT_REGEX = /\x1b\[M[\s\S]{0,3}/gu;

/** URXVT mouse: ESC [ btn ; x ; y M */
const MOUSE_URXVT_REGEX = /\x1b\[\d+;\d+;\d+M/gu;

const DA1_REGEX = /\x1b\[\?\d+[;:\d]*c/gu;
const DA2_REGEX = /\x1b\[>\d+[;:\d]*c/gu;
const DSR_CURSOR_REGEX = /\x1b\[\d+;\d+R/gu;
const DSR_PRIVATE_CURSOR_REGEX = /\x1b\[\?\d+;\d+R/gu;
const DSR_STATUS_REGEX = /\x1b\[\d+n/gu;
const FOCUS_EVENT_REGEX = /\x1b\[[IO]/gu;
const WINDOW_SIZE_REGEX = /\x1b\[\d+;\d+;\d+t/gu;
const DECRQM_REGEX = /\x1b\[\d+;\d+\$y/gu;
const OSC_COLOR_REGEX = /\x1b\](?:10|11|12);[^\x07\x1b]*(?:\x07|\x1b\\)?/giu;
const OSC_PALETTE_REGEX = /\x1b\]4;\d+;[^\x07\x1b]*(?:\x07|\x1b\\)?/giu;
const DCS_REGEX = /\x1bP[\s\S]*?\x1b\\/gu;

/** Printable leftovers after ESC is stripped: aNM / aMaN / NaNM spam. */
const PRINTABLE_MOUSE_GARBAGE_REGEX = /(?:aNM|aMaN|NaNM|NaN[Mm]){1,}/giu;

/**
 * Private-mode mouse tracking enable/disable.
 * We strip *enables* (h) so apps cannot turn tracking on; disables (l) are fine.
 */
const MOUSE_MODE_ENABLE_REGEX = /\x1b\[\?(?:100[0-6]|101[56])(?:;(?:100[0-6]|101[56]))*h/gu;

const INPUT_STRIP_REGEXES = [
  OSC_COLOR_REGEX,
  OSC_PALETTE_REGEX,
  DA1_REGEX,
  DA2_REGEX,
  DSR_CURSOR_REGEX,
  DSR_PRIVATE_CURSOR_REGEX,
  DSR_STATUS_REGEX,
  FOCUS_EVENT_REGEX,
  MOUSE_SGR_REGEX,
  MOUSE_SGR_LOOSE_REGEX,
  MOUSE_DEFAULT_REGEX,
  MOUSE_URXVT_REGEX,
  WINDOW_SIZE_REGEX,
  DECRQM_REGEX,
  DCS_REGEX,
];

function applyRegexList(input: string, regexes: RegExp[]): string {
  let result = input;
  for (const regex of regexes) {
    regex.lastIndex = 0;
    result = result.replace(regex, '');
  }
  return result;
}

/** Sanitize bytes leaving the browser toward the PTY (xterm onData). */
export function sanitizeTerminalInputData(data: string): string {
  if (!data) return '';

  // Fast path: pure mouse spam chunks.
  if (
    data.includes('\x1b[<')
    || data.includes('\x1b[M')
    || /NaN[Mm]/i.test(data)
  ) {
    let cleaned = applyRegexList(data, INPUT_STRIP_REGEXES);
    cleaned = cleaned.replace(PRINTABLE_MOUSE_GARBAGE_REGEX, '');
    // If anything mouse-related remains, drop the whole chunk — safer than
    // injecting half-sequences into the PTY.
    if (
      cleaned.includes('\x1b[<')
      || cleaned.includes('\x1b[M')
      || /NaN/i.test(cleaned)
    ) {
      return '';
    }
    return cleaned;
  }

  let result = applyRegexList(data, INPUT_STRIP_REGEXES);
  result = result.replace(PRINTABLE_MOUSE_GARBAGE_REGEX, '');
  return result;
}

/**
 * Sanitize PTY → xterm traffic: never let apps keep mouse tracking enabled.
 * Returns cleaned text + whether mouse modes were requested (so caller can
 * force-disable tracking after write).
 */
export function sanitizeTerminalOutputData(data: string): {
  text: string;
  mouseModeRequested: boolean;
} {
  if (!data) {
    return { text: '', mouseModeRequested: false };
  }

  MOUSE_MODE_ENABLE_REGEX.lastIndex = 0;
  const mouseModeRequested = MOUSE_MODE_ENABLE_REGEX.test(data);
  MOUSE_MODE_ENABLE_REGEX.lastIndex = 0;

  let text = data.replace(MOUSE_MODE_ENABLE_REGEX, '');
  // Also never echo mouse reports back into the display if the PTY loops them.
  text = applyRegexList(text, [
    MOUSE_SGR_REGEX,
    MOUSE_SGR_LOOSE_REGEX,
    MOUSE_DEFAULT_REGEX,
    PRINTABLE_MOUSE_GARBAGE_REGEX,
  ]);

  return { text, mouseModeRequested };
}

/** CSI sequences that turn mouse tracking off in xterm. */
export const MOUSE_TRACKING_OFF =
  '\x1b[?1000l\x1b[?1001l\x1b[?1002l\x1b[?1003l\x1b[?1005l\x1b[?1006l\x1b[?1015l\x1b[?1016l';
