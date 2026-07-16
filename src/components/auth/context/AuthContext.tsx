import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../../../utils/api';
import { AUTH_ERROR_MESSAGES, AUTH_TOKEN_STORAGE_KEY } from '../constants';
import type {
  AuthContextValue,
  AuthProviderProps,
  AuthSessionPayload,
  AuthStatusPayload,
  AuthUser,
  AuthUserPayload,
  OnboardingStatusPayload,
} from '../types';
import { parseJsonSafely, resolveApiErrorMessage } from '../utils';

const AuthContext = createContext<AuthContextValue | null>(null);

const readStoredToken = (): string | null => localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);

const persistToken = (token: string) => {
  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
};

const clearStoredToken = () => {
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => readStoredToken());
  const [isLoading, setIsLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Prevent login/register from racing with a second bootstrap pass that
  // could clear a brand-new session when a parallel status check finishes late.
  const bootstrapGenerationRef = useRef(0);

  const setSession = useCallback((nextUser: AuthUser, nextToken: string) => {
    setUser(nextUser);
    setToken(nextToken);
    persistToken(nextToken);
  }, []);

  const clearSession = useCallback(() => {
    setUser(null);
    setToken(null);
    clearStoredToken();
  }, []);

  const checkOnboardingStatus = useCallback(async () => {
    try {
      const response = await api.user.onboardingStatus();
      if (!response.ok) {
        // Public endpoint should not fail closed for first-run / login.
        setHasCompletedOnboarding(true);
        return;
      }

      const payload = await parseJsonSafely<OnboardingStatusPayload>(response);
      if (typeof payload?.needsSetup === 'boolean' && payload.needsSetup) {
        setNeedsSetup(true);
        setHasCompletedOnboarding(false);
        return;
      }

      setHasCompletedOnboarding(Boolean(payload?.hasCompletedOnboarding));
    } catch (caughtError) {
      console.error('Error checking onboarding status:', caughtError);
      // Fail open to avoid blocking access on transient onboarding status errors.
      setHasCompletedOnboarding(true);
    }
  }, []);

  const refreshOnboardingStatus = useCallback(async () => {
    await checkOnboardingStatus();
  }, [checkOnboardingStatus]);

  const consumeQrLoginFromUrl = useCallback(async () => {
    const params = new URLSearchParams(window.location.search);
    const qrLoginToken = params.get('qrLoginToken');
    if (!qrLoginToken) {
      return false;
    }

    const response = await api.auth.qrLogin(qrLoginToken);
    const payload = await parseJsonSafely<AuthSessionPayload>(response);

    params.delete('qrLoginToken');
    const nextSearch = params.toString();
    window.history.replaceState(
      {},
      document.title,
      `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`,
    );

    if (!response.ok || !payload?.token || !payload.user) {
      const message = resolveApiErrorMessage(payload, AUTH_ERROR_MESSAGES.qrLoginFailed);
      setError(message);
      return false;
    }

    setSession(payload.user, payload.token);
    setNeedsSetup(false);
    await checkOnboardingStatus();
    return true;
  }, [checkOnboardingStatus, setSession]);

  const checkAuthStatus = useCallback(async () => {
    const generation = ++bootstrapGenerationRef.current;

    try {
      setIsLoading(true);
      setError(null);

      const statusResponse = await api.auth.status();
      const statusPayload = await parseJsonSafely<AuthStatusPayload>(statusResponse);

      if (generation !== bootstrapGenerationRef.current) {
        return;
      }

      if (statusPayload?.needsSetup) {
        setNeedsSetup(true);
        // Fresh install: ignore any stale token from a previous install.
        clearSession();
        return;
      }

      setNeedsSetup(false);

      const qrLoginConsumed = await consumeQrLoginFromUrl();
      if (generation !== bootstrapGenerationRef.current) {
        return;
      }
      if (qrLoginConsumed) {
        return;
      }

      // Always read storage at call time so a concurrent login/register that
      // just wrote a token is visible, and so this callback does not need to
      // re-run (and flash loading) every time token state changes.
      const storedToken = readStoredToken();
      if (!storedToken) {
        setUser(null);
        setToken(null);
        return;
      }

      setToken(storedToken);

      const userResponse = await api.auth.user();
      if (generation !== bootstrapGenerationRef.current) {
        return;
      }

      if (!userResponse.ok) {
        clearSession();
        return;
      }

      const userPayload = await parseJsonSafely<AuthUserPayload>(userResponse);
      if (!userPayload?.user) {
        clearSession();
        return;
      }

      setUser(userPayload.user);
      await checkOnboardingStatus();
    } catch (caughtError) {
      console.error('[Auth] Auth status check failed:', caughtError);
      if (generation === bootstrapGenerationRef.current) {
        setError(AUTH_ERROR_MESSAGES.authStatusCheckFailed);
      }
    } finally {
      if (generation === bootstrapGenerationRef.current) {
        setIsLoading(false);
      }
    }
  }, [checkOnboardingStatus, clearSession, consumeQrLoginFromUrl]);

  useEffect(() => {
    void checkAuthStatus();
  }, [checkAuthStatus]);

  const login = useCallback<AuthContextValue['login']>(
    async (username, password) => {
      try {
        setError(null);
        // Invalidate any in-flight bootstrap so it cannot clear this session.
        bootstrapGenerationRef.current += 1;

        const response = await api.auth.login(username, password);
        const payload = await parseJsonSafely<AuthSessionPayload>(response);

        if (!response.ok || !payload?.token || !payload.user) {
          const message = resolveApiErrorMessage(payload, AUTH_ERROR_MESSAGES.loginFailed);
          setError(message);
          return { success: false, error: message };
        }

        setSession(payload.user, payload.token);
        setNeedsSetup(false);
        setIsLoading(false);
        await checkOnboardingStatus();
        return { success: true };
      } catch (caughtError) {
        console.error('Login error:', caughtError);
        setError(AUTH_ERROR_MESSAGES.networkError);
        return { success: false, error: AUTH_ERROR_MESSAGES.networkError };
      }
    },
    [checkOnboardingStatus, setSession],
  );

  const register = useCallback<AuthContextValue['register']>(
    async (username, password) => {
      try {
        setError(null);
        bootstrapGenerationRef.current += 1;

        const response = await api.auth.register(username, password);
        const payload = await parseJsonSafely<AuthSessionPayload>(response);

        if (!response.ok || !payload?.token || !payload.user) {
          const message = resolveApiErrorMessage(payload, AUTH_ERROR_MESSAGES.registrationFailed);
          setError(message);
          return { success: false, error: message };
        }

        setSession(payload.user, payload.token);
        setNeedsSetup(false);
        setIsLoading(false);
        await checkOnboardingStatus();
        return { success: true };
      } catch (caughtError) {
        console.error('Registration error:', caughtError);
        setError(AUTH_ERROR_MESSAGES.networkError);
        return { success: false, error: AUTH_ERROR_MESSAGES.networkError };
      }
    },
    [checkOnboardingStatus, setSession],
  );

  const logout = useCallback(() => {
    const tokenToInvalidate = token;
    bootstrapGenerationRef.current += 1;
    clearSession();

    if (tokenToInvalidate) {
      void api.auth.logout().catch((caughtError: unknown) => {
        console.error('Logout endpoint error:', caughtError);
      });
    }
  }, [clearSession, token]);

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isLoading,
      needsSetup,
      hasCompletedOnboarding,
      error,
      login,
      register,
      logout,
      refreshOnboardingStatus,
    }),
    [
      error,
      hasCompletedOnboarding,
      isLoading,
      login,
      logout,
      needsSetup,
      refreshOnboardingStatus,
      register,
      token,
      user,
    ],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
