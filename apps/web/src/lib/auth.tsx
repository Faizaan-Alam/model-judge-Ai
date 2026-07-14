import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";

type User = { id: string; email: string; name: string; role: string };

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  token: string | null;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(localStorage.getItem("mj_token"));

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    api<{ user: User }>("/api/v1/auth/me")
      .then((r) => setUser(r.user))
      .catch(() => {
        localStorage.removeItem("mj_token");
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      loading,
      token,
      async login(email, password) {
        const r = await api<{ accessToken: string; user: User }>("/api/v1/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        localStorage.setItem("mj_token", r.accessToken);
        setToken(r.accessToken);
        setUser(r.user);
      },
      async register(name, email, password) {
        const r = await api<{ accessToken: string; user: User }>("/api/v1/auth/register", {
          method: "POST",
          body: JSON.stringify({ name, email, password }),
        });
        localStorage.setItem("mj_token", r.accessToken);
        setToken(r.accessToken);
        setUser(r.user);
      },
      logout() {
        localStorage.removeItem("mj_token");
        setToken(null);
        setUser(null);
      },
    }),
    [user, loading, token]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
