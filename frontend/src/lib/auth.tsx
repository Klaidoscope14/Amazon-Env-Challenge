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

interface User {
  email: string;
  name: string;
  institution?: string;
  role?: string;
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

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://auzr0rreg6.execute-api.ap-south-1.amazonaws.com/prod";

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

  useEffect(() => {
    try {
      const stored = localStorage.getItem(TOKENS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AuthTokens;
        setTokens(parsed);
        fetchProfile(parsed.accessToken).then(async (profile) => {
          if (profile) {
            setUser(profile);
            scheduleRefresh(parsed);
          } else {
            const newTokens = await refreshTokens(parsed.refreshToken);
            if (newTokens) {
              setTokens(newTokens);
              try {
                localStorage.setItem(TOKENS_KEY, JSON.stringify(newTokens));
              } catch {}
              const retryProfile = await fetchProfile(newTokens.accessToken);
              if (retryProfile) {
                setUser(retryProfile);
                scheduleRefresh(newTokens);
              } else {
                localStorage.removeItem(TOKENS_KEY);
                setTokens(null);
              }
            } else {
              localStorage.removeItem(TOKENS_KEY);
              setTokens(null);
            }
          }
          setIsLoading(false);
        });
        return;
      }
    } catch {}
    setIsLoading(false);
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
    setUser(null);
    setTokens(null);
    if (refreshTimer.current) clearInterval(refreshTimer.current);
    try {
      localStorage.removeItem(TOKENS_KEY);
    } catch {}
  }, []);

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
