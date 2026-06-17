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
    overflow: hidden;
  }
  .pixcode-shell-terminal .xterm {
    flex: 1 1 auto;
    height: 100%;
    min-height: 0;
    width: 100%;
    padding: 0 !important;
  }
  .pixcode-shell-terminal .xterm-screen {
    min-height: 0;
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
