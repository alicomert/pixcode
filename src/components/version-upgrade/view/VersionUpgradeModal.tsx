import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { authenticatedFetch } from "../../../utils/api";
import { ReleaseInfo } from "../../../types/sharedTypes";
import { copyTextToClipboard } from "../../../utils/clipboard";
import type { InstallMode } from "../../../hooks/useVersionCheck";
import { IS_PLATFORM } from "../../../constants/config";
import { useGsapEntrance } from "../../../lib/animations";
import { stripIssueProgressBlock } from "../utils/releaseIssueProgress";

import { ReleaseIssueProgress } from "./ReleaseIssueProgress";

interface VersionUpgradeModalProps {
    isOpen: boolean;
    onClose: () => void;
    releaseInfo: ReleaseInfo | null;
    currentVersion: string;
    latestVersion: string | null;
    nodeVersion: string | null;
    installMode: InstallMode;
    isUpdateAvailable?: boolean;
}

const RELOAD_COUNTDOWN_START = 30;
// systemd reinstall after npm -g can take >60s on slow VPS (native rebuilds).
const HEALTH_POLL_TIMEOUT_MS = 120_000;
const HEALTH_POLL_INTERVAL_MS = 1500;
const MIN_NODE_MAJOR = 20;

function isNodeVersionSupported(v: string | null): boolean {
    if (!v) return true; // unknown, assume ok
    const match = v.match(/^v(\d+)\./);
    if (!match) return true;
    return parseInt(match[1], 10) >= MIN_NODE_MAJOR;
}

type DoneEvent = {
    success: boolean;
    error?: string;
    version?: string;
    message?: string;
    /** Server exited on its own after the swap (desktop-wrapper runtime-dir
     *  path). UI must NOT POST /api/system/restart — just wait for health
     *  to come back and reload. */
    selfRestarting?: boolean;
    alreadyLatest?: boolean;
};

type UpdateJob = {
    id: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
    toVersion?: string | null;
    alreadyLatest?: boolean;
    pendingRestart?: boolean;
    selfRestarting?: boolean;
    error?: string | null;
    logs?: Array<{ stream: string; chunk: string; timestamp?: string }>;
};

type ActiveWorkSummary = {
    hasActiveWork: boolean;
    total: number;
    pty?: {
        total: number;
        connected?: number;
        detached?: number;
        byProvider?: Record<string, number>;
    };
    agents?: {
        total: number;
        byProvider?: Record<string, number>;
    };
};

type UpdateStatePayload = {
    state?: {
        pendingRestart?: {
            jobId?: string;
            toVersion?: string;
        } | null;
        lastAppliedUpdate?: {
            toVersion?: string;
        } | null;
    };
    activeJob?: UpdateJob | null;
    activeWork?: ActiveWorkSummary | null;
};

type RestartPhase = 'idle' | 'restarting' | 'waiting' | 'ready' | 'timeout' | 'error';

const formatActiveWorkSummary = (activeWork?: ActiveWorkSummary | null) => {
    if (!activeWork?.hasActiveWork) return '';
    const parts = [];
    if (activeWork.pty?.total) {
        parts.push(`${activeWork.pty.total} terminal${activeWork.pty.total === 1 ? '' : 's'}`);
    }
    if (activeWork.agents?.total) {
        parts.push(`${activeWork.agents.total} agent run${activeWork.agents.total === 1 ? '' : 's'}`);
    }
    return parts.join(' and ') || `${activeWork.total} active task${activeWork.total === 1 ? '' : 's'}`;
};

export function VersionUpgradeModal({
    isOpen,
    onClose,
    releaseInfo,
    currentVersion,
    latestVersion,
    nodeVersion,
    isUpdateAvailable = true,
}: VersionUpgradeModalProps) {
    const { t } = useTranslation('common');
    const upgradeCommand = IS_PLATFORM
        ? 'npm run update:platform'
        : t('versionUpdate.pixcodeUpgradeCommand');
    const [isUpdating, setIsUpdating] = useState(false);
    const [updateOutput, setUpdateOutput] = useState('');
    const [updateError, setUpdateError] = useState('');
    const [reloadCountdown, setReloadCountdown] = useState<number | null>(null);
    const [restartPhase, setRestartPhase] = useState<RestartPhase>('idle');
    const [pendingRestartVersion, setPendingRestartVersion] = useState<string | null>(null);
    const [activeRestartWork, setActiveRestartWork] = useState<ActiveWorkSummary | null>(null);
    const [restartRequiresConfirmation, setRestartRequiresConfirmation] = useState(false);
    const outputRef = useRef<HTMLDivElement>(null);
    const modalRef = useRef<HTMLDivElement>(null);
    const pollingJobIdRef = useRef<string | null>(null);
    useGsapEntrance(modalRef, 'modal');
    const showUpdateActions = Boolean(isUpdateAvailable && latestVersion);
    const nodeVersionOk = isNodeVersionSupported(nodeVersion);
    const nodeVersionWarning = !nodeVersionOk && nodeVersion
        ? `Node.js ${nodeVersion} detected. Pixcode requires Node.js ${MIN_NODE_MAJOR}+. Update may fail.`
        : null;

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

    useEffect(() => {
        if (!isOpen) return;
        setUpdateOutput('');
        setUpdateError('');
        setReloadCountdown(null);
        setRestartPhase('idle');
        setPendingRestartVersion(null);
        setActiveRestartWork(null);
        setRestartRequiresConfirmation(false);
        pollingJobIdRef.current = null;
    }, [currentVersion, isOpen, latestVersion]);

    const pollHealthUntilReady = useCallback(async (expectedVersion?: string | null): Promise<boolean> => {
        const deadline = Date.now() + HEALTH_POLL_TIMEOUT_MS;
        let sawDown = false;
        // Give the server a moment to actually exit before we start polling.
        await new Promise(resolve => setTimeout(resolve, 1500));
        while (Date.now() < deadline) {
            try {
                const response = await fetch('/health', { cache: 'no-store' });
                if (response.ok) {
                    const payload = await response.json().catch(() => null) as { version?: string; status?: string } | null;
                    const version = payload?.version;
                    // After downtime, accept any healthy server — npm may land a
                    // slightly different version than the UI expected (registry lag).
                    if (!expectedVersion || version === expectedVersion || (sawDown && payload?.status === 'ok')) {
                        return true;
                    }
                    // Still up on old binary (hasn't exited yet) — keep waiting.
                } else {
                    sawDown = true;
                }
            } catch {
                // Server still down — keep polling.
                sawDown = true;
            }
            await new Promise(resolve => setTimeout(resolve, HEALTH_POLL_INTERVAL_MS));
        }
        return false;
    }, []);

    const triggerRestart = useCallback(async () => {
        const forceRestart = restartRequiresConfirmation;
        setRestartPhase('restarting');
        appendOutput(forceRestart
            ? '\nRestarting server and interrupting active sessions...\n'
            : '\nRestarting server...\n');
        try {
            const response = await authenticatedFetch('/api/system/restart', {
                method: 'POST',
                body: JSON.stringify({ force: forceRestart }),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                if (response.status === 409 && data.activeWork) {
                    const summary = formatActiveWorkSummary(data.activeWork);
                    setActiveRestartWork(data.activeWork);
                    setRestartRequiresConfirmation(true);
                    setRestartPhase('ready');
                    appendOutput(`\n⚠️ Restart paused: ${summary || 'active work'} will be interrupted.\n`);
                    appendOutput('Click "Restart anyway" to apply the update now, or close this modal and keep working.\n');
                    return;
                }
                throw new Error(data.error || `Restart request failed (HTTP ${response.status})`);
            }
        } catch (error: any) {
            appendOutput(`\n⚠️ Restart request failed: ${error.message}\n`);
            appendOutput('Please restart the server manually, then refresh this page.\n');
            setRestartPhase('error');
            return;
        }

        setActiveRestartWork(null);
        setRestartRequiresConfirmation(false);
        setRestartPhase('waiting');
        const isBack = await pollHealthUntilReady(pendingRestartVersion || latestVersion);
        if (isBack) {
            appendOutput('\n✅ Server is back online. Reloading...\n');
            setRestartPhase('ready');
            setTimeout(() => window.location.reload(), 800);
        } else {
            appendOutput(`\n⚠️ Server did not come back within ${HEALTH_POLL_TIMEOUT_MS / 1000}s.\n`);
            appendOutput('Start it again manually: `pixcode daemon install --mode system --port 3001 --single-port` then refresh.\n');
            setRestartPhase('timeout');
        }
    }, [appendOutput, latestVersion, pendingRestartVersion, pollHealthUntilReady, restartRequiresConfirmation]);

    const pollUpdateJob = useCallback(async (
        initialJob: UpdateJob,
        {
            announce = true,
            isCancelled,
        }: {
            announce?: boolean;
            isCancelled?: () => boolean;
        } = {},
    ): Promise<DoneEvent> => {
        let job = initialJob;
        pollingJobIdRef.current = job.id;
        if (announce) {
            appendOutput(`Background update job started: ${job.id}\n`);
        }
        let seenLogs = 0;

        for (;;) {
            if (isCancelled?.()) {
                throw new Error('Update polling cancelled');
            }

            const logs = Array.isArray(job.logs) ? job.logs : [];
            if (seenLogs > logs.length) {
                seenLogs = 0;
            }
            for (const entry of logs.slice(seenLogs)) {
                appendOutput(entry.chunk || '');
            }
            seenLogs = logs.length;

            if (job.status === 'completed') {
                if (pollingJobIdRef.current === job.id) {
                    pollingJobIdRef.current = null;
                }
                const selfRestarting = Boolean(job.selfRestarting);
                return {
                    success: true,
                    version: job.toVersion || latestVersion || undefined,
                    alreadyLatest: Boolean(job.alreadyLatest),
                    selfRestarting,
                    message: selfRestarting
                        ? 'Update applied. Waiting for the app to restart…'
                        : job.pendingRestart
                            ? 'Update is ready. Restart when convenient to apply it.'
                            : 'Update completed.',
                };
            }

            if (job.status === 'failed') {
                if (pollingJobIdRef.current === job.id) {
                    pollingJobIdRef.current = null;
                }
                return {
                    success: false,
                    error: job.error || 'Update failed',
                };
            }

            await new Promise(resolve => setTimeout(resolve, 1500));
            if (isCancelled?.()) {
                throw new Error('Update polling cancelled');
            }
            const statusResponse = await authenticatedFetch(`/api/system/update-jobs/${encodeURIComponent(job.id)}`, {
                cache: 'no-store',
            });
            const statusPayload = await statusResponse.json().catch(() => null) as { job?: UpdateJob; error?: string } | null;
            if (!statusResponse.ok || !statusPayload?.job) {
                throw new Error(statusPayload?.error || `Update job status failed (HTTP ${statusResponse.status})`);
            }
            job = statusPayload.job;
        }
    }, [appendOutput, latestVersion]);

    const streamUpdate = useCallback(async (): Promise<DoneEvent> => {
        const startResponse = await authenticatedFetch('/api/system/update-jobs', {
            method: 'POST',
            body: JSON.stringify({ targetVersion: latestVersion }),
        });
        const startPayload = await startResponse.json().catch(() => null) as { job?: UpdateJob; error?: string } | null;
        if (!startResponse.ok || !startPayload?.job) {
            throw new Error(startPayload?.error || `Update job request failed (HTTP ${startResponse.status})`);
        }

        return pollUpdateJob(startPayload.job);
    }, [latestVersion, pollUpdateJob]);

    const waitForServerBackOnline = useCallback(async () => {
        // Skip the POST /api/system/restart step — the server already
        // exited on its own. Poll /health and reload when it's back.
        setRestartPhase('waiting');
        appendOutput('\nWaiting for the server to restart…\n');
        const isBack = await pollHealthUntilReady();
        if (isBack) {
            appendOutput('\n✅ Server is back online. Reloading page…\n');
            setRestartPhase('ready');
            window.setTimeout(() => window.location.reload(), 600);
        } else {
            appendOutput(`\n⚠️ Server didn't come back within ${HEALTH_POLL_TIMEOUT_MS / 1000}s.\n`);
            appendOutput('Refresh the page manually — the update is already on disk.\n');
            setRestartPhase('timeout');
        }
    }, [appendOutput, pollHealthUntilReady]);

    const finishUpdateResult = useCallback(async (result: DoneEvent) => {
        if (!result.success) {
            const msg = result.error || 'Update failed';
            setUpdateError(msg);
            appendOutput(`\n❌ Update failed: ${msg}\n`);
            setIsUpdating(false);
            return;
        }

        if (result.alreadyLatest) {
            appendOutput('\n✅ Already on the latest version — nothing to do.\n');
            setIsUpdating(false);
            return;
        }

        if (result.version) {
            appendOutput(`\n✅ Updated to ${result.version}!\n`);
        } else {
            appendOutput('\n✅ Update completed successfully!\n');
        }
        setIsUpdating(false);
        setActiveRestartWork(null);
        setRestartRequiresConfirmation(false);

        if (result.selfRestarting) {
            await waitForServerBackOnline();
            return;
        }

        setPendingRestartVersion(result.version || latestVersion || null);
        setRestartPhase('ready');
        appendOutput('\nUpdate is ready. You can keep using Pixcode and restart when convenient.\n');
    }, [appendOutput, latestVersion, waitForServerBackOnline]);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;

        const loadUpdateState = async () => {
            try {
                const response = await authenticatedFetch('/api/system/update-state', { cache: 'no-store' });
                const payload = (response.ok ? await response.json() : null) as UpdateStatePayload | null;
                if (cancelled || !payload) return;

                const pending = payload.state?.pendingRestart;
                if (pending?.toVersion) {
                    setPendingRestartVersion(pending.toVersion);
                    setActiveRestartWork(payload.activeWork ?? null);
                    setRestartRequiresConfirmation(false);
                    setRestartPhase('ready');
                    setUpdateOutput(`Update to ${pending.toVersion} is ready. Restart when convenient to apply it.\n`);
                    return;
                }

                const activeJob = payload.activeJob;
                if (activeJob && (activeJob.status === 'queued' || activeJob.status === 'running')) {
                    if (pollingJobIdRef.current === activeJob.id) return;
                    setIsUpdating(true);
                    setUpdateError('');
                    setReloadCountdown(IS_PLATFORM ? RELOAD_COUNTDOWN_START : null);
                    setRestartPhase('idle');
                    setPendingRestartVersion(null);
                    setActiveRestartWork(null);
                    setRestartRequiresConfirmation(false);
                    setUpdateOutput(`Reconnected to background update job: ${activeJob.id}\n`);
                    const result = await pollUpdateJob(activeJob, {
                        announce: false,
                        isCancelled: () => cancelled,
                    });
                    if (!cancelled) {
                        await finishUpdateResult(result);
                    }
                    return;
                }

                const applied = payload.state?.lastAppliedUpdate;
                if (applied?.toVersion === currentVersion && !isUpdateAvailable) {
                    setUpdateOutput(`Pixcode was updated to ${applied.toVersion}.\n`);
                }
            } catch (error) {
                if (!cancelled && (error as Error).message !== 'Update polling cancelled') {
                    // Non-fatal; release modal still works from GitHub metadata.
                }
                if (cancelled) {
                    pollingJobIdRef.current = null;
                }
            }
        };

        void loadUpdateState();

        return () => {
            cancelled = true;
        };
    }, [currentVersion, finishUpdateResult, isOpen, isUpdateAvailable, pollUpdateJob]);

    const handleUpdateNow = useCallback(async () => {
        if (!nodeVersionOk && nodeVersion) {
            const proceed = window.confirm(
                `Node.js ${nodeVersion} is too old. Pixcode requires Node.js ${MIN_NODE_MAJOR}+.\n\nThe update may fail. Continue anyway?`
            );
            if (!proceed) return;
        }
        setIsUpdating(true);
        setUpdateOutput('Starting update…\n');
        setReloadCountdown(IS_PLATFORM ? RELOAD_COUNTDOWN_START : null);
        setUpdateError('');
        setRestartPhase('idle');
        setActiveRestartWork(null);
        setRestartRequiresConfirmation(false);

        try {
            const result = await streamUpdate();
            await finishUpdateResult(result);
        } catch (error: any) {
            pollingJobIdRef.current = null;
            setUpdateError(error.message);
            appendOutput(`\n❌ Update failed: ${error.message}\n`);
            setIsUpdating(false);
        }
    }, [appendOutput, finishUpdateResult, nodeVersion, nodeVersionOk, streamUpdate]);

    if (!isOpen) return null;

    const isBusy = restartPhase === 'restarting' || restartPhase === 'waiting';

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
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                {isUpdateAvailable
                                    ? t('versionUpdate.title')
                                    : t('versionUpdate.releaseNotesTitle', { defaultValue: 'Release Notes' })}
                            </h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {releaseInfo?.title || (isUpdateAvailable
                                    ? t('versionUpdate.newVersionReady')
                                    : t('versionUpdate.releaseNotesSubtitle', { defaultValue: 'Latest Pixcode changes' }))}
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
                        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                            {isUpdateAvailable
                                ? t('versionUpdate.latestVersion')
                                : t('versionUpdate.latestRelease', { defaultValue: 'Latest Release' })}
                        </span>
                        <span className="font-mono text-sm text-blue-900 dark:text-blue-100">{latestVersion || currentVersion}</span>
                    </div>
                    {nodeVersion && (
                        <div className={`flex items-center justify-between rounded-lg p-3 ${
                            nodeVersionOk
                                ? 'bg-gray-50 dark:bg-gray-700/50'
                                : 'border border-yellow-200 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-900/20'
                        }`}>
                            <span className={`text-sm font-medium ${
                                nodeVersionOk
                                    ? 'text-gray-700 dark:text-gray-300'
                                    : 'text-yellow-800 dark:text-yellow-200'
                            }`}>
                                Node.js {nodeVersionOk ? '' : '(unsupported) '}Version
                            </span>
                            <span className={`font-mono text-sm ${
                                nodeVersionOk
                                    ? 'text-gray-900 dark:text-white'
                                    : 'text-yellow-900 dark:text-yellow-100'
                            }`}>
                                {nodeVersion}
                                {!nodeVersionOk && <span className="ml-2 text-xs">(min: v{MIN_NODE_MAJOR})</span>}
                            </span>
                        </div>
                    )}
                    {nodeVersionWarning && (
                        <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800 dark:border-yellow-900/40 dark:bg-yellow-900/20 dark:text-yellow-200">
                            {nodeVersionWarning}
                        </div>
                    )}
                </div>

                <ReleaseIssueProgress
                    releaseBody={releaseInfo?.body || ''}
                    version={latestVersion || currentVersion}
                />

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
                        {restartPhase === 'ready' && (
                            <div className={`rounded-md border px-3 py-2 text-xs ${
                                restartRequiresConfirmation
                                    ? 'border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-900/40 dark:bg-yellow-900/20 dark:text-yellow-200'
                                    : 'border-green-200 bg-green-50 text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-200'
                            }`}>
                                {restartRequiresConfirmation
                                    ? `Restart will interrupt ${formatActiveWorkSummary(activeRestartWork) || 'active terminal or agent sessions'}.`
                                    : `Update is ready. Keep working, or restart now to apply ${pendingRestartVersion || latestVersion || 'the new version'}.`}
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
                {showUpdateActions && !isUpdating && (updateError || !updateOutput) && restartPhase !== 'ready' && (
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
                        {updateOutput || !showUpdateActions
                            ? t('versionUpdate.buttons.close')
                            : t('versionUpdate.buttons.later')}
                    </button>
                    {(restartPhase === 'timeout' || restartPhase === 'error') && (
                        <button
                            onClick={() => window.location.reload()}
                            className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                        >
                            Refresh page
                        </button>
                    )}
                    {restartPhase === 'ready' && (
                        <button
                            onClick={triggerRestart}
                            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors ${
                                restartRequiresConfirmation
                                    ? 'bg-yellow-600 hover:bg-yellow-700'
                                    : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                        >
                            {restartRequiresConfirmation ? 'Restart anyway' : 'Restart now'}
                        </button>
                    )}
                    {showUpdateActions && (!updateOutput || updateError) && restartPhase !== 'ready' && (
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

    return stripIssueProgressBlock(body)
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
