import * as React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { api, getToken, setToken, subscribeUnauthorized } from './api';

export interface User {
  id: string;
  email: string;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

interface AuthResponse {
  token: string;
  user: User;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setTok] = React.useState<string | null>(() => getToken());
  const [user, setUser] = React.useState<User | null>(null);
  const [loading] = React.useState(false);

  React.useEffect(() => {
    return subscribeUnauthorized(() => {
      setTok(null);
      setUser(null);
    });
  }, []);

  React.useEffect(() => {
    if (token && !user) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1] ?? '')) as { sub?: string; email?: string };
        if (payload.sub) setUser({ id: payload.sub, email: payload.email ?? '' });
      } catch {
        /* malformed token */
      }
    }
  }, [token, user]);

  const login = React.useCallback(async (email: string, password: string) => {
    const res = await api<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(res.token);
    setTok(res.token);
    setUser(res.user);
  }, []);

  const register = React.useCallback(async (email: string, password: string) => {
    const res = await api<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(res.token);
    setTok(res.token);
    setUser(res.user);
  }, []);

  const logout = React.useCallback(() => {
    setToken(null);
    setTok(null);
    setUser(null);
  }, []);

  const value = React.useMemo<AuthContextValue>(
    () => ({ user, token, loading, login, register, logout }),
    [user, token, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token } = useAuth();
  const location = useLocation();
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
};
