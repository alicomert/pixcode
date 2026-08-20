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
};

const initialState: SetupFormState = {
  username: '',
  password: '',
  confirmPassword: '',
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
      try {
        const result = await register(formState.username.trim(), formState.password);
        if (!result.success) {
          setErrorMessage(result.error);
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [formState, register],
  );

  return (
    <AuthScreenLayout
      title="Set up Pixcode"
      description="Create the first administrator account for this Pixcode server"
      footerText="The first account becomes admin and can add more users later."
      logo={<img src="/logo.svg" alt="Pixcode" className="h-16 w-16" />}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
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
