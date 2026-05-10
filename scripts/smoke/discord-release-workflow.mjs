#!/usr/bin/env node
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/discord-release.yml', 'utf8');

const requiredSnippets = [
  'DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}',
  "if: ${{ env.DISCORD_WEBHOOK_URL == '' }}",
  "if: ${{ env.DISCORD_WEBHOOK_URL != '' }}",
  'curl -fsS',
  'GITHUB_EVENT_PATH',
];

for (const snippet of requiredSnippets) {
  if (!workflow.includes(snippet)) {
    throw new Error(`Discord release workflow is missing required guard/publish snippet: ${snippet}`);
  }
}

if (workflow.includes('SethCohen/github-releases-to-discord')) {
  throw new Error('Discord release workflow should not depend on the deprecated external Discord action.');
}

console.log('discord release workflow smoke passed');
