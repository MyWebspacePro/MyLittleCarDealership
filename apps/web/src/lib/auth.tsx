import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, clearTokens, setAccessToken } from "./api.js";
import type { Role } from "./types.js";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  login: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Session aus dem httpOnly-Cookie wiederherstellen — auch auf /login: Wer
    // dort mit gültiger Session landet, wird von der Login-Seite direkt in
    // die App geschickt. Ein Redirect-Loop ist ausgeschlossen, weil api()
    // bei 401 nicht weiterleitet, solange man schon auf /login ist.
    // Access-Token 401, api() holt sich per /auth/refresh ein neues und
    // wiederholt den Aufruf. Kein Token im localStorage, nichts zu stehlen.
    api<CurrentUser>("/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<{ accessToken: string; user: CurrentUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setAccessToken(data.accessToken);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    // Session serverseitig sperren, damit das Cookie nicht mehr nutzbar ist.
    void fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    clearTokens();
    setUser(null);
    window.location.href = "/login";
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);