import crypto from 'node:crypto';

import { appConfigDb, userDb } from '../database/db.js';

const CONFIG_KEY = 'qr_login_settings';
const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
  ttlSeconds: 300,
});
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 15 * 60;
const qrLoginTokens = new Map();

function clampTtl(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_SETTINGS.ttlSeconds;
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, parsed));
}

function normalizeSettings(value = {}) {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    enabled: raw.enabled === true,
    ttlSeconds: clampTtl(raw.ttlSeconds),
  };
}

function readStoredSettings() {
  const raw = appConfigDb.get(CONFIG_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function cleanupExpiredTokens() {
  const now = Date.now();
  for (const [token, entry] of qrLoginTokens.entries()) {
    if (!entry || entry.expiresAtMs <= now) {
      qrLoginTokens.delete(token);
    }
  }
}

function appendQrLoginToken(baseUrl, token) {
  const url = new URL(baseUrl);
  url.searchParams.set('qrLoginToken', token);
  return url.toString();
}

export function getQrLoginSettings() {
  return readStoredSettings();
}

export function saveQrLoginSettings(input = {}) {
  const settings = normalizeSettings(input);
  appConfigDb.set(CONFIG_KEY, JSON.stringify(settings));
  if (!settings.enabled) {
    qrLoginTokens.clear();
  }
  return settings;
}

export function createQrLoginToken({ userId, baseUrl }) {
  const settings = readStoredSettings();
  if (!settings.enabled) {
    const error = new Error('QR login is disabled.');
    error.code = 'QR_LOGIN_DISABLED';
    throw error;
  }
  const user = userDb.getUserById(userId);
  if (!user) {
    const error = new Error('QR login user was not found.');
    error.code = 'QR_LOGIN_USER_NOT_FOUND';
    throw error;
  }

  cleanupExpiredTokens();
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAtMs = Date.now() + settings.ttlSeconds * 1000;
  qrLoginTokens.set(token, {
    userId: user.id,
    createdAtMs: Date.now(),
    expiresAtMs,
  });

  return {
    token,
    expiresAt: new Date(expiresAtMs).toISOString(),
    ttlSeconds: settings.ttlSeconds,
    qrUrl: baseUrl ? appendQrLoginToken(baseUrl, token) : null,
  };
}

export function consumeQrLoginToken(token) {
  const settings = readStoredSettings();
  if (!settings.enabled) {
    const error = new Error('QR login is disabled.');
    error.code = 'QR_LOGIN_DISABLED';
    throw error;
  }
  if (!token || typeof token !== 'string') {
    const error = new Error('QR login token is required.');
    error.code = 'QR_LOGIN_TOKEN_REQUIRED';
    throw error;
  }

  cleanupExpiredTokens();
  const entry = qrLoginTokens.get(token);
  qrLoginTokens.delete(token);
  if (!entry) {
    const error = new Error('QR login token is invalid or expired.');
    error.code = 'QR_LOGIN_INVALID';
    throw error;
  }

  const user = userDb.getUserById(entry.userId);
  if (!user) {
    const error = new Error('QR login user was not found.');
    error.code = 'QR_LOGIN_USER_NOT_FOUND';
    throw error;
  }
  return user;
}
