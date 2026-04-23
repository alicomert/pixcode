import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Loader2, RefreshCw } from "@/lib/icons";
import { useTranslation } from "react-i18next";

import { useServerPlatform } from "../../../../hooks/useServerPlatform";
import { useProviderModels } from "../../../../hooks/useProviderModels";
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
              to swap which model that provider runs. */}
          <div className="mx-auto grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {visibleCards.map((card) => {
              const isActive = provider === card.id;
              const currentModel = currentModelByProvider[card.id];
              const config = getStaticConfig(card.id);
              const currentLabel =
                config.OPTIONS.find((o: { value: string; label: string }) => o.value === currentModel)?.label
                ?? currentModel;

              return (
                <div
                  key={card.id}
                  className={cn(
                    "group relative flex flex-col gap-2 rounded-xl border bg-card p-3 transition-all duration-150",
                    isActive
                      ? `${card.accentBorder} ${card.accentBg} shadow-sm`
                      : "border-border/60 hover:border-border hover:shadow-sm",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => selectProvider(card.id)}
                    className="flex items-center gap-2 text-left"
                  >
                    <SessionProviderLogo provider={card.id} className="h-6 w-6 shrink-0" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {card.name}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {currentLabel}
                      </div>
                    </div>
                    {isActive && (
                      <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setModelPickerFor(card.id)}
                    className="flex items-center justify-between rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                  >
                    <span>{t("providerSelection.changeModel", { defaultValue: "Change model" })}</span>
                    <ChevronDown className="h-3 w-3" />
                  </button>
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
