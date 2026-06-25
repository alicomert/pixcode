import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'node:net';
import readline from 'readline';
import { spawn } from 'node:child_process';

import { c } from './utils/colors.js';

const PIXCODE_DIR = path.join(os.homedir(), '.pixcode');
const SETUP_MARKER = path.join(PIXCODE_DIR, '.setup-complete');
const DEFAULT_PORT = 3001;

function isFirstRun() {
    return !fs.existsSync(SETUP_MARKER);
}

function markSetupComplete(config) {
    try {
        fs.mkdirSync(PIXCODE_DIR, { recursive: true });
        fs.writeFileSync(SETUP_MARKER, JSON.stringify({
            completedAt: new Date().toISOString(),
            ...config,
        }, null, 2));
    } catch {
        // Non-fatal — setup can complete without persistence
    }
}

function readSetupConfig() {
    try {
        return JSON.parse(fs.readFileSync(SETUP_MARKER, 'utf8'));
    } catch {
        return null;
    }
}

function isPortAvailable(port) {
    return new Promise((resolve) => {
        const tester = net.createServer();
        tester.once('error', () => resolve(false));
        tester.once('listening', () => {
            tester.close(() => resolve(true));
        });
        tester.listen(Number(port), '0.0.0.0');
    });
}

async function findAvailablePort(startPort, maxAttempts = 10) {
    for (let port = startPort; port < startPort + maxAttempts; port++) {
        if (await isPortAvailable(port)) return port;
    }
    return null;
}

function isPortOpen(port, timeoutMs = 800) {
    return new Promise((resolve) => {
        const socket = net.createConnection({ host: '127.0.0.1', port: Number(port) });
        let settled = false;
        const done = (value) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve(value);
        };
        socket.setTimeout(timeoutMs);
        socket.once('connect', () => done(true));
        socket.once('timeout', () => done(false));
        socket.once('error', () => done(false));
    });
}

async function waitForServerReady(port, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await isPortOpen(port)) return true;
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    return false;
}

function ask(question) {
    return new Promise((resolve) => {
        if (!process.stdin.isTTY || !process.stdout.isTTY) {
            resolve(null);
            return;
        }
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer?.trim() || '');
        });
    });
}

async function askSelect(question, options) {
    while (true) {
        const answer = await ask(question);
        if (answer === null) return null;
        const lower = answer.toLowerCase();
        for (const opt of options) {
            if (lower === opt.key || lower === String(opt.key)) return opt;
            if (opt.aliases?.some(a => lower === a)) return opt;
        }
        console.log(`${c.warn('  Invalid choice. Please try again.')}`);
    }
}

function openBrowser(url) {
    const platform = process.platform;
    // Use spawn with an argument array instead of exec with a shell string
    // to prevent command injection through the url value.
    let bin;
    let args;
    if (platform === 'darwin') {
        bin = 'open';
        args = [url];
    } else if (platform === 'win32') {
        bin = 'cmd';
        args = ['/c', 'start', '', url];
    } else {
        bin = 'xdg-open';
        args = [url];
    }
    try {
        spawn(bin, args, { stdio: 'ignore', timeout: 3000, detached: true, shell: false }).unref();
        return true;
    } catch {
        return false;
    }
}

function printBanner() {
    console.log('');
    console.log(c.dim('  ╔═══════════════════════════════════════════════════════════════╗'));
    console.log(c.dim('  ║') + c.bright('         Pixcode Setup Wizard                ') + c.dim('║'));
    console.log(c.dim('  ╠═══════════════════════════════════════════════════════════════╣'));
    console.log(c.dim('  ║') + c.info('  Self-hosted AI coding agent control room      ') + c.dim('║'));
    console.log(c.dim('  ║') + c.dim('  Claude Code, Cursor, Codex, Gemini, Qwen...    ') + c.dim('║'));
    console.log(c.dim('  ╚═══════════════════════════════════════════════════════════════╝'));
    console.log('');
}

function printReady(port) {
    const url = `http://localhost:${port}`;
    console.log('');
    console.log(c.dim('  ╔═══════════════════════════════════════════════════════════════╗'));
    console.log(c.dim('  ║') + c.bright('  Pixcode is Ready!                          ') + c.dim('║'));
    console.log(c.dim('  ╠═══════════════════════════════════════════════════════════════╣'));
    console.log(c.dim('  ║') + `  Open ${c.bright(url)} in your browser      ` + c.dim('║'));
    console.log(c.dim('  ╚═══════════════════════════════════════════════════════════════╝'));
    console.log('');
    console.log(`  ${c.info('[INFO]')} Web UI:      ${c.bright(url)}`);
    console.log(`  ${c.info('[INFO]')} Health:      ${c.dim(url + '/health')}`);
    console.log('');
}

export async function runSetupWizard(existingOptions = {}) {
    if (!isFirstRun()) return null;

    printBanner();

    console.log(`  ${c.info('Welcome!')} Let's get Pixcode configured.\n`);

    // Step 1: Port selection
    let port = existingOptions.serverPort || process.env.SERVER_PORT || DEFAULT_PORT;
    const portAvailable = await isPortAvailable(port);

    if (!portAvailable) {
        console.log(`  ${c.warn('[WARN]')} Port ${c.bright(String(port))} is already in use.`);
        const altPort = await findAvailablePort(Number(port) + 1);
        if (altPort) {
            console.log(`  ${c.info('[INFO]')} Port ${c.bright(String(altPort))} is available.`);
            const choice = await askSelect(
                `  Use port ${altPort}? [Y/n] `,
                [
                    { key: 'y', label: 'yes', aliases: ['yes', '', 'e', 'evet'] },
                    { key: 'n', label: 'no', aliases: ['no', 'n', 'h', 'hayir'] },
                ],
            );
            if (choice?.key !== 'n') {
                port = altPort;
            } else {
                const customPort = await ask(`  Enter a port number (or press Enter for ${altPort}): `);
                if (customPort && /^\d+$/.test(customPort)) {
                    port = Number(customPort);
                } else {
                    port = altPort;
                }
            }
        } else {
            const customPort = await ask(`  No free ports found near ${port}. Enter a port manually: `);
            if (customPort && /^\d+$/.test(customPort)) {
                port = Number(customPort);
            }
        }
    } else {
        console.log(`  ${c.ok('[OK]')}   Port ${c.bright(String(port))} is available.`);
        const customPort = await ask(`  Press Enter to use port ${port}, or enter a different port: `);
        if (customPort && /^\d+$/.test(customPort)) {
            const newPort = Number(customPort);
            if (await isPortAvailable(newPort)) {
                port = newPort;
                console.log(`  ${c.ok('[OK]')}   Port ${c.bright(String(port))} is available.`);
            } else {
                console.log(`  ${c.warn('[WARN]')} Port ${newPort} is in use. Keeping port ${port}.`);
            }
        }
    }

    process.env.SERVER_PORT = String(port);

    // Step 2: Mode selection (Linux only)
    let useDaemon = existingOptions.noDaemon ? false : (process.platform === 'linux');

    if (process.platform === 'linux' && !existingOptions.noDaemon) {
        console.log('');
        const modeChoice = await askSelect(
            `  ${c.info('Run mode:')} Keep running in background (daemon) or foreground?\n` +
            `  ${c.dim('  [1]')} Daemon (recommended — survives terminal close)\n` +
            `  ${c.dim('  [2]')} Foreground (stops when terminal closes)\n` +
            `  Choose [1/2] (default 1): `,
            [
                { key: '1', label: 'daemon', aliases: ['d', 'daemon', ''] },
                { key: '2', label: 'foreground', aliases: ['f', 'fg', 'foreground'] },
            ],
        );
        useDaemon = modeChoice?.key !== '2';
    }

    // Step 3: Summary
    console.log('');
    console.log(`  ${c.info('[Setup]')} Configuration:`);
    console.log(`          Port:  ${c.bright(String(port))}`);
    if (process.platform === 'linux') {
        console.log(`          Mode:  ${c.bright(useDaemon ? 'Daemon (background)' : 'Foreground')}`);
    }
    console.log('');

    markSetupComplete({ port, mode: useDaemon ? 'daemon' : 'foreground' });

    return { port, useDaemon };
}

export async function postStartupGuidance(port) {
    const effectivePort = Number(port) || DEFAULT_PORT;
    const url = `http://localhost:${effectivePort}`;

    printReady(effectivePort);

    // Try to open browser
    const opened = openBrowser(url);
    if (opened) {
        console.log(`  ${c.ok('[OK]')}   Opening browser...`);
    } else {
        console.log(`  ${c.tip('[TIP]')}  Open ${c.bright(url)} in your browser to start using Pixcode.`);
    }

    console.log(`  ${c.dim('Tip: Run "pixcode status" to see full configuration.')}`);
    console.log('');
}

export { isFirstRun, isPortAvailable, findAvailablePort, openBrowser, waitForServerReady, isPortOpen };
