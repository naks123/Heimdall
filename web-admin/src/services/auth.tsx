import { createContext, useContext, useState, type ReactNode } from "react";

export interface AuthState {
  type: "company" | "driver" | null;
  companyId?: string;
  driverId?: string;
}

interface AuthContextType {
  auth: AuthState;
  login: (type: "company" | "driver", id: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY = "heimdall_auth";

function loadAuth(): AuthState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AuthState;
  } catch {
    // ignore
  }
  return { type: null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(loadAuth);

  function login(type: "company" | "driver", id: string) {
    const next: AuthState =
      type === "company"
        ? { type: "company", companyId: id }
        : { type: "driver", driverId: id };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setAuth(next);
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setAuth({ type: null });
  }

  return (
    <AuthContext.Provider value={{ auth, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
