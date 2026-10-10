"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { API_URL } from "./config";
import { authSignOut } from "./api";

interface User {
  email: string;
  name: string;
}

interface AuthTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
}

interface AuthContextType {
  user: User | null;
  tokens: AuthTokens | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (tokens: AuthTokens) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKENS_KEY = "breathesafe_tokens";
const REFRESH_INTERVAL_MS = 50 * 60 * 1000;


export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tokens, setTokens] = useState<AuthTokens | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchProfile = useCallback(async (accessToken: string) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/profile`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error("Profile fetch failed");
      return (await res.json()) as User;
    } catch {
      return null;
    }
  }, []);

  const refreshTokens = useCallback(async (refreshToken: string) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return {
        accessToken: data.accessToken,
        idToken: data.idToken,
        refreshToken: data.refreshToken || refreshToken,
      } as AuthTokens;
    } catch {
      return null;
    }
  }, []);

  const scheduleRefresh = useCallback(
    (currentTokens: AuthTokens) => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
      refreshTimer.current = setInterval(async () => {
        const newTokens = await refreshTokens(currentTokens.refreshToken);
        if (newTokens) {
          setTokens(newTokens);
          try {
            localStorage.setItem(TOKENS_KEY, JSON.stringify(newTokens));
          } catch {}
          currentTokens = newTokens;
        }
      }, REFRESH_INTERVAL_MS);
    },
    [refreshTokens]
  );

  // Restore a saved session once after mount. Runs on a timer so every state
  // update happens asynchronously, after the browser-only storage read.
  useEffect(() => {
    const restore = async () => {
      let stored: AuthTokens | null = null;
      try {
        const raw = localStorage.getItem(TOKENS_KEY);
        stored = raw ? (JSON.parse(raw) as AuthTokens) : null;
      } catch {
        stored = null;
      }
      if (!stored) {
        setIsLoading(false);
        return;
      }

      let active: AuthTokens | null = stored;
      let profile = await fetchProfile(stored.accessToken);
      if (!profile) {
        active = await refreshTokens(stored.refreshToken);
        profile = active ? await fetchProfile(active.accessToken) : null;
      }

      if (active && profile) {
        try {
          localStorage.setItem(TOKENS_KEY, JSON.stringify(active));
        } catch {}
        setTokens(active);
        setUser(profile);
        scheduleRefresh(active);
      } else {
        try {
          localStorage.removeItem(TOKENS_KEY);
        } catch {}
        setTokens(null);
      }
      setIsLoading(false);
    };
    const timer = setTimeout(() => void restore(), 0);
    return () => clearTimeout(timer);
  }, [fetchProfile, refreshTokens, scheduleRefresh]);

  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, []);

  const signIn = useCallback(
    async (newTokens: AuthTokens) => {
      setTokens(newTokens);
      try {
        localStorage.setItem(TOKENS_KEY, JSON.stringify(newTokens));
      } catch {}
      const profile = await fetchProfile(newTokens.accessToken);
      if (profile) setUser(profile);
      scheduleRefresh(newTokens);
    },
    [fetchProfile, scheduleRefresh]
  );

  const signOut = useCallback(() => {
    // Revoke the refresh token so a copied session can't be refreshed.
    if (tokens?.refreshToken) void authSignOut(tokens.refreshToken);
    setUser(null);
    setTokens(null);
    if (refreshTimer.current) clearInterval(refreshTimer.current);
    try {
      localStorage.removeItem(TOKENS_KEY);
    } catch {}
  }, [tokens]);

  // Keep tabs in sync: signing out (or in) in one tab updates the others.
  useEffect(() => {
    const onStorage = async (e: StorageEvent) => {
      if (e.key !== TOKENS_KEY) return;
      if (!e.newValue) {
        setUser(null);
        setTokens(null);
        if (refreshTimer.current) clearInterval(refreshTimer.current);
        return;
      }
      try {
        const next = JSON.parse(e.newValue) as AuthTokens;
        setTokens(next);
        const profile = await fetchProfile(next.accessToken);
        if (profile) setUser(profile);
      } catch {
        // Ignore malformed values written by something else.
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [fetchProfile]);

  return (
    <AuthContext.Provider
      value={{
        user,
        tokens,
        isLoading,
        isAuthenticated: !!user,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
