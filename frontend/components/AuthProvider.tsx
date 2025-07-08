'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { authService, User, AuthStatus } from '@/lib/auth';

interface AuthContextType extends AuthStatus {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  refreshAuth: async () => {}
});

export function useAuth() {
  return useContext(AuthContext);
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    isAuthenticated: false,
    user: null,
    loading: true
  });

  // Public routes that don't require authentication
  const publicRoutes = ['/login'];
  const isPublicRoute = publicRoutes.includes(pathname);

  // Initialize auth on mount
  useEffect(() => {
    initializeAuth();
  }, []);

  // Redirect logic
  useEffect(() => {
    if (!authStatus.loading) {
      if (!authStatus.isAuthenticated && !isPublicRoute) {
        // Redirect to login if not authenticated and not on public route
        router.push('/login');
      } else if (authStatus.isAuthenticated && pathname === '/login') {
        // Redirect to home if authenticated and on login page
        router.push('/');
      }
    }
  }, [authStatus.loading, authStatus.isAuthenticated, pathname, isPublicRoute, router]);

  const initializeAuth = async () => {
    try {
      const status = await authService.initializeAuth();
      setAuthStatus(status);
    } catch (error) {
      console.error('Failed to initialize auth:', error);
      setAuthStatus({
        isAuthenticated: false,
        user: null,
        loading: false
      });
    }
  };

  const login = async (username: string, password: string) => {
    const response = await authService.login(username, password);
    
    setAuthStatus({
      isAuthenticated: true,
      user: response.user,
      loading: false
    });
  };

  const logout = async () => {
    await authService.logout();
    
    setAuthStatus({
      isAuthenticated: false,
      user: null,
      loading: false
    });
    
    router.push('/login');
  };

  const refreshAuth = async () => {
    await initializeAuth();
  };

  // Show loading screen while checking auth
  if (authStatus.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4"></div>
          <p className="text-muted-foreground">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Block access to protected routes
  if (!authStatus.isAuthenticated && !isPublicRoute) {
    return null; // Will redirect via useEffect
  }

  return (
    <AuthContext.Provider 
      value={{
        ...authStatus,
        login,
        logout,
        refreshAuth
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}