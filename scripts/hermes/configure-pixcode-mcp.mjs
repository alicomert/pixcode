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
  '        - pixcode_read_cli_terminal',
  '        - pixcode_get_hermes_gateway_status',
  '        - pixcode_probe_hermes_gateway',
  '        - pixcode_get_hermes_diagnostics',
  '        - pixcode_get_api_manifest',
  '        - pixcode_api_request',
  '        - pixcode_hermes_gateway_request',
  '        - pixcode_manage_hermes_cron',
  '        - pixcode_send_cli_input',
  '      resources: false',
  '      prompts: false',
].join('\n');
const apiServerToolsetBlock = [
  '  api_server:',
  '    - hermes-api-server',
  '    - pixcode',
].join('\n');
const cliToolsets = ['hermes-cli', 'mcp-pixcode'];

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

function upsertPixcodeApiServerToolset(rawConfig) {
  const lines = rawConfig.split(/\r?\n/);
  const platformIndex = lines.findIndex((line) => /^platform_toolsets:\s*(?:#.*)?$/.test(line));

  if (platformIndex === -1) {
    const prefix = rawConfig.trim() ? `${rawConfig.replace(/\s*$/, '')}\n\n` : '';
    return `${prefix}platform_toolsets:\n${apiServerToolsetBlock}\n`;
  }

  const platformEnd = findRootKeyEnd(lines, platformIndex);
  const apiServerIndex = lines.findIndex((line, index) => (
    index > platformIndex && index < platformEnd && /^  api_server:\s*(?:#.*)?$/.test(line)
  ));

  if (apiServerIndex === -1) {
    lines.splice(platformIndex + 1, 0, apiServerToolsetBlock);
    return `${lines.join('\n').replace(/\s*$/, '')}\n`;
  }

  const apiServerEnd = findNestedKeyEnd(lines, apiServerIndex, platformEnd);
  lines.splice(apiServerIndex, apiServerEnd - apiServerIndex, apiServerToolsetBlock);
  return `${lines.join('\n').replace(/\s*$/, '')}\n`;
}

function readRootListValues(lines, startIndex, endIndex) {
  const values = [];
  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const match = lines[index].match(/^\s*-\s*([^#\s][^#]*?)(?:\s+#.*)?$/);
    if (match) values.push(match[1].trim().replace(/^['"]|['"]$/g, ''));
  }
  return values;
}

function upsertRootListValues(rawConfig, key, values) {
  const lines = rawConfig.split(/\r?\n/);
  const keyPattern = new RegExp(`^${key}:\\s*(?:#.*)?$`);
  const keyIndex = lines.findIndex((line) => keyPattern.test(line));

  if (keyIndex === -1) {
    const prefix = rawConfig.trim() ? `${rawConfig.replace(/\s*$/, '')}\n\n` : '';
    return `${prefix}${key}:\n${values.map((value) => `- ${value}`).join('\n')}\n`;
  }

  const keyEnd = findRootKeyEnd(lines, keyIndex);
  const nextList = values.map((value) => `- ${value}`);
  const existingList = readRootListValues(lines, keyIndex, keyEnd);
  if (
    existingList.length === values.length &&
    existingList.every((value, index) => value === values[index])
  ) {
    return `${lines.join('\n').replace(/\s*$/, '')}\n`;
  }

  lines.splice(keyIndex + 1, keyEnd - keyIndex - 1, ...nextList);
  return `${lines.join('\n').replace(/\s*$/, '')}\n`;
}

fs.mkdirSync(hermesHome, { recursive: true });
const previous = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
const next = upsertRootListValues(
  upsertPixcodeApiServerToolset(upsertPixcodeMcpConfig(previous)),
  'toolsets',
  cliToolsets,
);

if (previous !== next) {
  fs.writeFileSync(configPath, next);
  process.stdout.write(`Pixcode MCP configured in ${configPath}\n`);
} else {
  process.stdout.write(`Pixcode MCP already configured in ${configPath}\n`);
}
