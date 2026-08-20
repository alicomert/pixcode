import { useState } from 'react';

import { Eye, EyeOff, GitBranch, Github, KeyRound, Mail, User } from '@/lib/icons';

type GitConfigurationStepProps = {
  gitName: string;
  gitEmail: string;
  githubToken: string;
  hasGithubToken: boolean;
  githubOAuthStatus: 'idle' | 'starting' | 'waiting' | 'success' | 'error';
  githubOAuthError: string;
  isSubmitting: boolean;
  onGitNameChange: (value: string) => void;
  onGitEmailChange: (value: string) => void;
  onGithubTokenChange: (value: string) => void;
  onStartGithubOAuth: () => void;
};

export default function GitConfigurationStep({
  gitName,
  gitEmail,
  githubToken,
  hasGithubToken,
  githubOAuthStatus,
  githubOAuthError,
  isSubmitting,
  onGitNameChange,
  onGitEmailChange,
  onGithubTokenChange,
  onStartGithubOAuth,
}: GitConfigurationStepProps) {
  const [showToken, setShowToken] = useState(false);

  return (
    <div className="space-y-6">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
          <GitBranch className="h-8 w-8 text-blue-600 dark:text-blue-400" />
        </div>
        <h2 className="mb-2 text-2xl font-bold text-foreground">Git &amp; GitHub</h2>
        <p className="text-muted-foreground">
          Set your commit identity and optionally connect GitHub for private repositories.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="gitName" className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
            <User className="h-4 w-4" />
            Git Name
            {' '}
            <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="gitName"
            value={gitName}
            onChange={(event) => onGitNameChange(event.target.value)}
            className="min-h-11 w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="John Doe"
            required
            disabled={isSubmitting}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Stored in Pixcode (DB + ~/.pixcode/gitconfig) - not system <code className="rounded bg-muted px-1">git config --global</code>.
          </p>
        </div>

        <div>
          <label htmlFor="gitEmail" className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
            <Mail className="h-4 w-4" />
            Git Email
            {' '}
            <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            id="gitEmail"
            value={gitEmail}
            onChange={(event) => onGitEmailChange(event.target.value)}
            className="min-h-11 w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="john@example.com"
            required
            disabled={isSubmitting}
          />
        </div>

        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Github className="h-4 w-4 shrink-0" />
                {hasGithubToken ? 'GitHub connected' : 'Connect GitHub'}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Authorize Pixcode securely for private clone, fetch, pull, and push.
              </p>
              {githubOAuthStatus === 'success' && (
                <p className="mt-1 text-xs text-emerald-600" role="status">GitHub authorization saved.</p>
              )}
              {githubOAuthStatus === 'error' && githubOAuthError && (
                <p className="mt-1 text-xs text-destructive" role="alert">{githubOAuthError}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onStartGithubOAuth}
              disabled={isSubmitting || githubOAuthStatus === 'starting' || githubOAuthStatus === 'waiting'}
              className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Github className="h-4 w-4" />
              {githubOAuthStatus === 'starting' || githubOAuthStatus === 'waiting' ? 'Waiting for GitHub...' : 'Connect with GitHub'}
            </button>
          </div>

          <details className="mt-4 rounded-lg border border-border bg-background/50 p-3">
            <summary className="cursor-pointer text-sm font-medium text-foreground">
              Use a personal access token instead
            </summary>
            <p className="mt-2 text-xs text-muted-foreground">
              Legacy fallback for self-hosted setups where GitHub OAuth is unavailable. The token is encrypted in Pixcode credential storage.
            </p>
            <label htmlFor="githubToken" className="mb-2 mt-3 flex items-center gap-2 text-sm font-medium text-foreground">
              <KeyRound className="h-4 w-4" />
              GitHub Personal Access Token
              <span className="text-xs font-normal text-muted-foreground">(optional - private repos)</span>
            </label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                id="githubToken"
                value={githubToken}
                onChange={(event) => onGithubTokenChange(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-border bg-background px-4 py-3 pr-12 text-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="ghp_... or github_pat_..."
                disabled={isSubmitting}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowToken((value) => !value)}
                className="absolute right-1 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={showToken ? 'Hide token' : 'Show token'}
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
              Use a classic token with <code className="rounded bg-muted px-1">repo</code> scope. Create one at{' '}
              <a
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                github.com/settings/tokens
              </a>
              .
            </p>
          </details>
        </div>
      </div>
    </div>
  );
}
