/**
 * Lightweight 5-field cron matcher + NL → cron (no extra npm dependency).
 * Fields: minute hour day-of-month month day-of-week (0=Sun)
 */

const WEEKDAY_MAP = {
  sun: 0, sunday: 0, paz: 0, pazar: 0,
  mon: 1, monday: 1, pzt: 1, pazartesi: 1,
  tue: 2, tuesday: 2, sal: 2, sali: 2, salı: 2,
  wed: 3, wednesday: 3, car: 3, çar: 3, carsamba: 3, çarşamba: 3,
  thu: 4, thursday: 4, per: 4, persembe: 4, perşembe: 4,
  fri: 5, friday: 5, cum: 5, cuma: 5,
  sat: 6, saturday: 6, cmt: 6, cumartesi: 6,
};

function parseField(field, min, max) {
  if (field === '*' || field === undefined) {
    return { type: 'any' };
  }
  if (field.startsWith('*/')) {
    const step = Number.parseInt(field.slice(2), 10);
    if (!Number.isFinite(step) || step <= 0) return null;
    return { type: 'step', step, min, max };
  }
  if (field.includes(',')) {
    const values = field.split(',').map((part) => Number.parseInt(part, 10));
    if (values.some((value) => !Number.isFinite(value))) return null;
    return { type: 'list', values };
  }
  if (field.includes('-')) {
    const [a, b] = field.split('-').map((part) => Number.parseInt(part, 10));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return { type: 'range', from: a, to: b };
  }
  const value = Number.parseInt(field, 10);
  if (!Number.isFinite(value)) return null;
  return { type: 'value', value };
}

function matchField(parsed, value) {
  if (!parsed) return false;
  if (parsed.type === 'any') return true;
  if (parsed.type === 'value') return value === parsed.value;
  if (parsed.type === 'list') return parsed.values.includes(value);
  if (parsed.type === 'range') return value >= parsed.from && value <= parsed.to;
  if (parsed.type === 'step') {
    if (value < parsed.min || value > parsed.max) return false;
    return (value - parsed.min) % parsed.step === 0;
  }
  return false;
}

export function isValidCronExpression(expression) {
  if (typeof expression !== 'string') return false;
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const bounds = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
  return parts.every((part, index) => parseField(part, bounds[index][0], bounds[index][1]) !== null);
}

export function cronMatches(expression, date = new Date()) {
  if (!isValidCronExpression(expression)) return false;
  const [minF, hourF, domF, monF, dowF] = expression.trim().split(/\s+/);
  const minute = date.getMinutes();
  const hour = date.getHours();
  const dom = date.getDate();
  const mon = date.getMonth() + 1;
  const dow = date.getDay();
  return (
    matchField(parseField(minF, 0, 59), minute)
    && matchField(parseField(hourF, 0, 23), hour)
    && matchField(parseField(domF, 1, 31), dom)
    && matchField(parseField(monF, 1, 12), mon)
    && matchField(parseField(dowF, 0, 6), dow)
  );
}

/** Next fire time at minute resolution (searches up to ~366 days). */
export function nextCronOccurrence(expression, from = new Date()) {
  if (!isValidCronExpression(expression)) return null;
  const cursor = new Date(from.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);
  const limit = 366 * 24 * 60;
  for (let i = 0; i < limit; i += 1) {
    if (cronMatches(expression, cursor)) return cursor.toISOString();
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return null;
}

function extractHourMinute(text) {
  const lower = text.toLowerCase();
  const ampm = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (ampm) {
    let hour = Number.parseInt(ampm[1], 10);
    const minute = ampm[2] ? Number.parseInt(ampm[2], 10) : 0;
    if (ampm[3] === 'pm' && hour < 12) hour += 12;
    if (ampm[3] === 'am' && hour === 12) hour = 0;
    return { hour, minute };
  }
  const h24 = lower.match(/\b(?:at|saat)\s*(\d{1,2})(?::(\d{2}))?\b/) || lower.match(/\b(\d{1,2}):(\d{2})\b/);
  if (h24) {
    const hour = Number.parseInt(h24[1], 10);
    const minute = h24[2] ? Number.parseInt(h24[2], 10) : 0;
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) return { hour, minute };
  }
  if (/\b(noon|öğlen|oglen)\b/.test(lower)) return { hour: 12, minute: 0 };
  if (/\b(midnight|gece yarısı|gece yarisi)\b/.test(lower)) return { hour: 0, minute: 0 };
  if (/\b(morning|sabah)\b/.test(lower)) return { hour: 9, minute: 0 };
  if (/\b(evening|akşam|aksam)\b/.test(lower)) return { hour: 18, minute: 0 };
  return { hour: 9, minute: 0 };
}

/**
 * Detect schedule intent from natural language.
 * @returns {{ kind: 'none' } | { kind: 'cron', cronExpression, label, autonomyLevel }}
 */
export function detectScheduleIntent(text) {
  const lower = String(text || '').toLowerCase();
  const wantsSchedule = /\b(every|her|daily|hourly|weekly|cron|schedule|zamanla|otomatik|tekrar|hafta|gün|gun|saat)\b/i.test(lower);
  if (!wantsSchedule) return { kind: 'none' };

  // Bare cron expression in text
  const bare = lower.match(/\b(\d+|\*)(?:\/\d+)?\s+(\d+|\*)(?:\/\d+)?\s+(\d+|\*)(?:\/\d+)?\s+(\d+|\*)(?:\/\d+)?\s+(\d+|\*|\d-\d)(?:\/\d+)?\b/);
  if (bare && isValidCronExpression(bare[0])) {
    return {
      kind: 'cron',
      cronExpression: bare[0].trim(),
      label: `cron ${bare[0].trim()}`,
      autonomyLevel: /\b(auto|otomatik|unattended|without approval|onaysız|onaysiz)\b/i.test(lower) ? 'auto' : 'supervised',
    };
  }

  const { hour, minute } = extractHourMinute(lower);
  const autonomyLevel = /\b(auto|otomatik|unattended|without approval|onaysız|onaysiz)\b/i.test(lower) ? 'auto' : 'supervised';

  if (/\b(every hour|hourly|her saat|saatlik)\b/.test(lower)) {
    return { kind: 'cron', cronExpression: `${minute} * * * *`, label: 'hourly', autonomyLevel };
  }

  if (/\b(weekdays|hafta içi|hafta ici|iş günü|is gunu)\b/.test(lower)) {
    return {
      kind: 'cron',
      cronExpression: `${minute} ${hour} * * 1-5`,
      label: `weekdays ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      autonomyLevel,
    };
  }

  if (/\b(weekend|hafta sonu)\b/.test(lower)) {
    return {
      kind: 'cron',
      cronExpression: `${minute} ${hour} * * 0,6`,
      label: `weekends ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      autonomyLevel,
    };
  }

  if (/\b(every week|weekly|her hafta|haftalık|haftalik)\b/.test(lower)) {
    let dow = 1;
    for (const [name, value] of Object.entries(WEEKDAY_MAP)) {
      if (lower.includes(name)) {
        dow = value;
        break;
      }
    }
    return {
      kind: 'cron',
      cronExpression: `${minute} ${hour} * * ${dow}`,
      label: `weekly ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      autonomyLevel,
    };
  }

  if (/\b(every month|monthly|her ay|ayın 1|ayin 1)\b/.test(lower)) {
    return {
      kind: 'cron',
      cronExpression: `${minute} ${hour} 1 * *`,
      label: `monthly day-1 ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      autonomyLevel,
    };
  }

  if (/\b(every day|daily|her gün|her gun|günlük|gunluk|her sabah|every morning)\b/.test(lower)
    || /\b(schedule|zamanla|otomatik)\b/.test(lower)) {
    return {
      kind: 'cron',
      cronExpression: `${minute} ${hour} * * *`,
      label: `daily ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      autonomyLevel,
    };
  }

  return { kind: 'none' };
}

export function describeCron(expression) {
  if (!isValidCronExpression(expression)) return expression;
  const [min, hour, dom, mon, dow] = expression.trim().split(/\s+/);
  if (min !== '*' && hour !== '*' && dom === '*' && mon === '*' && dow === '*') {
    return `daily at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
  }
  if (min !== '*' && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return `hourly at minute ${min}`;
  }
  if (dow === '1-5') return `weekdays at ${hour}:${min}`;
  return expression;
}

/** Legacy recurrence → cron expression */
export function recurrenceToCron(recurrence) {
  if (recurrence === 'hourly') return '0 * * * *';
  if (recurrence === 'weekly') return '0 9 * * 1';
  if (recurrence === 'daily') return '0 9 * * *';
  return null;
}
