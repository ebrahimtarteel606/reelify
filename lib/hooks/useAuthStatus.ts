'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export type Platform = 'youtube' | 'facebook';

interface AuthStatus {
  youtube: boolean;
  facebook: boolean;
}

interface UseAuthStatusReturn {
  authStatus: AuthStatus;
  isLoading: boolean;
  checkAuth: (platform: Platform) => Promise<boolean>;
  authenticate: (platform: Platform) => void;
  logout: (platform: Platform) => Promise<void>;
  refreshAuthStatus: () => Promise<void>;
}

export function useAuthStatus(): UseAuthStatusReturn {
  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    youtube: false,
    facebook: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const authCallbackProcessed = useRef(false);

  /**
   * Check authentication status for a specific platform
   */
  const checkAuth = useCallback(async (platform: Platform): Promise<boolean> => {
    try {
      const response = await fetch(`/api/auth/${platform}`, {
        method: 'POST',
        credentials: 'include',
      });
      
      const data = await response.json();
      const isAuthenticated = data.authenticated === true;
      
      setAuthStatus(prev => ({
        ...prev,
        [platform]: isAuthenticated,
      }));
      
      return isAuthenticated;
    } catch (error) {
      console.error(`Error checking ${platform} auth:`, error);
      setAuthStatus(prev => ({
        ...prev,
        [platform]: false,
      }));
      return false;
    }
  }, []);

  /**
   * Refresh authentication status for all platforms
   */
  const refreshAuthStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        checkAuth('youtube'),
        checkAuth('facebook'),
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [checkAuth]);

  /**
   * Initiate OAuth flow for a platform
   */
  const authenticate = useCallback((platform: Platform) => {
    if (typeof window !== 'undefined') {
      const currentUrl = window.location.href;
      console.log('[Auth] Starting OAuth flow, saving current URL:', currentUrl);
      
      // Store current URL in sessionStorage as backup
      sessionStorage.setItem('auth_return_url', currentUrl);
      
      // Verify it was saved
      const saved = sessionStorage.getItem('auth_return_url');
      console.log('[Auth] Verified sessionStorage saved:', saved ? 'YES' : 'NO');
      
      // Also pass the return URL as a query parameter to the OAuth endpoint
      // so the callback can redirect to it
      const returnUrl = encodeURIComponent(currentUrl);
      const authUrl = `/api/auth/${platform}?return_url=${returnUrl}`;
      console.log('[Auth] Redirecting to:', authUrl);
      window.location.href = authUrl;
    }
  }, []);

  /**
   * Logout from a platform
   */
  const logout = useCallback(async (platform: Platform) => {
    try {
      await fetch(`/api/auth/${platform}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      
      setAuthStatus(prev => ({
        ...prev,
        [platform]: false,
      }));
    } catch (error) {
      console.error(`Error logging out from ${platform}:`, error);
    }
  }, []);

  // Check auth status on mount
  useEffect(() => {
    refreshAuthStatus();
  }, [refreshAuthStatus]);

  // Check for auth success/error in URL params (after OAuth callback)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Prevent double processing (React Strict Mode can call effects twice)
    if (authCallbackProcessed.current) {
      console.log('[Auth Callback] Already processed, skipping');
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const authSuccess = urlParams.get('auth_success');
    const authError = urlParams.get('auth_error');

    console.log('[Auth Callback] Current URL:', window.location.href);
    console.log('[Auth Callback] auth_success:', authSuccess);
    console.log('[Auth Callback] auth_error:', authError);

    if (authSuccess) {
      authCallbackProcessed.current = true;
      
      // Refresh auth status after successful auth
      checkAuth(authSuccess as Platform);
      
      // Check if we need to restore the original URL from sessionStorage
      // This handles cases where the cookie-based approach fails (e.g., URL too long)
      const savedReturnUrl = sessionStorage.getItem('auth_return_url');
      
      console.log('[Auth Callback] savedReturnUrl from sessionStorage:', savedReturnUrl);
      
      // Check if the current URL is missing essential params (like startTime)
      // If we have a saved URL and it has params that the current URL doesn't have, restore it
      const currentUrl = new URL(window.location.href);
      const hasSavedUrl = !!savedReturnUrl;
      const currentHasStartTime = currentUrl.searchParams.has('startTime');
      
      console.log('[Auth Callback] hasSavedUrl:', hasSavedUrl);
      console.log('[Auth Callback] currentHasStartTime:', currentHasStartTime);
      
      // If we have a saved URL and current URL is missing essential params, restore
      if (savedReturnUrl && !currentHasStartTime) {
        console.log('[Auth Callback] Current URL missing params, restoring from sessionStorage');
        sessionStorage.removeItem('auth_return_url');
        
        try {
          const returnUrl = new URL(savedReturnUrl);
          // Remove auth_success if it was there before (shouldn't be, but just in case)
          returnUrl.searchParams.delete('auth_success');
          returnUrl.searchParams.delete('auth_error');
          // Add the new auth_success
          returnUrl.searchParams.set('auth_success', authSuccess);
          const finalUrl = returnUrl.toString();
          console.log('[Auth Callback] Redirecting to restored URL:', finalUrl);
          // Reload the page with the full URL
          window.location.href = finalUrl;
          return; // Exit early, page will reload
        } catch (e) {
          console.error('[Auth Callback] Failed to restore return URL:', e);
        }
      }
      
      // Clean up the auth_success param from current URL (keep all other params)
      console.log('[Auth Callback] URL has all params, just cleaning up auth_success');
      sessionStorage.removeItem('auth_return_url');
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('auth_success');
      window.history.replaceState({}, '', newUrl.toString());
    }

    if (authError) {
      authCallbackProcessed.current = true;
      console.error('Authentication error:', authError);
      
      // Clear saved return URL on error
      sessionStorage.removeItem('auth_return_url');
      
      // Clean up auth_error from URL (keep all other params)
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('auth_error');
      window.history.replaceState({}, '', newUrl.toString());
    }
  }, [checkAuth]);

  return {
    authStatus,
    isLoading,
    checkAuth,
    authenticate,
    logout,
    refreshAuthStatus,
  };
}
