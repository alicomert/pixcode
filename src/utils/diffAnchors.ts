type DiffInfo = {
  old_string?: string;
  new_string?: string;
};

export function firstChangedLine(diffInfo?: DiffInfo | null): number | null {
  if (!diffInfo || typeof diffInfo.new_string !== 'string') return null;
  const oldLines = String(diffInfo.old_string || '').split('\n');
  const newLines = diffInfo.new_string.split('\n');
  const max = Math.max(oldLines.length, newLines.length);
  for (let index = 0; index < max; index += 1) {
    if (oldLines[index] !== newLines[index]) {
      return index + 1;
    }
  }
  return null;
}

export function buildDiffLineHref(filePath: string, line: number | null): string {
  const encodedPath = encodeURIComponent(filePath);
  return line && line > 0 ? `${encodedPath}#L${line}` : encodedPath;
}
