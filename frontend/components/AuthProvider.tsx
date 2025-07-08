'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { authService, User, AuthStatus } from '@/lib/auth';

interface AuthContextType extends AuthStatus {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
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
  const [isClient, setIsClient] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    isAuthenticated: false,
    user: null,
    loading: true
  });

  // Check if we're on the client side
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Public routes that don't require authentication
  const publicRoutes = ['/login'];
  const isPublicRoute = publicRoutes.includes(pathname);

  // Initialize auth on mount
  useEffect(() => {
    if (isClient) {
      initializeAuth();
    }
  }, [isClient]);

  // Redirect logic
  useEffect(() => {
    if (isClient && !authStatus.loading) {
      if (!authStatus.isAuthenticated && !isPublicRoute) {
        // Redirect to login if not authenticated and not on public route
        router.push('/login');
      } else if (authStatus.isAuthenticated && pathname === '/login') {
        // Redirect to home if authenticated and on login page
        router.push('/');
      }
    }
  }, [isClient, authStatus.loading, authStatus.isAuthenticated, pathname, isPublicRoute, router]);

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

  // During SSR or client loading, show children directly
  if (!isClient || authStatus.loading) {
    return (
      <AuthContext.Provider 
        value={{
          ...authStatus,
          login,
          logout,
          refreshAuth
        }}
      >
        {!isClient ? children : (
          <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4"></div>
              <p className="text-muted-foreground">Checking authentication...</p>
            </div>
          </div>
        )}
      </AuthContext.Provider>
    );
  }

  // Block access to protected routes (client-side only)
  if (!authStatus.isAuthenticated && !isPublicRoute) {
    return (
      <AuthContext.Provider 
        value={{
          ...authStatus,
          login,
          logout,
          refreshAuth
        }}
      >
        {null} {/* Will redirect via useEffect */}
      </AuthContext.Provider>
    );
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