import { useState } from 'react';

import { Eye, EyeOff, GitBranch, Github, KeyRound, Mail, User } from '@/lib/icons';

type GitConfigurationStepProps = {
  gitName: string;
  gitEmail: string;
  githubToken: string;
  isSubmitting: boolean;
  onGitNameChange: (value: string) => void;
  onGitEmailChange: (value: string) => void;
  onGithubTokenChange: (value: string) => void;
};

export default function GitConfigurationStep({
  gitName,
  gitEmail,
  githubToken,
  isSubmitting,
  onGitNameChange,
  onGitEmailChange,
  onGithubTokenChange,
}: GitConfigurationStepProps) {
  const [showToken, setShowToken] = useState(false);

  return (
    <div className="space-y-6">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
          <GitBranch className="h-8 w-8 text-blue-600 dark:text-blue-400" />
        </div>
        <h2 className="mb-2 text-2xl font-bold text-foreground">Git & GitHub</h2>
        <p className="text-muted-foreground">
          Set your commit identity and optionally add a GitHub token so Pixcode can clone and push private repos.
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
            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="John Doe"
            required
            disabled={isSubmitting}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Stored in Pixcode (DB + ~/.pixcode/gitconfig) — not system
            {' '}
            <code className="rounded bg-muted px-1">git config --global</code>
            .
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
            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="john@example.com"
            required
            disabled={isSubmitting}
          />
        </div>

        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <label htmlFor="githubToken" className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
            <Github className="h-4 w-4" />
            GitHub Personal Access Token
            <span className="text-xs font-normal text-muted-foreground">(optional · private repos)</span>
          </label>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              id="githubToken"
              value={githubToken}
              onChange={(event) => onGithubTokenChange(event.target.value)}
              className="w-full rounded-lg border border-border bg-background px-4 py-3 pr-12 text-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="ghp_… or github_pat_…"
              disabled={isSubmitting}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowToken((value) => !value)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showToken ? 'Hide token' : 'Show token'}
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
            <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Used for private clone/fetch/push. Create a classic token with
              {' '}
              <code className="rounded bg-muted px-1">repo</code>
              {' '}
              scope at
              {' '}
              <a
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                github.com/settings/tokens
              </a>
              . You can add or change this later in Settings → Git.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
