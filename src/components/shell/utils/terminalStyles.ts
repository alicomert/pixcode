const XTERM_STYLE_ELEMENT_ID = 'shell-xterm-focus-style';

const XTERM_FOCUS_STYLES = `
  .xterm .xterm-screen {
    outline: none !important;
  }
  .xterm:focus .xterm-screen {
    outline: none !important;
  }
  .xterm-screen:focus {
    outline: none !important;
  }
  .pixcode-shell-terminal {
    display: flex;
    min-height: 0;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
  }
  .pixcode-shell-terminal .xterm {
    flex: 1 1 auto;
    height: 100%;
    min-height: 0;
    min-width: 0;
    max-width: 100%;
    width: 100%;
    box-sizing: border-box;
    overflow: hidden;
    padding: 0 !important;
  }
  .pixcode-shell-terminal .xterm-viewport,
  .pixcode-shell-terminal .xterm-screen {
    min-height: 0;
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
    overflow: hidden;
  }
  .pixcode-shell-terminal .xterm-rows {
    min-width: 0;
    max-width: 100%;
  }
  .pixcode-shell-terminal--right-cli,
  .pixcode-shell-terminal--right-cli .xterm,
  .pixcode-shell-terminal--right-cli .xterm-viewport,
  .pixcode-shell-terminal--right-cli .xterm-screen {
    width: 100% !important;
    max-width: 100% !important;
    height: 100% !important;
    max-height: 100% !important;
    overflow: hidden !important;
  }
  .pixcode-shell-terminal--right-cli .xterm-rows {
    width: 100% !important;
    max-width: 100% !important;
  }
  .pixcode-shell-terminal--right-cli .xterm-rows > div {
    width: 100% !important;
    max-width: 100% !important;
    white-space: pre-wrap !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
  }
`;

export function ensureXtermFocusStyles(): void {
  if (typeof document === 'undefined') {
    return;
  }

  if (document.getElementById(XTERM_STYLE_ELEMENT_ID)) {
    return;
  }

  const styleSheet = document.createElement('style');
  styleSheet.id = XTERM_STYLE_ELEMENT_ID;
  styleSheet.type = 'text/css';
  styleSheet.innerText = XTERM_FOCUS_STYLES;
  document.head.appendChild(styleSheet);
}
