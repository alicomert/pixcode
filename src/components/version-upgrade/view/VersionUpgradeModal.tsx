import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { authenticatedFetch } from "../../../utils/api";
import { ReleaseInfo } from "../../../types/sharedTypes";
import { copyTextToClipboard } from "../../../utils/clipboard";
import type { InstallMode } from "../../../hooks/useVersionCheck";
import { IS_PLATFORM } from "../../../constants/config";
import { useGsapEntrance } from "../../../lib/animations";

interface VersionUpgradeModalProps {
    isOpen: boolean;
    onClose: () => void;
    releaseInfo: ReleaseInfo | null;
    currentVersion: string;
    latestVersion: string | null;
    installMode: InstallMode;
}

const RELOAD_COUNTDOWN_START = 30;
const HEALTH_POLL_TIMEOUT_MS = 60_000;
const HEALTH_POLL_INTERVAL_MS = 1500;

type DoneEvent = {
    success: boolean;
    error?: string;
    version?: string;
    message?: string;
};

type RestartPhase = 'idle' | 'restarting' | 'waiting' | 'ready' | 'timeout' | 'error';

export function VersionUpgradeModal({
    isOpen,
    onClose,
    releaseInfo,
    currentVersion,
    latestVersion,
    installMode
}: VersionUpgradeModalProps) {
    const { t } = useTranslation('common');
    const upgradeCommand = installMode === 'npm'
        ? t('versionUpdate.npmUpgradeCommand')
        : IS_PLATFORM
            ? 'npm run update:platform'
            : 'git checkout main && git pull && npm install';
    const [isUpdating, setIsUpdating] = useState(false);
    const [updateOutput, setUpdateOutput] = useState('');
    const [updateError, setUpdateError] = useState('');
    const [reloadCountdown, setReloadCountdown] = useState<number | null>(null);
    const [restartPhase, setRestartPhase] = useState<RestartPhase>('idle');
    const outputRef = useRef<HTMLDivElement>(null);
    const modalRef = useRef<HTMLDivElement>(null);
    useGsapEntrance(modalRef, 'modal');

    // Auto-scroll the log pane as new output streams in.
    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [updateOutput]);

    useEffect(() => {
        if (!IS_PLATFORM || reloadCountdown === null || reloadCountdown <= 0) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setReloadCountdown((previousCountdown) => {
                if (previousCountdown === null) {
                    return null;
                }

                return Math.max(previousCountdown - 1, 0);
            });
        }, 1000);

        return () => window.clearTimeout(timeoutId);
    }, [reloadCountdown]);

    const appendOutput = useCallback((chunk: string) => {
        setUpdateOutput(prev => prev + chunk);
    }, []);

    const pollHealthUntilReady = useCallback(async (): Promise<boolean> => {
        const deadline = Date.now() + HEALTH_POLL_TIMEOUT_MS;
        // Give the server a moment to actually exit before we start polling.
        await new Promise(resolve => setTimeout(resolve, 1000));
        while (Date.now() < deadline) {
            try {
                const response = await fetch('/health', { cache: 'no-store' });
                if (response.ok) {
                    // Confirm we can parse the payload too.
                    await response.json();
                    return true;
                }
            } catch {
                // Server still down — keep polling.
            }
            await new Promise(resolve => setTimeout(resolve, HEALTH_POLL_INTERVAL_MS));
        }
        return false;
    }, []);

    const triggerRestart = useCallback(async () => {
        setRestartPhase('restarting');
        appendOutput('\nRestarting server...\n');
        try {
            const response = await authenticatedFetch('/api/system/restart', { method: 'POST' });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || `Restart request failed (HTTP ${response.status})`);
            }
        } catch (error: any) {
            appendOutput(`\n⚠️ Restart request failed: ${error.message}\n`);
            appendOutput('Please restart the server manually, then refresh this page.\n');
            setRestartPhase('error');
            return;
        }

        setRestartPhase('waiting');
        const isBack = await pollHealthUntilReady();
        if (isBack) {
            appendOutput('\n✅ Server is back online. Reloading...\n');
            setRestartPhase('ready');
            setTimeout(() => window.location.reload(), 800);
        } else {
            appendOutput('\n⚠️ Server did not come back within 60s.\n');
            appendOutput('Start it again manually (e.g. `pixcode` or your daemon/pm2), then refresh.\n');
            setRestartPhase('timeout');
        }
    }, [appendOutput, pollHealthUntilReady]);

    const streamUpdate = useCallback(async (): Promise<DoneEvent> => {
        const response = await authenticatedFetch('/api/system/update', { method: 'POST' });
        if (!response.ok || !response.body) {
            throw new Error(`Update request failed (HTTP ${response.status})`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let doneEvent: DoneEvent | null = null;

        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            for (;;) {
                const sepIdx = buffer.indexOf('\n\n');
                if (sepIdx === -1) break;
                const raw = buffer.slice(0, sepIdx);
                buffer = buffer.slice(sepIdx + 2);

                let eventName = 'message';
                const dataLines: string[] = [];
                for (const line of raw.split('\n')) {
                    if (line.startsWith(':')) continue; // comment/heartbeat
                    if (line.startsWith('event: ')) eventName = line.slice(7).trim();
                    else if (line.startsWith('data: ')) dataLines.push(line.slice(6));
                }
                if (dataLines.length === 0) continue;

                try {
                    const parsed = JSON.parse(dataLines.join('\n'));
                    if (eventName === 'log' && typeof parsed.chunk === 'string') {
                        appendOutput(parsed.chunk);
                    } else if (eventName === 'done') {
                        doneEvent = parsed as DoneEvent;
                    }
                } catch {
                    // Ignore malformed frames.
                }
            }
        }

        if (!doneEvent) {
            throw new Error('Update stream ended without completion event');
        }
        return doneEvent;
    }, [appendOutput]);

    const handleUpdateNow = useCallback(async () => {
        setIsUpdating(true);
        setUpdateOutput('Starting update...\n');
        setReloadCountdown(IS_PLATFORM ? RELOAD_COUNTDOWN_START : null);
        setUpdateError('');
        setRestartPhase('idle');

        try {
            const result = await streamUpdate();
            if (result.success) {
                appendOutput('\n✅ Update completed successfully!\n');
                setIsUpdating(false);
                await triggerRestart();
            } else {
                const msg = result.error || 'Update failed';
                setUpdateError(msg);
                appendOutput(`\n❌ Update failed: ${msg}\n`);
                setIsUpdating(false);
            }
        } catch (error: any) {
            setUpdateError(error.message);
            appendOutput(`\n❌ Update failed: ${error.message}\n`);
            setIsUpdating(false);
        }
    }, [appendOutput, streamUpdate, triggerRestart]);

    if (!isOpen) return null;

    const isBusy = isUpdating || restartPhase === 'restarting' || restartPhase === 'waiting';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <button
                className="fixed inset-0 bg-black/50 backdrop-blur-sm"
                onClick={isBusy ? undefined : onClose}
                aria-label={t('versionUpdate.ariaLabels.closeModal')}
                disabled={isBusy}
            />

            {/* Modal */}
            <div
                ref={modalRef}
                className="relative mx-4 max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-800"
            >
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                            <svg className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('versionUpdate.title')}</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {releaseInfo?.title || t('versionUpdate.newVersionReady')}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isBusy}
                        className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                    >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Version Info */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('versionUpdate.currentVersion')}</span>
                        <span className="font-mono text-sm text-gray-900 dark:text-white">{currentVersion}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-700 dark:bg-blue-900/20">
                        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">{t('versionUpdate.latestVersion')}</span>
                        <span className="font-mono text-sm text-blue-900 dark:text-blue-100">{latestVersion}</span>
                    </div>
                </div>

                {/* Changelog */}
                {releaseInfo?.body && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-medium text-gray-900 dark:text-white">{t('versionUpdate.whatsNew')}</h3>
                            {releaseInfo?.htmlUrl && (
                                <a
                                    href={releaseInfo.htmlUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                                >
                                    {t('versionUpdate.viewFullRelease')}
                                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                </a>
                            )}
                        </div>
                        <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-700/50">
                            <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm text-gray-700 dark:prose-invert dark:text-gray-300">
                                {cleanChangelog(releaseInfo.body)}
                            </div>
                        </div>
                    </div>
                )}

                {/* Update Output */}
                {(updateOutput || updateError) && (
                    <div className="space-y-2">
                        <h3 className="text-sm font-medium text-gray-900 dark:text-white">{t('versionUpdate.updateProgress')}</h3>
                        <div
                            ref={outputRef}
                            className="max-h-48 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 p-4 dark:bg-gray-950"
                        >
                            <pre className="whitespace-pre-wrap font-mono text-xs text-green-400">{updateOutput}</pre>
                        </div>
                        {restartPhase === 'waiting' && (
                            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
                                Waiting for server to come back online... this can take up to a minute.
                            </div>
                        )}
                        {restartPhase === 'timeout' && (
                            <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800 dark:border-yellow-900/40 dark:bg-yellow-900/20 dark:text-yellow-200">
                                Server did not restart automatically. Start it again (daemon/pm2/your wrapper) and refresh the page.
                            </div>
                        )}
                        {IS_PLATFORM && reloadCountdown !== null && restartPhase === 'idle' && (
                            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
                                {reloadCountdown === 0
                                    ? 'Refresh the page now. If that doesn\'t work, RESTART the environment.'
                                    : `Refresh the page in ${reloadCountdown} ${reloadCountdown === 1 ? 'second' : 'seconds'}. If that doesn\'t work, RESTART the environment.`}
                            </div>
                        )}
                        {updateError && (
                            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
                                {updateError}
                            </div>
                        )}
                    </div>
                )}

                {/* Upgrade Instructions */}
                {!isUpdating && !updateOutput && (
                    <div className="space-y-3">
                        <h3 className="text-sm font-medium text-gray-900 dark:text-white">{t('versionUpdate.manualUpgrade')}</h3>
                        <div className="rounded-lg border bg-gray-100 p-3 dark:bg-gray-800">
                            <code className="font-mono text-sm text-gray-800 dark:text-gray-200">
                                {upgradeCommand}
                            </code>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                            {t('versionUpdate.manualUpgradeHint')}
                        </p>
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                    <button
                        onClick={onClose}
                        disabled={isBusy}
                        className="flex-1 rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                    >
                        {updateOutput ? t('versionUpdate.buttons.close') : t('versionUpdate.buttons.later')}
                    </button>
                    {(restartPhase === 'timeout' || restartPhase === 'error') && (
                        <button
                            onClick={() => window.location.reload()}
                            className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                        >
                            Refresh page
                        </button>
                    )}
                    {!updateOutput && (
                        <>
                            <button
                                onClick={() => copyTextToClipboard(upgradeCommand)}
                                className="flex-1 rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                            >
                                {t('versionUpdate.buttons.copyCommand')}
                            </button>
                            <button
                                onClick={handleUpdateNow}
                                disabled={isUpdating}
                                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
                            >
                                {isUpdating ? (
                                    <>
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                        {t('versionUpdate.buttons.updating')}
                                    </>
                                ) : (
                                    t('versionUpdate.buttons.updateNow')
                                )}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// Clean up changelog by removing GitHub-specific metadata
const cleanChangelog = (body: string) => {
    if (!body) return '';

    return body
        // Remove full commit hashes (40 character hex strings)
        .replace(/\b[0-9a-f]{40}\b/gi, '')
        // Remove short commit hashes (7-10 character hex strings at start of line or after dash/space)
        .replace(/(?:^|\s|-)([0-9a-f]{7,10})\b/gi, '')
        // Remove "Full Changelog" links
        .replace(/\*\*Full Changelog\*\*:.*$/gim, '')
        // Remove compare links (e.g., https://github.com/.../compare/v1.0.0...v1.0.1)
        .replace(/https?:\/\/github\.com\/[^\/]+\/[^\/]+\/compare\/[^\s)]+/gi, '')
        // Clean up multiple consecutive empty lines
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        // Trim whitespace
        .trim();
};
