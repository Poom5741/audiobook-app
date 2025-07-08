import axios from 'axios';

const AUTH_API_BASE = process.env.NEXT_PUBLIC_AUTH_URL || 'http://localhost:8002';

// Check if auth service is disabled
const AUTH_DISABLED = process.env.NEXT_PUBLIC_DISABLE_AUTH === 'true';

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
  token: string;
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
    // If auth is disabled, allow any login
    if (AUTH_DISABLED) {
      const mockResponse = {
        message: 'Login successful (auth disabled)',
        user: { id: 'guest', username: username, role: 'admin' } as User,
        token: 'mock-token'
      };
      localStorage.setItem('authToken', mockResponse.token);
      return mockResponse;
    }

    try {
      const response = await authApi.post('/login', { username, password });
      
      // Store token in localStorage for API calls
      if (response.data.token) {
        localStorage.setItem('authToken', response.data.token);
        this.setAuthHeader(response.data.token);
      }
      
      return response.data;
    } catch (error: any) {
      // If auth service is unreachable, provide fallback login
      const errorMessage = error.message || '';
      if (errorMessage.includes('Network Error') || errorMessage.includes('timeout') || error.code === 'ECONNREFUSED') {
        console.warn('Auth service unavailable, using fallback login');
        const fallbackResponse = {
          message: 'Login successful (fallback mode)',
          user: { id: 'fallback', username: username, role: 'admin' } as User,
          token: 'fallback-token'
        };
        localStorage.setItem('authToken', fallbackResponse.token);
        return fallbackResponse;
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
      localStorage.removeItem('authToken');
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
    // If auth is disabled, allow access
    if (AUTH_DISABLED) {
      return { 
        isAuthenticated: true, 
        user: { id: 'guest', username: 'guest', role: 'admin' } as User, 
        loading: false 
      };
    }

    const token = localStorage.getItem('authToken');
    
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
        // Token invalid, clean up
        localStorage.removeItem('authToken');
        this.clearAuthHeader();
        return { isAuthenticated: false, user: null, loading: false };
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      
      // If auth service is unreachable, require manual login
      const errorMessage = (error as any)?.message || '';
      if (errorMessage.includes('Network Error') || errorMessage.includes('timeout')) {
        console.warn('Auth service unavailable, login required');
        return { 
          isAuthenticated: false, 
          user: null, 
          loading: false 
        };
      }
      
      localStorage.removeItem('authToken');
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
  
  const token = localStorage.getItem('authToken');
  return !!token;
}

// Get stored token
export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  
  return localStorage.getItem('authToken');
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
    (error: any) => {
      if (error.response?.status === 401) {
        // Token expired or invalid
        localStorage.removeItem('authToken');
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