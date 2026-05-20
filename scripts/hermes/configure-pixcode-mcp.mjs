#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const hermesHome = process.env.HERMES_HOME || path.join(os.homedir(), '.hermes');
const configPath = path.join(hermesHome, 'config.yaml');
const appRoot = process.env.PIXCODE_APP_ROOT || process.cwd();
const baseUrl = process.env.PIXCODE_BASE_URL;
const apiKey = process.env.PIXCODE_API_KEY;

if (!baseUrl || !apiKey) {
  process.stderr.write('PIXCODE_BASE_URL and PIXCODE_API_KEY are required for Pixcode MCP setup.\n');
  process.exit(1);
}

const mcpServerPath = path.join(appRoot, 'scripts', 'hermes', 'pixcode-mcp-server.mjs');
const block = [
  '  pixcode:',
  '    command: "node"',
  '    args:',
  `      - "${mcpServerPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
  '    env:',
  `      PIXCODE_BASE_URL: "${baseUrl.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
  `      PIXCODE_API_KEY: "${apiKey.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
  '    enabled: true',
  '    tools:',
  '      include:',
  '        - pixcode_list_projects',
  '        - pixcode_get_provider_status',
  '        - pixcode_open_cli_terminal',
  '      resources: false',
  '      prompts: false',
].join('\n');

function findRootKeyEnd(lines, startIndex) {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (/^\S[^:]*:\s*(?:#.*)?$/.test(lines[index])) {
      return index;
    }
  }
  return lines.length;
}

function findNestedKeyEnd(lines, startIndex, parentEnd) {
  for (let index = startIndex + 1; index < parentEnd; index += 1) {
    if (/^  \S[^:]*:\s*(?:#.*)?$/.test(lines[index])) {
      return index;
    }
  }
  return parentEnd;
}

function upsertPixcodeMcpConfig(rawConfig) {
  const lines = rawConfig.split(/\r?\n/);
  const mcpIndex = lines.findIndex((line) => /^mcp_servers:\s*(?:#.*)?$/.test(line));

  if (mcpIndex === -1) {
    const prefix = rawConfig.trim() ? `${rawConfig.replace(/\s*$/, '')}\n\n` : '';
    return `${prefix}mcp_servers:\n${block}\n`;
  }

  const mcpEnd = findRootKeyEnd(lines, mcpIndex);
  const pixcodeIndex = lines.findIndex((line, index) => (
    index > mcpIndex && index < mcpEnd && /^  pixcode:\s*(?:#.*)?$/.test(line)
  ));

  if (pixcodeIndex === -1) {
    lines.splice(mcpIndex + 1, 0, block);
    return `${lines.join('\n').replace(/\s*$/, '')}\n`;
  }

  const pixcodeEnd = findNestedKeyEnd(lines, pixcodeIndex, mcpEnd);
  lines.splice(pixcodeIndex, pixcodeEnd - pixcodeIndex, block);
  return `${lines.join('\n').replace(/\s*$/, '')}\n`;
}

fs.mkdirSync(hermesHome, { recursive: true });
const previous = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
const next = upsertPixcodeMcpConfig(previous);

if (previous !== next) {
  fs.writeFileSync(configPath, next);
  process.stdout.write(`Pixcode MCP configured in ${configPath}\n`);
} else {
  process.stdout.write(`Pixcode MCP already configured in ${configPath}\n`);
}
