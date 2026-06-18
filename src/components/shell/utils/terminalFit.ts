import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';

import { TERMINAL_OPTIONS } from '../constants/constants';

const RIGHT_CLI_FONT_MIN_WIDTH = 320;
const RIGHT_CLI_FONT_FULL_WIDTH = 560;
const RIGHT_CLI_MIN_FONT_SIZE = 10;
const RIGHT_CLI_FULL_FONT_SIZE = TERMINAL_OPTIONS.fontSize ?? 14;

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

function resolveRightCliFontSize(width: number, layoutSignal: string | number | null) {
  if (!isRightCliLayoutSignal(layoutSignal)) {
    return null;
  }

  const ratio = Math.max(
    0,
    Math.min(1, (width - RIGHT_CLI_FONT_MIN_WIDTH) / (RIGHT_CLI_FONT_FULL_WIDTH - RIGHT_CLI_FONT_MIN_WIDTH)),
  );
  return Math.round(RIGHT_CLI_MIN_FONT_SIZE + (RIGHT_CLI_FULL_FONT_SIZE - RIGHT_CLI_MIN_FONT_SIZE) * ratio);
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
  const cellWidth = Number(cell?.width);
  const cellHeight = Number(cell?.height);
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
    rows: Math.max(1, Math.floor(availableHeight / cellHeight)),
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

  const nextFontSize = resolveRightCliFontSize(bounds.width, layoutSignal);
  if (nextFontSize !== null && terminal.options.fontSize !== nextFontSize) {
    terminal.options.fontSize = nextFontSize;
    terminal.clearTextureAtlas();
  }

  const dimensions = isRightCliLayoutSignal(layoutSignal)
    ? proposeDimensionsFromContainer(terminal, container) ?? fitAddon.proposeDimensions()
    : fitAddon.proposeDimensions() ?? proposeDimensionsFromContainer(terminal, container);
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
