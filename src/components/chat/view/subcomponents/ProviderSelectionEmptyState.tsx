import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Download, Loader2, Lock, RefreshCw, X } from "@/lib/icons";
import { useTranslation } from "react-i18next";

import { useServerPlatform } from "../../../../hooks/useServerPlatform";
import { useProviderModels } from "../../../../hooks/useProviderModels";
import { useProviderAuthStatus } from "../../../provider-auth/hooks/useProviderAuthStatus";
import { PROVIDER_INSTALL_COMMANDS } from "../../../provider-auth/types";
import { authenticatedFetch } from "../../../../utils/api";
import SessionProviderLogo from "../../../llm-logo-provider/SessionProviderLogo";
import {
  CLAUDE_MODELS,
  CURSOR_MODELS,
  CODEX_MODELS,
  GEMINI_MODELS,
  QWEN_MODELS,
} from "../../../../../shared/modelConstants";
import type { ProjectSession, LLMProvider } from "../../../../types/app";
import { NextTaskBanner } from "../../../task-master";
import { cn } from "../../../../lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "../../../../shared/view/ui";

type ProviderSelectionEmptyStateProps = {
  selectedSession: ProjectSession | null;
  currentSessionId: string | null;
  provider: LLMProvider;
  setProvider: (next: LLMProvider) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  claudeModel: string;
  setClaudeModel: (model: string) => void;
  cursorModel: string;
  setCursorModel: (model: string) => void;
  codexModel: string;
  setCodexModel: (model: string) => void;
  geminiModel: string;
  setGeminiModel: (model: string) => void;
  qwenModel: string;
  setQwenModel: (model: string) => void;
  tasksEnabled: boolean;
  isTaskMasterInstalled: boolean | null;
  onShowAllTasks?: (() => void) | null;
  setInput: React.Dispatch<React.SetStateAction<string>>;
};

type ProviderCard = {
  id: LLMProvider;
  name: string;
  // Tailwind tokens for the active-card accent — kept as two classes so the
  // border and background can be composed independently for light/dark.
  accentBorder: string;
  accentBg: string;
};

const PROVIDER_CARDS: ProviderCard[] = [
  { id: "claude", name: "Claude", accentBorder: "border-blue-500/60", accentBg: "bg-blue-500/5 dark:bg-blue-400/10" },
  { id: "codex", name: "Codex", accentBorder: "border-slate-500/60", accentBg: "bg-slate-500/5 dark:bg-slate-400/10" },
  { id: "cursor", name: "Cursor", accentBorder: "border-purple-500/60", accentBg: "bg-purple-500/5 dark:bg-purple-400/10" },
  { id: "gemini", name: "Gemini", accentBorder: "border-indigo-500/60", accentBg: "bg-indigo-500/5 dark:bg-indigo-400/10" },
  { id: "qwen", name: "Qwen Code", accentBorder: "border-orange-500/60", accentBg: "bg-orange-500/5 dark:bg-orange-400/10" },
];

function getStaticConfig(p: LLMProvider) {
  if (p === "claude") return CLAUDE_MODELS;
  if (p === "codex") return CODEX_MODELS;
  if (p === "gemini") return GEMINI_MODELS;
  if (p === "qwen") return QWEN_MODELS;
  return CURSOR_MODELS;
}

export default function ProviderSelectionEmptyState({
  selectedSession,
  currentSessionId,
  provider,
  setProvider,
  textareaRef,
  claudeModel,
  setClaudeModel,
  cursorModel,
  setCursorModel,
  codexModel,
  setCodexModel,
  geminiModel,
  setGeminiModel,
  qwenModel,
  setQwenModel,
  tasksEnabled,
  isTaskMasterInstalled,
  onShowAllTasks,
  setInput,
}: ProviderSelectionEmptyStateProps) {
  const { t } = useTranslation("chat");
  const { isWindowsServer } = useServerPlatform();
  const { providerAuthStatus, refreshProviderAuthStatuses } = useProviderAuthStatus();

  // Install-dialog state per provider. Clicking a locked card opens the
  // installer inline instead of shunting the user over to Settings — the
  // user already said which CLI they want by tapping the card.
  const [installerFor, setInstallerFor] = useState<LLMProvider | null>(null);

  // Cursor has no cross-platform CLI on Windows servers — hide the card
  // there so users don't try to select something they can't run.
  const visibleCards = useMemo(
    () => (isWindowsServer ? PROVIDER_CARDS.filter((p) => p.id !== "cursor") : PROVIDER_CARDS),
    [isWindowsServer],
  );

  useEffect(() => {
    if (isWindowsServer && provider === "cursor") {
      setProvider("claude");
      localStorage.setItem("selected-provider", "claude");
    }
  }, [isWindowsServer, provider, setProvider]);

  // Pull install status for every provider once on mount so we can grey
  // out cards for CLIs that aren't on the host.
  useEffect(() => {
    void refreshProviderAuthStatuses();
  }, [refreshProviderAuthStatuses]);

  // If the currently-active provider turns out to be uninstalled, bounce
  // the selection to the first installed one so the composer isn't stuck
  // pointing at a dead CLI.
  useEffect(() => {
    const status = providerAuthStatus[provider];
    if (status && status.installed === false) {
      const firstInstalled = PROVIDER_CARDS.find(
        (c) => providerAuthStatus[c.id]?.installed === true,
      );
      if (firstInstalled) {
        setProvider(firstInstalled.id);
        localStorage.setItem("selected-provider", firstInstalled.id);
      }
    }
  }, [provider, providerAuthStatus, setProvider]);

  // Currently-selected model per provider — plumbed through state props
  // rather than localStorage reads so the cards react to live switches.
  const currentModelByProvider = useMemo<Record<LLMProvider, string>>(
    () => ({
      claude: claudeModel,
      cursor: cursorModel,
      codex: codexModel,
      gemini: geminiModel,
      qwen: qwenModel,
    }),
    [claudeModel, cursorModel, codexModel, geminiModel, qwenModel],
  );

  const setterByProvider = useCallback(
    (p: LLMProvider, value: string) => {
      if (p === "claude") { setClaudeModel(value); localStorage.setItem("claude-model", value); }
      else if (p === "codex") { setCodexModel(value); localStorage.setItem("codex-model", value); }
      else if (p === "gemini") { setGeminiModel(value); localStorage.setItem("gemini-model", value); }
      else if (p === "qwen") { setQwenModel(value); localStorage.setItem("qwen-model", value); }
      else { setCursorModel(value); localStorage.setItem("cursor-model", value); }
    },
    [setClaudeModel, setCodexModel, setCursorModel, setGeminiModel, setQwenModel],
  );

  // Model picker modal state — only renders for the card the user
  // clicked "Change model" on, so we pull live catalog for just that
  // provider instead of all five.
  const [modelPickerFor, setModelPickerFor] = useState<LLMProvider | null>(null);

  const selectProvider = useCallback(
    (p: LLMProvider) => {
      setProvider(p);
      localStorage.setItem("selected-provider", p);
      setTimeout(() => textareaRef.current?.focus(), 60);
    },
    [setProvider, textareaRef],
  );

  const nextTaskPrompt = t("tasks.nextTaskPrompt", {
    defaultValue: "Start the next task",
  });

  if (!selectedSession && !currentSessionId) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 py-6">
        <div className="w-full max-w-3xl">
          <div className="mb-6 text-center">
            <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              {t("providerSelection.title")}
            </h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {t("providerSelection.description")}
            </p>
          </div>

          {/* Provider card grid — tap a card to select, tap "Change model"
              to swap which model that provider runs. Locked cards
              represent CLIs that aren't on the host; tapping them opens
              the inline installer instead of selecting the provider. */}
          <div className="mx-auto grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {visibleCards.map((card) => {
              const isActive = provider === card.id;
              const currentModel = currentModelByProvider[card.id];
              const config = getStaticConfig(card.id);
              const currentLabel =
                config.OPTIONS.find((o: { value: string; label: string }) => o.value === currentModel)?.label
                ?? currentModel;
              const status = providerAuthStatus[card.id];
              const isUnknown = !status || status.loading || status.installed === null;
              const isLocked = status?.installed === false;

              return (
                <div
                  key={card.id}
                  className={cn(
                    "group relative flex flex-col gap-2 rounded-xl border bg-card p-3 transition-all duration-150",
                    isLocked && "opacity-70",
                    !isLocked && isActive
                      ? `${card.accentBorder} ${card.accentBg} shadow-sm`
                      : "border-border/60 hover:border-border hover:shadow-sm",
                  )}
                >
                  {isLocked && (
                    <div className="pointer-events-none absolute right-2 top-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                      <span className="flex items-center gap-0.5">
                        <Lock className="h-2.5 w-2.5" />
                        {t("providerSelection.notInstalled", { defaultValue: "Install" })}
                      </span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (isLocked) {
                        setInstallerFor(card.id);
                      } else {
                        selectProvider(card.id);
                      }
                    }}
                    className="flex items-center gap-2 text-left"
                    title={
                      isLocked
                        ? t("providerSelection.installHint", {
                            defaultValue: "This CLI isn't installed. Tap to install.",
                          })
                        : undefined
                    }
                  >
                    <SessionProviderLogo
                      provider={card.id}
                      className={cn("h-6 w-6 shrink-0", isLocked && "grayscale")}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {card.name}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {isUnknown
                          ? t("providerSelection.checking", { defaultValue: "Checking…" })
                          : isLocked
                            ? t("providerSelection.needsInstall", { defaultValue: "Not installed" })
                            : currentLabel}
                      </div>
                    </div>
                    {!isLocked && isActive && (
                      <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />
                    )}
                  </button>
                  {isLocked ? (
                    <button
                      type="button"
                      onClick={() => setInstallerFor(card.id)}
                      className="flex items-center justify-center gap-1.5 rounded-md border border-amber-300/70 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-200 dark:hover:bg-amber-900/40"
                    >
                      <Download className="h-3 w-3" />
                      {t("providerSelection.install", { defaultValue: "Install now" })}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setModelPickerFor(card.id)}
                      className="flex items-center justify-between rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                    >
                      <span>{t("providerSelection.changeModel", { defaultValue: "Change model" })}</span>
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {provider && tasksEnabled && isTaskMasterInstalled && (
            <div className="mt-5 flex justify-center">
              <div className="w-full max-w-md">
                <NextTaskBanner
                  onStartTask={() => setInput(nextTaskPrompt)}
                  onShowAllTasks={onShowAllTasks}
                />
              </div>
            </div>
          )}

          {/* Model picker dialog — renders only for the active card */}
          {modelPickerFor && (
            <ModelPickerDialog
              provider={modelPickerFor}
              open={Boolean(modelPickerFor)}
              onOpenChange={(open) => !open && setModelPickerFor(null)}
              currentValue={currentModelByProvider[modelPickerFor]}
              onSelect={(value) => {
                setterByProvider(modelPickerFor, value);
                // If picking a model for a different provider than the
                // currently-active one, also switch provider — feels more
                // natural than "I picked Gemini model but Claude is still
                // selected".
                if (provider !== modelPickerFor) selectProvider(modelPickerFor);
                setModelPickerFor(null);
              }}
              staticFallback={getStaticConfig(modelPickerFor).OPTIONS}
            />
          )}

          {/* Inline installer dialog — opens when the user taps a locked
              provider card. Re-runs refreshProviderAuthStatuses() after a
              successful install so the card unlocks without a reload. */}
          {installerFor && (
            <ProviderInstallDialog
              provider={installerFor}
              open={Boolean(installerFor)}
              onOpenChange={(open) => !open && setInstallerFor(null)}
              onInstalled={async () => {
                // Refresh first so the unlocked state is visible the moment
                // the dialog closes. If the refresh hangs or throws, we still
                // close the dialog and select the provider — the user can
                // manually refresh from Settings if anything is off.
                try { await refreshProviderAuthStatuses(); } catch { /* noop */ }
                const justInstalled = installerFor;
                setInstallerFor(null);
                if (justInstalled) selectProvider(justInstalled);
              }}
              onClose={() => setInstallerFor(null)}
            />
          )}
        </div>
      </div>
    );
  }

  if (selectedSession) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-md px-6 text-center">
          <p className="mb-1.5 text-lg font-semibold text-foreground">
            {t("session.continue.title")}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("session.continue.description")}
          </p>

          {tasksEnabled && isTaskMasterInstalled && (
            <div className="mt-5">
              <NextTaskBanner
                onStartTask={() => setInput(nextTaskPrompt)}
                onShowAllTasks={onShowAllTasks}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}

// ---------- Model picker dialog ----------
/**
 * Renders the live model catalog for one provider with a Refresh button.
 * Falls back to the hardcoded list from shared/modelConstants while the
 * backend discovery is in flight, and surfaces any `error` the backend
 * returned (e.g. "No API key configured") so users understand why the
 * list is shorter than they expected.
 */
function ModelPickerDialog({
  provider,
  open,
  onOpenChange,
  currentValue,
  onSelect,
  staticFallback,
}: {
  provider: LLMProvider;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentValue: string;
  onSelect: (value: string) => void;
  staticFallback: { value: string; label: string }[];
}) {
  const { t } = useTranslation("chat");
  const { models, loading, error, refresh } = useProviderModels(provider, staticFallback);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden p-0">
        <DialogTitle className="sr-only">
          {t("providerSelection.selectModel", { defaultValue: "Select model" })}
        </DialogTitle>
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <div className="flex items-center gap-2">
            <SessionProviderLogo provider={provider} className="h-4 w-4 shrink-0" />
            <span className="text-sm font-semibold text-foreground">
              {provider === "qwen" ? "Qwen Code" : provider[0].toUpperCase() + provider.slice(1)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            title={t("providerSelection.refreshModels", { defaultValue: "Refresh from provider API" })}
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            {t("providerSelection.refresh", { defaultValue: "Refresh" })}
          </button>
        </div>

        <Command>
          <CommandInput
            placeholder={t("providerSelection.searchModels", {
              defaultValue: "Search models...",
            })}
          />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>
              {t("providerSelection.noModelsFound", {
                defaultValue: "No models found.",
              })}
            </CommandEmpty>
            <CommandGroup>
              {models.map((model) => {
                const isSelected = currentValue === model.value;
                return (
                  <CommandItem
                    key={model.value}
                    value={`${model.label} ${model.value}`}
                    onSelect={() => onSelect(model.value)}
                  >
                    <span className="flex-1 truncate">{model.label}</span>
                    {model.source === "api" && (
                      <span className="mr-2 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-emerald-700 dark:text-emerald-300">
                        live
                      </span>
                    )}
                    {isSelected && (
                      <Check className="ml-auto h-4 w-4 shrink-0 text-primary" />
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>

        {error && (
          <div className="border-t border-border/60 bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            {error}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- Inline provider install dialog ----------
/**
 * Drives the POST /install → EventSource /install/:jobId/stream flow
 * from inside the provider picker. Kept in-file so it can share the
 * PROVIDER_CARDS accent colors and so the user never leaves the chat
 * surface mid-onboarding.
 */
type InstallDialogState = "idle" | "running" | "done" | "error";

function ProviderInstallDialog({
  provider,
  open,
  onOpenChange,
  onInstalled,
  onClose,
}: {
  provider: LLMProvider;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstalled: () => void | Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation("chat");
  const [state, setState] = useState<InstallDialogState>("idle");
  const [log, setLog] = useState("");
  const [error, setError] = useState<string | null>(null);
  const esRef = React.useRef<EventSource | null>(null);
  const jobIdRef = React.useRef<string | null>(null);
  const displayCommand = PROVIDER_INSTALL_COMMANDS[provider];

  useEffect(() => {
    return () => {
      try { esRef.current?.close(); } catch { /* noop */ }
    };
  }, []);

  // Reset when the dialog re-opens for a different provider so the
  // previous transcript doesn't bleed into the new session.
  useEffect(() => {
    if (open) {
      setState("idle");
      setLog("");
      setError(null);
    }
  }, [open, provider]);

  const start = useCallback(async () => {
    setState("running");
    setLog("");
    setError(null);
    try { esRef.current?.close(); } catch { /* noop */ }
    esRef.current = null;

    let jobId: string;
    try {
      const response = await authenticatedFetch(`/api/providers/${provider}/install`, {
        method: "POST",
        body: "{}",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.success) {
        throw new Error(body?.error || `HTTP ${response.status}`);
      }
      jobId = body.data?.jobId;
      if (!jobId) throw new Error("Server did not return a job id");
      jobIdRef.current = jobId;
    } catch (err: any) {
      setError(err?.message || "Install failed to start");
      setState("error");
      return;
    }

    const token = localStorage.getItem("auth-token") || "";
    const url =
      `/api/providers/${provider}/install/${jobId}/stream`
      + (token ? `?token=${encodeURIComponent(token)}` : "");
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener("log", (evt) => {
      try {
        const payload = JSON.parse((evt as MessageEvent).data);
        if (typeof payload.chunk === "string") {
          setLog((prev) => prev + payload.chunk);
        }
      } catch { /* ignore bad frame */ }
    });

    es.addEventListener("done", (evt) => {
      try {
        const payload = JSON.parse((evt as MessageEvent).data);
        if (payload.success) {
          setState("done");
          setError(null);
          void onInstalled();
        } else {
          setError(payload.error || "Install failed");
          setState("error");
        }
      } catch {
        setError("Install ended with an unreadable status");
        setState("error");
      }
      try { es.close(); } catch { /* noop */ }
      esRef.current = null;
    });

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        // The `done` handler normally transitions state before this fires.
        // If we reach here in a non-terminal state it means the stream
        // was closed without a done event — surface that plainly.
        setError((prev) => prev || "Lost connection to install stream.");
      }
    };
  }, [provider, onInstalled]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg overflow-hidden p-0">
        <DialogTitle className="sr-only">
          {t("providerSelection.installTitle", { defaultValue: "Install provider CLI" })}
        </DialogTitle>

        <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <SessionProviderLogo provider={provider} className="h-5 w-5 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-foreground">
                {provider === "qwen" ? "Qwen Code" : provider[0].toUpperCase() + provider.slice(1)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {t("providerSelection.sandboxHint", {
                  defaultValue: "Installs locally to ~/.pixcode/cli-bin (no sudo).",
                })}
              </div>
            </div>
          </div>
          {/* Explicit close affordance. Dialog primitive also closes on ESC
              or overlay-click, but users reasonably expect an X — especially
              after install where the auto-close may fail (e.g. network blip
              during the auth-status refresh). */}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("providerSelection.close", { defaultValue: "Close" })}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 font-mono text-[11px] text-foreground">
            {displayCommand}
          </div>

          {state === "idle" && (
            <button
              type="button"
              onClick={() => void start()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600"
            >
              <Download className="h-4 w-4" />
              {t("providerSelection.installStart", { defaultValue: "Start install" })}
            </button>
          )}

          {(state === "running" || log) && (
            <pre className="max-h-60 overflow-auto rounded-md border border-border/60 bg-background p-3 font-mono text-[11px] leading-relaxed text-foreground">
              {log || " "}
            </pre>
          )}

          {state === "running" && (
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("providerSelection.installing", { defaultValue: "Installing…" })}
            </div>
          )}

          {state === "done" && (
            <div className="space-y-3">
              <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-200">
                {t("providerSelection.installDone", {
                  defaultValue: "Installed. You can start chatting now.",
                })}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
              >
                {t("providerSelection.continue", { defaultValue: "Continue" })}
              </button>
            </div>
          )}

          {state === "error" && error && (
            <div className="space-y-2">
              <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200">
                {error}
              </div>
              <button
                type="button"
                onClick={() => void start()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm font-medium text-foreground hover:bg-accent/60"
              >
                <RefreshCw className="h-4 w-4" />
                {t("providerSelection.installRetry", { defaultValue: "Retry" })}
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
