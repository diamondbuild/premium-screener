import { useState, useEffect, useCallback } from "react";
import {
  apiRequest,
  queryClient,
  API_BASE,
  setAuthToken,
  getAuthToken,
} from "@/lib/queryClient";

export interface AuthUser {
  id: number;
  email: string;
  displayName: string | null;
  subscriptionStatus: "free" | "active" | "past_due" | "canceled";
  subscriptionEndsAt: string | null;
  createdAt: string;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  isPremium: boolean;
  login: (
    email: string,
    password: string
  ) => Promise<{ error?: string }>;
  register: (
    email: string,
    password: string,
    displayName?: string
  ) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  startCheckout: () => Promise<void>;
  manageSubscription: () => Promise<void>;
}

let cachedUser: AuthUser | null = null;
let listeners: Set<() => void> = new Set();

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(cachedUser);
  const [loading, setLoading] = useState(cachedUser === null && getAuthToken() !== null);

  // Subscribe to auth state changes
  useEffect(() => {
    const listener = () => setUser(cachedUser);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  // Initial fetch — only if we have a token (from a previous login in this session)
  useEffect(() => {
    if (cachedUser !== null) {
      setLoading(false);
      return;
    }
    // No token means no session — go straight to auth page
    if (!getAuthToken()) {
      setLoading(false);
      return;
    }
    // We have a token, verify it
    fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    })
      .then((r) => r.json())
      .then((data) => {
        cachedUser = data.user || null;
        if (!data.user) setAuthToken(null); // token was invalid
        setUser(cachedUser);
        setLoading(false);
        notifyListeners();
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  const isPremium =
    user?.subscriptionStatus === "active" ||
    user?.subscriptionStatus === "past_due";

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (res.ok && data.user && data.token) {
          setAuthToken(data.token);
          cachedUser = data.user;
          setUser(cachedUser);
          notifyListeners();
          queryClient.invalidateQueries();
          return {};
        }
        return { error: data.error || "Invalid email or password" };
      } catch (err: any) {
        return { error: "Network error. Please try again." };
      }
    },
    []
  );

  const register = useCallback(
    async (email: string, password: string, displayName?: string) => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, displayName }),
        });
        const data = await res.json();
        if (res.ok && data.user && data.token) {
          setAuthToken(data.token);
          cachedUser = data.user;
          setUser(cachedUser);
          notifyListeners();
          queryClient.invalidateQueries();
          return {};
        }
        return { error: data.error || "Registration failed" };
      } catch (err: any) {
        return { error: "Network error. Please try again." };
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch {}
    setAuthToken(null);
    cachedUser = null;
    setUser(null);
    notifyListeners();
    queryClient.invalidateQueries();
  }, []);

  const refresh = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      cachedUser = data.user || null;
      if (!data.user) setAuthToken(null);
      setUser(cachedUser);
      notifyListeners();
    } catch {}
  }, []);

  const startCheckout = useCallback(async () => {
    try {
      const res = await apiRequest("POST", "/api/stripe/create-checkout");
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "_blank");
      }
    } catch (err: any) {
      console.error("Checkout error:", err);
    }
  }, []);

  const manageSubscription = useCallback(async () => {
    try {
      const res = await apiRequest("POST", "/api/stripe/create-portal");
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "_blank");
      }
    } catch (err: any) {
      console.error("Portal error:", err);
    }
  }, []);

  return {
    user,
    loading,
    isPremium,
    login,
    register,
    logout,
    refresh,
    startCheckout,
    manageSubscription,
  };
}
