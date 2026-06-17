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
  .pixcode-shell-terminal .xterm {
    height: 100%;
    padding: 0 !important;
  }
  .pixcode-shell-terminal .xterm-viewport {
    height: 100% !important;
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
