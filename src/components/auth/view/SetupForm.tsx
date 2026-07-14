import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';

import { useAuth } from '../context/AuthContext';

import AuthErrorAlert from './AuthErrorAlert';
import AuthInputField from './AuthInputField';
import AuthScreenLayout from './AuthScreenLayout';

type SetupFormState = {
  username: string;
  password: string;
  confirmPassword: string;
  connectionMode: 'local' | 'remote';
  remoteUrl: string;
  remoteApiKey: string;
};

const initialState: SetupFormState = {
  username: '',
  password: '',
  confirmPassword: '',
  connectionMode: 'local',
  remoteUrl: '',
  remoteApiKey: '',
};

/**
 * Validates the account-setup form state.
 * @returns An error message string if validation fails, or `null` when the
 *   form is valid.
 */
function validateSetupForm(formState: SetupFormState): string | null {
  if (!formState.username.trim() || !formState.password || !formState.confirmPassword) {
    return 'Please fill in all fields.';
  }

  if (formState.username.trim().length < 3) {
    return 'Username must be at least 3 characters long.';
  }

  if (formState.password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }

  if (formState.password.length > 128) {
    return 'Password must not exceed 128 characters.';
  }

  if (!/[a-z]/.test(formState.password)) {
    return 'Password must contain at least one lowercase letter.';
  }

  if (!/[A-Z]/.test(formState.password)) {
    return 'Password must contain at least one uppercase letter.';
  }

  if (!/[0-9]/.test(formState.password)) {
    return 'Password must contain at least one number.';
  }

  if (!/[^a-zA-Z0-9]/.test(formState.password)) {
    return 'Password must contain at least one special character.';
  }

  if (formState.password !== formState.confirmPassword) {
    return 'Passwords do not match.';
  }

  if (formState.connectionMode === 'remote' && !formState.remoteUrl.trim()) {
    return 'Remote Pixcode server URL is required.';
  }

  return null;
}

/**
 * Account setup / registration form.
 * Uses `autoComplete="new-password"` on password fields so that password
 * managers recognise this as a registration flow and offer to save the new
 * credentials after submission.
 */
export default function SetupForm() {
  const { register } = useAuth();

  const [formState, setFormState] = useState<SetupFormState>(initialState);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = useCallback(<Field extends keyof SetupFormState>(field: Field, value: SetupFormState[Field]) => {
    setFormState((previous) => ({ ...previous, [field]: value }));
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setErrorMessage('');

      const validationError = validateSetupForm(formState);
      if (validationError) {
        setErrorMessage(validationError);
        return;
      }

      setIsSubmitting(true);
      let connectionOk = true;
      let connectionError = '';
      try {
        const connectionResponse = await fetch('/api/auth/connection-mode', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: formState.connectionMode,
            remoteUrl: formState.connectionMode === 'remote' ? formState.remoteUrl.trim() : null,
            apiKey: formState.connectionMode === 'remote' ? formState.remoteApiKey.trim() : null,
          }),
        });
        if (!connectionResponse.ok) {
          if (formState.connectionMode === 'remote') {
            const payload = await connectionResponse.json().catch(() => null);
            connectionError = payload?.error || 'Could not save connection mode.';
          }
          connectionOk = false;
        }
      } catch {
        connectionOk = false;
      }
      if (!connectionOk && formState.connectionMode === 'remote') {
        setErrorMessage(connectionError);
        setIsSubmitting(false);
        return;
      }
      // Non-remote (local) setup continues even if connection-mode save fails

      const result = await register(formState.username.trim(), formState.password);
      if (!result.success) {
        setErrorMessage(result.error);
      }
      setIsSubmitting(false);
    },
    [formState, register],
  );

  return (
    <AuthScreenLayout
      title="Welcome to Pixcode"
      description="Create the first admin account to get started"
      footerText="The first account becomes admin and can add more users later."
      logo={<img src="/logo.svg" alt="Pixcode" className="h-16 w-16" />}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-2 rounded-lg border border-border/70 bg-muted/30 p-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => updateField('connectionMode', 'local')}
            disabled={isSubmitting}
            className={`rounded-md px-3 py-2 text-left text-sm transition-colors ${
              formState.connectionMode === 'local'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
            }`}
          >
            <span className="block font-medium">Use this computer directly</span>
            <span className="block text-xs opacity-80">Run Pixcode and CLIs on this machine.</span>
          </button>
          <button
            type="button"
            onClick={() => updateField('connectionMode', 'remote')}
            disabled={isSubmitting}
            className={`rounded-md px-3 py-2 text-left text-sm transition-colors ${
              formState.connectionMode === 'remote'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
            }`}
          >
            <span className="block font-medium">Connect to a remote Pixcode server</span>
            <span className="block text-xs opacity-80">Control another always-on Pixcode host by API.</span>
          </button>
        </div>

        {formState.connectionMode === 'remote' && (
          <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3">
            <AuthInputField
              id="remoteUrl"
              name="remoteUrl"
              label="Remote API URL"
              value={formState.remoteUrl}
              onChange={(value) => updateField('remoteUrl', value)}
              placeholder="https://your-server.example.com"
              isDisabled={isSubmitting}
              autoComplete="url"
            />
            <AuthInputField
              id="remoteApiKey"
              name="remoteApiKey"
              label="Remote API Key"
              value={formState.remoteApiKey}
              onChange={(value) => updateField('remoteApiKey', value)}
              placeholder="px_..."
              isDisabled={isSubmitting}
              type="password"
              autoComplete="off"
            />
          </div>
        )}

        <AuthInputField
          id="username"
          name="username"
          label="Username"
          value={formState.username}
          onChange={(value) => updateField('username', value)}
          placeholder="Enter your username"
          isDisabled={isSubmitting}
          autoComplete="username"
        />

        <AuthInputField
          id="password"
          name="password"
          label="Password"
          value={formState.password}
          onChange={(value) => updateField('password', value)}
          placeholder="Enter your password"
          isDisabled={isSubmitting}
          type="password"
          autoComplete="new-password"
        />

        <AuthInputField
          id="confirmPassword"
          name="confirmPassword"
          label="Confirm Password"
          value={formState.confirmPassword}
          onChange={(value) => updateField('confirmPassword', value)}
          placeholder="Confirm your password"
          isDisabled={isSubmitting}
          type="password"
          autoComplete="new-password"
        />

        <AuthErrorAlert errorMessage={errorMessage} />

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white transition-colors duration-200 hover:bg-blue-700 disabled:bg-blue-400"
        >
          {isSubmitting ? 'Setting up...' : 'Create Account'}
        </button>
      </form>
    </AuthScreenLayout>
  );
}
