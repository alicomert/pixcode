import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';

type TerminalCore = {
  _renderService?: {
    dimensions?: {
      css?: {
        cell?: {
          width?: number;
          height?: number;
        };
      };
    };
    clear?: () => void;
  };
  viewport?: {
    scrollBarWidth?: number;
  };
};

type TerminalDimensions = {
  cols: number;
  rows: number;
};

type FitShellTerminalOptions = {
  terminal: Terminal;
  fitAddon: FitAddon;
  container: HTMLElement;
  layoutSignal: string | number | null;
};

function getTerminalCore(terminal: Terminal): TerminalCore {
  return (terminal as unknown as { _core?: TerminalCore })._core ?? {};
}

function parsePixelValue(value: string | null | undefined) {
  const parsed = Number.parseFloat(value || '0');
  return Number.isFinite(parsed) ? parsed : 0;
}

function isRightCliLayoutSignal(layoutSignal: string | number | null) {
  return typeof layoutSignal === 'string' && layoutSignal.startsWith('right-cli:');
}

function readTerminalOptionNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function measureCellFromDom(terminal: Terminal, container: HTMLElement) {
  const probe = document.createElement('span');
  probe.textContent = 'W'.repeat(80);
  probe.style.position = 'absolute';
  probe.style.left = '-99999px';
  probe.style.top = '-99999px';
  probe.style.visibility = 'hidden';
  probe.style.whiteSpace = 'pre';
  probe.style.fontFamily = String(terminal.options.fontFamily || 'monospace');
  probe.style.fontSize = `${readTerminalOptionNumber(terminal.options.fontSize, 14)}px`;
  probe.style.fontWeight = String(terminal.options.fontWeight || 'normal');
  probe.style.lineHeight = String(readTerminalOptionNumber(terminal.options.lineHeight, 1.2));

  container.appendChild(probe);
  const rect = probe.getBoundingClientRect();
  probe.remove();

  const width = rect.width / 80;
  const height = rect.height;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
}

function proposeDimensionsFromContainer(
  terminal: Terminal,
  container: HTMLElement,
): TerminalDimensions | null {
  const bounds = container.getBoundingClientRect();
  if (bounds.width < 16 || bounds.height < 16) {
    return null;
  }

  const core = getTerminalCore(terminal);
  const cell = core._renderService?.dimensions?.css?.cell;
  const measuredCell = measureCellFromDom(terminal, container);
  const maybeCellWidth = Number(cell?.width) > 0 ? Number(cell?.width) : measuredCell?.width;
  const maybeCellHeight = Number(cell?.height) > 0 ? Number(cell?.height) : measuredCell?.height;
  const cellWidth = Number(maybeCellWidth);
  const cellHeight = Number(maybeCellHeight);
  if (!Number.isFinite(cellWidth) || !Number.isFinite(cellHeight) || cellWidth <= 0 || cellHeight <= 0) {
    return null;
  }

  const elementStyle = terminal.element
    ? window.getComputedStyle(terminal.element)
    : null;
  const paddingX = elementStyle
    ? parsePixelValue(elementStyle.getPropertyValue('padding-left'))
      + parsePixelValue(elementStyle.getPropertyValue('padding-right'))
    : 0;
  const paddingY = elementStyle
    ? parsePixelValue(elementStyle.getPropertyValue('padding-top'))
      + parsePixelValue(elementStyle.getPropertyValue('padding-bottom'))
    : 0;
  const scrollbarWidth = terminal.options.scrollback === 0
    ? 0
    : Number(core.viewport?.scrollBarWidth) || 0;

  const availableWidth = Math.max(0, bounds.width - paddingX - scrollbarWidth);
  const availableHeight = Math.max(0, bounds.height - paddingY);

  return {
    cols: Math.max(2, Math.floor(availableWidth / cellWidth)),
    rows: Math.max(2, Math.floor(availableHeight / cellHeight)),
  };
}

export function fitShellTerminal({
  terminal,
  fitAddon,
  container,
  layoutSignal,
}: FitShellTerminalOptions): boolean {
  const bounds = container.getBoundingClientRect();
  if (bounds.width < 16 || bounds.height < 16) {
    return false;
  }

  const containerDimensions = proposeDimensionsFromContainer(terminal, container);
  const dimensions = isRightCliLayoutSignal(layoutSignal)
    ? containerDimensions ?? fitAddon.proposeDimensions()
    : fitAddon.proposeDimensions() ?? containerDimensions;
  if (!dimensions || !Number.isFinite(dimensions.cols) || !Number.isFinite(dimensions.rows)) {
    return false;
  }

  const nextCols = Math.max(2, Math.floor(dimensions.cols));
  const nextRows = Math.max(1, Math.floor(dimensions.rows));
  if (terminal.cols !== nextCols || terminal.rows !== nextRows) {
    getTerminalCore(terminal)._renderService?.clear?.();
    terminal.resize(nextCols, nextRows);
  }

  return true;
}
