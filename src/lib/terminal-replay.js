// Terminal queries (OSC color asks, DSR/CPR, DA, window reports, DECRPM)
// make xterm write an answer back to the PTY. That answer is correct while
// the application is live and waiting for it, but replaying recorded output
// re-answers every stale query — the late replies land in the CLI's input
// as literal "10;rgb:…" text. Strip report-generating sequences from replay
// only; the live stream stays untouched so real-time queries still work.
//
// Matches: OSC "?" asks (10;? 11;? 4;i;?), DSR/CPR (5n 6n), DA (?c >c 0c),
// window size reports (14t 18t 19t), DECRPM ($p), XTVERSION (>q), DECID (Z).
const REPLAY_QUERY = /\x1b\][0-9;]*\?(?:\x07|\x1b\\)|\x1b\[[0-9?;>]*[nc]|\x1b\[1[489]t|\x1b\[[0-9?;]*\$p|\x1b\[>q|\x1bZ/g

export function sanitizeReplay(data) {
  return String(data || '').replace(REPLAY_QUERY, '')
}
