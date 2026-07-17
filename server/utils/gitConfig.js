import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { githubTokensDb, userDb } from '../database/db.js';

function spawnAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    child.on('error', (error) => { reject(error); });
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const error = new Error(`Command failed: ${command} ${args.join(' ')}`);
      error.code = code;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

export function getPixcodeGitConfigPath() {
  return process.env.PIXCODE_GIT_CONFIG
    || path.join(process.env.PIXCODE_HOME || path.join(os.homedir(), '.pixcode'), 'gitconfig');
}

/**
 * Read git configuration from Pixcode-managed file, falling back to system global.
 * @returns {Promise<{git_name: string|null, git_email: string|null}>}
 */
export async function getSystemGitConfig() {
  const filePath = getPixcodeGitConfigPath();
  try {
    if (fs.existsSync(filePath)) {
      const [nameResult, emailResult] = await Promise.all([
        spawnAsync('git', ['config', '--file', filePath, 'user.name']).catch(() => ({ stdout: '' })),
        spawnAsync('git', ['config', '--file', filePath, 'user.email']).catch(() => ({ stdout: '' })),
      ]);
      const git_name = nameResult.stdout.trim() || null;
      const git_email = emailResult.stdout.trim() || null;
      if (git_name || git_email) return { git_name, git_email };
    }
  } catch {
    // fall through
  }

  try {
    const [nameResult, emailResult] = await Promise.all([
      spawnAsync('git', ['config', '--global', 'user.name']).catch(() => ({ stdout: '' })),
      spawnAsync('git', ['config', '--global', 'user.email']).catch(() => ({ stdout: '' })),
    ]);
    return {
      git_name: nameResult.stdout.trim() || null,
      git_email: emailResult.stdout.trim() || null,
    };
  } catch {
    return { git_name: null, git_email: null };
  }
}

/**
 * Persist identity into ~/.pixcode/gitconfig (NOT system --global).
 * Safe under systemd / root / multi-user servers.
 */
export async function applyPixcodeGitIdentity(gitName, gitEmail) {
  const filePath = getPixcodeGitConfigPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '# Managed by Pixcode — do not use git config --global\n', 'utf8');
  }

  await spawnAsync('git', ['config', '--file', filePath, 'user.name', String(gitName)]);
  await spawnAsync('git', ['config', '--file', filePath, 'user.email', String(gitEmail)]);
  // Avoid interactive prompts on servers
  await spawnAsync('git', ['config', '--file', filePath, 'credential.helper', '']).catch(() => {});
  return filePath;
}

export function getActiveGithubToken(userId) {
  if (userId == null) return null;
  try {
    const token = githubTokensDb.getActiveGithubToken(userId);
    if (!token) return null;
    // getActiveCredential returns the raw credential_value string
    if (typeof token === 'string') return token;
    return token.credential_value || token.github_token || token.token || null;
  } catch {
    return null;
  }
}

export function userHasGithubToken(userId) {
  return Boolean(getActiveGithubToken(userId));
}

/**
 * Inject a GitHub PAT into an HTTPS github.com URL for clone/fetch.
 * Leaves SSH URLs unchanged (user must use deploy keys for SSH).
 */
export function withGithubToken(remoteUrl, token) {
  if (!remoteUrl || !token) return remoteUrl;
  const raw = String(remoteUrl).trim();
  try {
    if (/^git@github\.com:/i.test(raw)) {
      // git@github.com:owner/repo.git → https with token (more reliable on headless servers)
      const pathPart = raw.replace(/^git@github\.com:/i, '').replace(/\.git$/, '');
      return `https://x-access-token:${encodeURIComponent(token)}@github.com/${pathPart}.git`;
    }
    const url = new URL(raw);
    if (!/github\.com$/i.test(url.hostname) && !/\.github\.com$/i.test(url.hostname)) {
      return raw;
    }
    url.username = 'x-access-token';
    url.password = token;
    return url.toString();
  } catch {
    return raw;
  }
}

/**
 * Env for any git spawn: identity + optional GitHub insteadOf rewrite.
 */
export function buildGitSpawnEnv({ userId, gitName, gitEmail, githubToken, baseEnv = process.env } = {}) {
  let name = gitName || null;
  let email = gitEmail || null;
  if (userId != null && (!name || !email)) {
    try {
      const cfg = userDb.getGitConfig(userId);
      name = name || cfg?.git_name || null;
      email = email || cfg?.git_email || null;
    } catch {
      // ignore
    }
  }

  const token = githubToken || (userId != null ? getActiveGithubToken(userId) : null);
  const configFile = getPixcodeGitConfigPath();
  const env = {
    ...baseEnv,
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: 'echo',
    // Prefer Pixcode-managed identity file when present
    ...(fs.existsSync(configFile) ? { GIT_CONFIG_GLOBAL: configFile } : {}),
  };

  if (name) {
    env.GIT_AUTHOR_NAME = name;
    env.GIT_COMMITTER_NAME = name;
  }
  if (email) {
    env.GIT_AUTHOR_EMAIL = email;
    env.GIT_COMMITTER_EMAIL = email;
  }

  // Temporary URL rewrite so fetch/pull/push of https://github.com/* use the PAT
  // without mutating remotes or writing ~/.git-credentials.
  if (token) {
    env.GIT_CONFIG_COUNT = '2';
    env.GIT_CONFIG_KEY_0 = 'url.https://x-access-token:' + token + '@github.com/.insteadOf';
    env.GIT_CONFIG_VALUE_0 = 'https://github.com/';
    env.GIT_CONFIG_KEY_1 = 'url.https://x-access-token:' + token + '@github.com/.insteadOf';
    env.GIT_CONFIG_VALUE_1 = 'https://github.com/';
    // Also map git protocol host form
    env.GIT_CONFIG_COUNT = '3';
    env.GIT_CONFIG_KEY_2 = 'url.https://x-access-token:' + token + '@github.com/.insteadOf';
    env.GIT_CONFIG_VALUE_2 = 'git@github.com:';
  }

  return env;
}

export function redactTokenFromText(text, token) {
  if (!text || !token) return text || '';
  return String(text).split(token).join('***');
}
