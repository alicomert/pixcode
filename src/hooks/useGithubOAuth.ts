import { useCallback, useEffect, useRef, useState } from 'react';

import { authenticatedFetch } from '../utils/api';

export type GithubOAuthStatus = 'idle' | 'starting' | 'waiting' | 'success' | 'error';

type GithubOAuthMessage = {
  source?: string;
  type?: string;
  success?: boolean;
  error?: string;
};

type GithubOAuthStartPayload = {
  authUrl?: string;
  callbackOrigin?: string;
  error?: string;
};

type UseGithubOAuthOptions = {
  onSuccess?: () => void | Promise<void>;
};

/**
 * Browser GitHub OAuth flow shared by onboarding and Git settings.
 *
 * The callback page only posts a success/failure message; the GitHub access
 * token is exchanged and encrypted server-side, never returned to the UI.
 */
export function useGithubOAuth({ onSuccess }: UseGithubOAuthOptions = {}) {
  const [status, setStatus] = useState<GithubOAuthStatus>('idle');
  const [error, setError] = useState('');
  const popupRef = useRef<Window | null>(null);
  const popupWatchRef = useRef<number | null>(null);
  const onSuccessRef = useRef(onSuccess);
  const callbackOriginRef = useRef('');
  const flowIdRef = useRef(0);

  const clearPopupWatch = useCallback(() => {
    if (popupWatchRef.current !== null) {
      window.clearInterval(popupWatchRef.current);
      popupWatchRef.current = null;
    }
  }, []);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  const start = useCallback(async () => {
    const flowId = ++flowIdRef.current;
    clearPopupWatch();
    // A second click can arrive before React applies the disabled state (or
    // a consumer can restart after an error). Close the old window so its
    // eventual callback cannot race the new OAuth flow.
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }
    popupRef.current = null;
    setError('');
    setStatus('starting');
    callbackOriginRef.current = '';

    // Open synchronously in the click handler so mobile/desktop popup
    // blockers do not reject the OAuth window while the API request runs.
    const popup = window.open('', 'pixcode-github-oauth', 'popup,width=560,height=720');
    if (!popup) {
      setStatus('error');
      setError('Popup blocked. Allow popups for Pixcode and try again.');
      return;
    }
    popupRef.current = popup;
    popup.document.title = 'Connecting GitHub…';

    try {
      const openerOrigin = typeof window.location.origin === 'string' && window.location.origin !== 'null'
        ? window.location.origin
        : '';
      const startPath = openerOrigin
        ? `/api/user/github/oauth/start?openerOrigin=${encodeURIComponent(openerOrigin)}`
        : '/api/user/github/oauth/start';
      const response = await authenticatedFetch(startPath, { cache: 'no-store' });
      const payload = await response.json() as GithubOAuthStartPayload;
      if (flowId !== flowIdRef.current) {
        popup.close();
        return;
      }
      if (!response.ok || !payload.authUrl) {
        throw new Error(payload.error || 'GitHub OAuth is not configured on this server.');
      }
      if (payload.callbackOrigin) {
        try {
          const callbackOrigin = new URL(payload.callbackOrigin).origin;
          if (callbackOrigin === 'null') throw new Error('Invalid callback origin');
          callbackOriginRef.current = callbackOrigin;
        } catch {
          throw new Error('GitHub OAuth returned an invalid callback origin.');
        }
      }
      popup.location.href = payload.authUrl;
      setStatus('waiting');
      popupWatchRef.current = window.setInterval(() => {
        if (flowId !== flowIdRef.current) {
          clearPopupWatch();
          return;
        }
        if (!popupRef.current?.closed) return;
        clearPopupWatch();
        popupRef.current = null;
        setStatus('error');
        setError('GitHub authorization window was closed.');
      }, 500);
    } catch (caughtError) {
      if (flowId !== flowIdRef.current) {
        popup.close();
        return;
      }
      clearPopupWatch();
      popup.close();
      popupRef.current = null;
      setStatus('error');
      setError(caughtError instanceof Error ? caughtError.message : 'GitHub connection failed.');
    }
  }, [clearPopupWatch]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<GithubOAuthMessage>) => {
      if (event.source !== popupRef.current) return;
      const expectedOrigin = callbackOriginRef.current || window.location.origin;
      if (event.origin !== expectedOrigin) return;
      const data = event.data;
      if (data?.source !== 'pixcode-github-oauth' || data.type !== 'github-oauth-complete') return;

      popupRef.current = null;
      clearPopupWatch();
      if (data.success) {
        setStatus('success');
        void onSuccessRef.current?.();
      } else {
        setStatus('error');
        setError(data.error || 'GitHub connection failed.');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [clearPopupWatch]);

  useEffect(() => () => {
    flowIdRef.current += 1;
    clearPopupWatch();
    popupRef.current?.close();
    popupRef.current = null;
  }, [clearPopupWatch]);

  return {
    status,
    error,
    start,
  };
}
