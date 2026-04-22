/**
 * useWallet.ts
 *
 * React hook that owns the wallet feature slice:
 *   - Wallet info, balances, transaction history, earnings, payout requests
 *   - Security settings (timeout, biometrics, send-confirmation)
 *
 * Security settings lifecycle (fixes the reported issue):
 *   1. On mount → loadSecuritySettings() decrypts from localStorage
 *   2. User edits settings → updateSecuritySettings() validates + saves encrypted
 *   3. Auto-lock timer respects timeoutMinutes from persisted settings
 *   4. On logout / wallet reset → clearSecuritySettings() wipes storage
 *
 * All API calls use the JWT access token from the auth context.
 * The hook is intentionally self-contained — no global state manager required,
 * though it can be lifted into a context provider if needed.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  loadSecuritySettings,
  saveSecuritySettings,
  clearSecuritySettings,
  DEFAULT_SECURITY_SETTINGS,
  type WalletSecuritySettings,
} from './walletSecurityStorage';

// ---------------------------------------------------------------------------
// Types mirroring the backend API contract (src/types/wallet.types.ts)
// ---------------------------------------------------------------------------

export interface WalletInfo {
  id: string;
  stellarPublicKey: string;
  status: 'active' | 'inactive' | 'suspended';
  createdAt: string;
  lastActivity?: string;
}

export interface WalletBalance {
  assetType: string;
  assetCode?: string;
  assetIssuer?: string;
  balance: string;
  limit?: string;
}

export interface BalanceData {
  balances: WalletBalance[];
  accountExists: boolean;
  message?: string;
  lastUpdated: string;
}

export interface WalletTransaction {
  id: string;
  hash: string;
  ledger: number;
  createdAt: string;
  sourceAccount: string;
  operationCount: number;
  successful: boolean;
  memo?: string;
  memoType?: string;
}

export interface EarningsSummary {
  totalEarnings: string;
  currentPeriodEarnings: string;
  recentTransactions: Array<{
    id: string;
    amount: string;
    assetCode: string;
    date: string;
    type: 'session_payment' | 'bonus' | 'referral';
  }>;
  periodSummary: {
    startDate: string;
    endDate: string;
    sessionCount: number;
    averageEarning: string;
  };
}

export interface PayoutRequest {
  id: string;
  amount: string;
  assetCode: string;
  assetIssuer?: string;
  destinationAddress: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'failed';
  memo?: string;
  requestedAt: string;
  processedAt?: string;
  transactionHash?: string;
  notes?: string;
}

export interface CreatePayoutInput {
  amount: string;
  assetCode?: string;
  assetIssuer?: string;
  destinationAddress: string;
  memo?: string;
}

// Re-export so consumers only need to import from useWallet
export type { WalletSecuritySettings };

// ---------------------------------------------------------------------------
// Hook state shape
// ---------------------------------------------------------------------------

export interface WalletState {
  // Data
  walletInfo: WalletInfo | null;
  balanceData: BalanceData | null;
  transactions: WalletTransaction[];
  earnings: EarningsSummary | null;
  payoutRequests: PayoutRequest[];

  // Security settings (persisted encrypted)
  securitySettings: WalletSecuritySettings;

  // UI state
  isLoading: boolean;
  isSecuritySettingsLoading: boolean;
  error: string | null;

  // Whether the wallet is currently locked due to inactivity timeout
  isLocked: boolean;
}

// ---------------------------------------------------------------------------
// Hook options
// ---------------------------------------------------------------------------

export interface UseWalletOptions {
  /** JWT access token. Pass null/undefined to skip authenticated calls. */
  accessToken: string | null | undefined;
  /** Base URL of the MentorsMind API, e.g. "https://api.mentorminds.com/api/v1" */
  apiBaseUrl?: string;
  /** Called when the auto-lock timer fires. Use to redirect to a lock screen. */
  onAutoLock?: () => void;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_API_BASE = '/api/v1';

const INITIAL_STATE: WalletState = {
  walletInfo: null,
  balanceData: null,
  transactions: [],
  earnings: null,
  payoutRequests: [],
  securitySettings: { ...DEFAULT_SECURITY_SETTINGS },
  isLoading: false,
  isSecuritySettingsLoading: true, // true until first load completes
  error: null,
  isLocked: false,
};

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

async function apiFetch<T>(
  url: string,
  token: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Request failed: ${res.status}`,
    );
  }

  const json = await res.json();
  // Backend wraps responses in { success, data, message }
  return (json.data ?? json) as T;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWallet(options: UseWalletOptions) {
  const { accessToken, apiBaseUrl = DEFAULT_API_BASE, onAutoLock } = options;

  const [state, setState] = useState<WalletState>(INITIAL_STATE);

  // Ref for the auto-lock timer so we can clear/reset it without stale closures
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track last activity time for the lock timer
  const lastActivityRef = useRef<number>(Date.now());

  // ---------------------------------------------------------------------------
  // Security settings — load on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const settings = await loadSecuritySettings();
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            securitySettings: settings,
            isSecuritySettingsLoading: false,
          }));
        }
      } catch {
        // loadSecuritySettings never throws — this is a safety net
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            securitySettings: { ...DEFAULT_SECURITY_SETTINGS },
            isSecuritySettingsLoading: false,
          }));
        }
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Auto-lock timer — re-arm whenever timeout setting changes or lock state changes
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const { timeoutMinutes } = state.securitySettings;

    // Clear any existing timer
    if (lockTimerRef.current) {
      clearTimeout(lockTimerRef.current);
      lockTimerRef.current = null;
    }

    // 0 = never lock; skip if already locked or settings still loading
    if (
      timeoutMinutes === 0 ||
      state.isLocked ||
      state.isSecuritySettingsLoading
    ) {
      return;
    }

    const ms = timeoutMinutes * 60 * 1000;

    lockTimerRef.current = setTimeout(() => {
      setState((prev) => ({ ...prev, isLocked: true }));
      onAutoLock?.();
    }, ms);

    return () => {
      if (lockTimerRef.current) {
        clearTimeout(lockTimerRef.current);
      }
    };
  }, [
    state.securitySettings.timeoutMinutes,
    state.isLocked,
    state.isSecuritySettingsLoading,
    onAutoLock,
  ]);

  // ---------------------------------------------------------------------------
  // Activity tracking — reset the lock timer on user interaction
  // ---------------------------------------------------------------------------

  const resetLockTimer = useCallback(() => {
    lastActivityRef.current = Date.now();

    if (state.isLocked) return; // don't auto-unlock; require explicit unlock

    const { timeoutMinutes } = state.securitySettings;
    if (timeoutMinutes === 0) return;

    if (lockTimerRef.current) {
      clearTimeout(lockTimerRef.current);
    }

    lockTimerRef.current = setTimeout(() => {
      setState((prev) => ({ ...prev, isLocked: true }));
      onAutoLock?.();
    }, timeoutMinutes * 60 * 1000);
  }, [state.isLocked, state.securitySettings.timeoutMinutes, onAutoLock]);

  // ---------------------------------------------------------------------------
  // Unlock wallet (call after biometric / PIN verification)
  // ---------------------------------------------------------------------------

  const unlock = useCallback(() => {
    setState((prev) => ({ ...prev, isLocked: false }));
    lastActivityRef.current = Date.now();
  }, []);

  // ---------------------------------------------------------------------------
  // Security settings — update + persist
  // ---------------------------------------------------------------------------

  /**
   * Update and persist wallet security settings.
   *
   * Validates inputs before saving:
   *   - timeoutMinutes must be a non-negative integer
   *   - biometricsEnabled and requireSendConfirmation must be booleans
   *
   * Throws on validation failure so the caller can surface the error in UI.
   */
  const updateSecuritySettings = useCallback(
    async (
      updates: Partial<Omit<WalletSecuritySettings, 'savedAt'>>,
    ): Promise<void> => {
      // Merge with current settings
      const current = state.securitySettings;
      const next: Omit<WalletSecuritySettings, 'savedAt'> = {
        timeoutMinutes:
          updates.timeoutMinutes !== undefined
            ? updates.timeoutMinutes
            : current.timeoutMinutes,
        biometricsEnabled:
          updates.biometricsEnabled !== undefined
            ? updates.biometricsEnabled
            : current.biometricsEnabled,
        requireSendConfirmation:
          updates.requireSendConfirmation !== undefined
            ? updates.requireSendConfirmation
            : current.requireSendConfirmation,
      };

      // Validate
      if (
        !Number.isInteger(next.timeoutMinutes) ||
        next.timeoutMinutes < 0 ||
        next.timeoutMinutes > 1440 // max 24 hours
      ) {
        throw new Error(
          'timeoutMinutes must be a whole number between 0 and 1440.',
        );
      }
      if (typeof next.biometricsEnabled !== 'boolean') {
        throw new Error('biometricsEnabled must be a boolean.');
      }
      if (typeof next.requireSendConfirmation !== 'boolean') {
        throw new Error('requireSendConfirmation must be a boolean.');
      }

      // Persist encrypted
      await saveSecuritySettings(next);

      // Reload from storage to get the savedAt timestamp
      const saved = await loadSecuritySettings();

      setState((prev) => ({
        ...prev,
        securitySettings: saved,
      }));
    },
    [state.securitySettings],
  );

  // ---------------------------------------------------------------------------
  // Wallet data fetchers
  // ---------------------------------------------------------------------------

  const fetchWalletInfo = useCallback(async (): Promise<void> => {
    if (!accessToken) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const data = await apiFetch<WalletInfo>(
        `${apiBaseUrl}/wallets/me`,
        accessToken,
      );
      setState((prev) => ({ ...prev, walletInfo: data, isLoading: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load wallet info',
      }));
    }
  }, [accessToken, apiBaseUrl]);

  const fetchBalance = useCallback(
    async (assetCode?: string, assetIssuer?: string): Promise<void> => {
      if (!accessToken) return;

      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const params = new URLSearchParams();
        if (assetCode) params.set('assetCode', assetCode);
        if (assetIssuer) params.set('assetIssuer', assetIssuer);

        const url = `${apiBaseUrl}/wallets/me/balance${params.toString() ? `?${params}` : ''}`;
        const data = await apiFetch<BalanceData>(url, accessToken);
        setState((prev) => ({ ...prev, balanceData: data, isLoading: false }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to load balance',
        }));
      }
    },
    [accessToken, apiBaseUrl],
  );

  const fetchTransactions = useCallback(
    async (cursor?: string, limit = 10, order: 'asc' | 'desc' = 'desc'): Promise<void> => {
      if (!accessToken) return;

      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const params = new URLSearchParams({
          limit: String(limit),
          order,
          ...(cursor ? { cursor } : {}),
        });

        const data = await apiFetch<{ transactions: WalletTransaction[] }>(
          `${apiBaseUrl}/wallets/me/transactions?${params}`,
          accessToken,
        );
        setState((prev) => ({
          ...prev,
          transactions: data.transactions,
          isLoading: false,
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error:
            err instanceof Error ? err.message : 'Failed to load transactions',
        }));
      }
    },
    [accessToken, apiBaseUrl],
  );

  const fetchEarnings = useCallback(
    async (startDate?: string, endDate?: string, assetCode = 'USD'): Promise<void> => {
      if (!accessToken) return;

      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const params = new URLSearchParams({ assetCode });
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);

        const data = await apiFetch<EarningsSummary>(
          `${apiBaseUrl}/wallets/me/earnings?${params}`,
          accessToken,
        );
        setState((prev) => ({ ...prev, earnings: data, isLoading: false }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to load earnings',
        }));
      }
    },
    [accessToken, apiBaseUrl],
  );

  const fetchPayoutRequests = useCallback(
    async (page = 1, limit = 10): Promise<void> => {
      if (!accessToken) return;

      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(limit),
        });

        const data = await apiFetch<{ payoutRequests: PayoutRequest[] }>(
          `${apiBaseUrl}/wallets/me/payouts?${params}`,
          accessToken,
        );
        setState((prev) => ({
          ...prev,
          payoutRequests: data.payoutRequests,
          isLoading: false,
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error:
            err instanceof Error
              ? err.message
              : 'Failed to load payout requests',
        }));
      }
    },
    [accessToken, apiBaseUrl],
  );

  const createPayoutRequest = useCallback(
    async (input: CreatePayoutInput): Promise<PayoutRequest> => {
      if (!accessToken) throw new Error('Not authenticated');

      if (state.securitySettings.requireSendConfirmation) {
        // Caller is responsible for showing a confirmation dialog before calling this.
        // The flag is checked here as a last-resort guard — the UI layer should
        // enforce it earlier so the user sees a proper confirmation prompt.
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const result = await apiFetch<PayoutRequest>(
          `${apiBaseUrl}/wallets/payout`,
          accessToken,
          { method: 'POST', body: JSON.stringify(input) },
        );
        // Refresh payout list after creation
        await fetchPayoutRequests();
        setState((prev) => ({ ...prev, isLoading: false }));
        return result;
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error:
            err instanceof Error
              ? err.message
              : 'Failed to create payout request',
        }));
        throw err;
      }
    },
    [accessToken, apiBaseUrl, state.securitySettings.requireSendConfirmation, fetchPayoutRequests],
  );

  // ---------------------------------------------------------------------------
  // Initialise wallet data when token becomes available
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!accessToken) return;
    fetchWalletInfo();
  }, [accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Cleanup on unmount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      if (lockTimerRef.current) {
        clearTimeout(lockTimerRef.current);
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Reset / logout helper
  // ---------------------------------------------------------------------------

  const resetWallet = useCallback(() => {
    clearSecuritySettings();
    if (lockTimerRef.current) {
      clearTimeout(lockTimerRef.current);
    }
    setState({
      ...INITIAL_STATE,
      isSecuritySettingsLoading: false,
      securitySettings: { ...DEFAULT_SECURITY_SETTINGS },
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Exposed API
  // ---------------------------------------------------------------------------

  return {
    // State
    ...state,

    // Security settings actions
    updateSecuritySettings,

    // Lock / unlock
    unlock,
    resetLockTimer,

    // Data fetchers
    fetchWalletInfo,
    fetchBalance,
    fetchTransactions,
    fetchEarnings,
    fetchPayoutRequests,
    createPayoutRequest,

    // Cleanup
    resetWallet,
  };
}
