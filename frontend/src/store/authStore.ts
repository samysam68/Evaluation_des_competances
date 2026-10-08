import { create } from 'zustand';
import { User, LoginResponse } from '../types/auth.types';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  logout: () => void;
  setAuthData: (data: LoginResponse) => void;
  login: (username: string, password: string) => Promise<void>;
  patchUser: (patch: Partial<User>) => void;
}

// ── Session duration : 2 heures ──
const SESSION_DURATION = 2 * 60 * 60 * 1000;

let sessionTimerId: ReturnType<typeof setTimeout> | null = null;

function clearStorage() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('user');
  localStorage.removeItem('loginTime');
}

// ── Vérification au démarrage : session expirée ? ──
const storedToken    = localStorage.getItem('authToken');
const storedUser     = localStorage.getItem('user');
const storedLoginTime = localStorage.getItem('loginTime');

const isExpired =
  !storedToken || !storedUser
    ? false
    : storedLoginTime
      ? Date.now() - parseInt(storedLoginTime, 10) >= SESSION_DURATION
      : true; // session sans loginTime (ancienne session) → considérée expirée

if (isExpired) clearStorage();

const validSession = !isExpired && !!(storedToken && storedUser);

export const useAuthStore = create<AuthState>((set) => {
  // Lance le compte à rebours de déconnexion automatique
  const scheduleAutoLogout = (remainingMs: number) => {
    if (sessionTimerId) clearTimeout(sessionTimerId);
    sessionTimerId = setTimeout(() => {
      clearStorage();
      set({ user: null, token: null, isAuthenticated: false, error: null });
      window.location.replace('/login');
    }, remainingMs);
  };

  // Si la session est toujours valide au rechargement, replanifier le timer pour le temps restant
  if (validSession && storedLoginTime) {
    const elapsed = Date.now() - parseInt(storedLoginTime, 10);
    scheduleAutoLogout(SESSION_DURATION - elapsed);
  }

  return {
    user:            validSession ? JSON.parse(storedUser!) : null,
    token:           validSession ? storedToken             : null,
    isAuthenticated: validSession,
    isLoading:       false,
    error:           null,

    setUser:    (user)    => set({ user }),
    setToken:   (token)   => {
      if (token) localStorage.setItem('authToken', token);
      else       localStorage.removeItem('authToken');
      set({ token, isAuthenticated: !!token });
    },
    setLoading: (loading) => set({ isLoading: loading }),
    setError:   (error)   => set({ error }),
    clearError: ()        => set({ error: null }),

    logout: () => {
      if (sessionTimerId) { clearTimeout(sessionTimerId); sessionTimerId = null; }
      clearStorage();
      set({ user: null, token: null, isAuthenticated: false, error: null });
    },

    setAuthData: (data) => {
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('loginTime', Date.now().toString());
      scheduleAutoLogout(SESSION_DURATION);
      set({ user: data.user, token: data.token, isAuthenticated: true, error: null });
    },

    patchUser: (patch) => {
      set((state) => {
        const updated = state.user ? { ...state.user, ...patch } : state.user;
        if (updated) localStorage.setItem('user', JSON.stringify(updated));
        return { user: updated };
      });
    },

    login: async (username, password) => {
      set({ isLoading: true, error: null });
      try {
        // @ts-ignore
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5050';
        const response = await fetch(`${API_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Login failed');

        localStorage.setItem('authToken', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('loginTime', Date.now().toString());
        scheduleAutoLogout(SESSION_DURATION);

        set({
          user: data.user,
          token: data.token,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      } catch (error: any) {
        set({ isLoading: false, error: error.message || 'An unexpected error occurred' });
        throw error;
      }
    },
  };
});
