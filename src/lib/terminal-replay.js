// Terminal queries (OSC color asks, DSR/CPR, DA, window reports, DECRPM)
// make xterm write an answer back to the PTY. That answer is correct while
// the application is live and waiting for it, but replaying recorded output
// re-answers every stale query — the late replies land in the CLI's input
// as literal "10;rgb:…" text. Strip report-generating sequences from replay
// only; the live stream stays untouched so real-time queries still work.
//
// Matches: OSC "?" asks (10;? 11;? 4;i;? and multi-param forms such as
// 10;?;11;? that some TUIs batch into one report), DSR/CPR (5n 6n),
// DA (?c >c 0c), window reports (any CSI …t), DECRPM ($p), XTVERSION (>q),
// DECID (Z). OSC queries accept BEL, ST and the C1 \x9c terminator, plus a
// trailing unterminated ask at a chunk boundary so the response can never
// be re-answered when the continuation arrives in the next replay event.
// eslint-disable-next-line no-control-regex -- ANSI sequences are the point
const REPLAY_QUERY = /\x1b\][0-9;?]*\?(?:[0-9;?]*(?:\x07|\x1b\\|\x9c)|$)|\x1b\[[0-9?;>]*[nc]|\x1b\[[0-9;]*t|\x1b\[[0-9?;]*\$p|\x1b\[>q|\x1bZ/g

export function sanitizeReplay(data) {
  return String(data || '').replace(REPLAY_QUERY, '')
}
