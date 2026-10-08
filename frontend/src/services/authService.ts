import axios from 'axios';
import { LoginResponse } from '../types/auth.types';

class AuthService {
  // @ts-ignore
  private readonly API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api/auth` : 'http://localhost:5050/api/auth';
  
  // @ts-ignore
  private adConfig = {
    // @ts-ignore
    clientId: import.meta.env.VITE_AD_CLIENT_ID || '',
    // @ts-ignore
    tenantId: import.meta.env.VITE_AD_TENANT_ID || '',
  };

  async login(credentials: any): Promise<LoginResponse> {
    try {
      // Pour le développement avec json-server
      const response = await axios.post<LoginResponse>(`${this.API_URL}/login`, credentials);
      
      if (response.data.token) {
        localStorage.setItem('authToken', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
      }
      
      return response.data;
    } catch (error) {
      console.error('Login error:', error);
      throw new Error('Échec de la connexion. Vérifiez vos identifiants.');
    }
  }

  logout(): void {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
  }

  getCurrentUser() {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }

  getToken(): string | null {
    return localStorage.getItem('authToken');
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }
}

export const authService = new AuthService();
