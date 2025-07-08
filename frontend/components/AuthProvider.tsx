'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface User {
  id: string;
  username: string;
  role: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  // Simplified auth - always allow access for now
  const [authStatus, setAuthStatus] = useState<{
    isAuthenticated: boolean;
    user: User | null;
    loading: boolean;
  }>({
    isAuthenticated: true, // Always authenticated for now
    user: { id: 'temp', username: 'temp', role: 'admin' },
    loading: false
  });

  const login = async (username: string, password: string) => {
    // Mock login - always succeeds
    setAuthStatus({
      isAuthenticated: true,
      user: { id: username, username: username, role: 'admin' },
      loading: false
    });
  };

  const logout = async () => {
    // Mock logout
    setAuthStatus({
      isAuthenticated: false,
      user: null,
      loading: false
    });
  };

  return (
    <AuthContext.Provider 
      value={{
        ...authStatus,
        login,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}