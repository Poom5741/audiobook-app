import axios from 'axios';

const AUTH_API_BASE = process.env.NEXT_PUBLIC_AUTH_URL || 'http://localhost:8002';

// Production security: Auth bypass is removed for production builds
const AUTH_DISABLED = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DISABLE_AUTH === 'true';

const authApi = axios.create({
  baseURL: `${AUTH_API_BASE}/api/auth`,
  timeout: 10000,
  withCredentials: true, // Include cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

// Types
export interface User {
  id: string;
  username: string;
  role: string;
  lastLogin?: string;
  createdAt?: string;
}

export interface LoginResponse {
  message: string;
  user: User;
  accessToken: string;
  expiresIn: string;
  tokenType: string;
}

export interface AuthStatus {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;
}

// Auth API functions
export const authService = {
  // Login
  async login(username: string, password: string): Promise<LoginResponse> {
    // Development-only auth bypass (removed in production)
    if (AUTH_DISABLED && process.env.NODE_ENV === 'development') {
      console.warn('Development mode: Auth disabled - generating temporary token');
      const tempToken = `dev-token-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const mockResponse = {
        message: 'Login successful (development mode)',
        user: { id: 'dev-user', username: username, role: 'admin' } as User,
        accessToken: tempToken,
        expiresIn: '1h',
        tokenType: 'Bearer'
      };
      localStorage.setItem('accessToken', mockResponse.accessToken);
      return mockResponse;
    }

    try {
      const response = await authApi.post('/login', { username, password });
      
      // Store access token in localStorage for API calls
      if (response.data.accessToken) {
        localStorage.setItem('accessToken', response.data.accessToken);
        this.setAuthHeader(response.data.accessToken);
      }
      
      return response.data;
    } catch (error: any) {
      // Production security: No fallback authentication allowed
      const errorMessage = error.message || '';
      if (errorMessage.includes('Network Error') || errorMessage.includes('timeout') || error.code === 'ECONNREFUSED') {
        throw new Error('Authentication service is unavailable. Please try again later or contact support.');
      }

      if (error.response?.status === 429) {
        throw new Error(`Too many login attempts. Please try again in ${error.response.data.retryAfter} seconds.`);
      }
      if (error.response?.status === 401) {
        throw new Error(error.response.data.message || 'Invalid credentials');
      }
      throw new Error(error.response?.data?.message || 'Login failed');
    }
  },

  // Logout
  async logout(): Promise<void> {
    try {
      await authApi.post('/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('accessToken');
      this.clearAuthHeader();
    }
  },

  // Get current user
  async getCurrentUser(): Promise<User | null> {
    try {
      const response = await authApi.get('/me');
      return response.data.user;
    } catch (error) {
      console.error('Get current user error:', error);
      return null;
    }
  },

  // Verify token
  async verifyToken(): Promise<{ valid: boolean; user?: User }> {
    try {
      const response = await authApi.post('/verify');
      return { valid: true, user: response.data.user };
    } catch (error) {
      return { valid: false };
    }
  },

  // Change password
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    try {
      await authApi.post('/change-password', {
        currentPassword,
        newPassword
      });
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('Current password is incorrect');
      }
      throw new Error(error.response?.data?.message || 'Failed to change password');
    }
  },

  // Get auth status
  async getStatus(): Promise<any> {
    try {
      const response = await authApi.get('/status');
      return response.data;
    } catch (error) {
      console.error('Get auth status error:', error);
      return { serviceStatus: 'error' };
    }
  },

  // Refresh access token
  async refreshToken(): Promise<{ accessToken: string; expiresIn: string; tokenType: string }> {
    try {
      const response = await authApi.post('/refresh');
      
      if (response.data.accessToken) {
        localStorage.setItem('accessToken', response.data.accessToken);
        this.setAuthHeader(response.data.accessToken);
      }
      
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('Refresh token expired. Please log in again.');
      }
      throw new Error(error.response?.data?.message || 'Token refresh failed');
    }
  },

  // Try to refresh token (used internally)
  async tryRefreshToken(): Promise<{ success: boolean; user?: User }> {
    try {
      const refreshResult = await this.refreshToken();
      const user = await this.getCurrentUser();
      return { success: true, user: user || undefined };
    } catch (error) {
      console.warn('Token refresh failed:', error);
      return { success: false };
    }
  },

  // Revoke all user sessions
  async revokeAllSessions(): Promise<void> {
    try {
      await authApi.post('/revoke-all');
    } catch (error) {
      console.error('Revoke all sessions error:', error);
      throw new Error('Failed to revoke sessions');
    }
  },

  // Set auth header for API calls
  setAuthHeader(token: string) {
    authApi.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  },

  // Clear auth header
  clearAuthHeader() {
    delete authApi.defaults.headers.common['Authorization'];
  },

  // Initialize auth on app start
  async initializeAuth(): Promise<AuthStatus> {
    // Development-only auth bypass (removed in production)
    if (AUTH_DISABLED && process.env.NODE_ENV === 'development') {
      console.warn('Development mode: Auth disabled');
      return { 
        isAuthenticated: true, 
        user: { id: 'dev-user', username: 'developer', role: 'admin' } as User, 
        loading: false 
      };
    }

    const token = localStorage.getItem('accessToken');
    
    if (!token) {
      return { isAuthenticated: false, user: null, loading: false };
    }

    this.setAuthHeader(token);
    
    try {
      const verification = await this.verifyToken();
      
      if (verification.valid && verification.user) {
        return {
          isAuthenticated: true,
          user: verification.user,
          loading: false
        };
      } else {
        // Token invalid, try to refresh
        const refreshResult = await this.tryRefreshToken();
        if (refreshResult.success) {
          return {
            isAuthenticated: true,
            user: refreshResult.user!,
            loading: false
          };
        }
        
        // Refresh failed, clean up
        localStorage.removeItem('accessToken');
        this.clearAuthHeader();
        return { isAuthenticated: false, user: null, loading: false };
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      
      // Production security: Always require valid authentication
      const errorMessage = (error as any)?.message || '';
      if (errorMessage.includes('Network Error') || errorMessage.includes('timeout')) {
        console.error('Auth service unavailable - authentication required');
        return { 
          isAuthenticated: false, 
          user: null, 
          loading: false 
        };
      }
      
      localStorage.removeItem('accessToken');
      this.clearAuthHeader();
      return { isAuthenticated: false, user: null, loading: false };
    }
  }
};

// Auth context hook utilities
export function useAuthContext() {
  if (typeof window === 'undefined') {
    return { isAuthenticated: false, user: null, loading: true };
  }

  // This will be implemented with React Context in the actual component
  return { isAuthenticated: false, user: null, loading: false };
}

// Check if user is authenticated
export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  
  const token = localStorage.getItem('accessToken');
  return !!token;
}

// Get stored token
export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  
  return localStorage.getItem('accessToken');
}

// Middleware to add auth header to API calls
export function addAuthToApi(apiInstance: any) {
  apiInstance.interceptors.request.use((config: any) => {
    const token = getStoredToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  // Handle 401 responses
  apiInstance.interceptors.response.use(
    (response: any) => response,
    async (error: any) => {
      if (error.response?.status === 401) {
        // Token expired - try to refresh
        if (error.response?.data?.code === 'TOKEN_EXPIRED') {
          try {
            await authService.refreshToken();
            // Retry the original request
            const token = localStorage.getItem('accessToken');
            if (token) {
              error.config.headers.Authorization = `Bearer ${token}`;
              return apiInstance.request(error.config);
            }
          } catch (refreshError) {
            console.warn('Auto-refresh failed:', refreshError);
          }
        }
        
        // Token invalid or refresh failed - clean up and redirect
        localStorage.removeItem('accessToken');
        authService.clearAuthHeader();
        
        // Redirect to login if on client side
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
      }
      return Promise.reject(error);
    }
  );
}

export default authService;