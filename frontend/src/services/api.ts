import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios';
import { useAuthStore } from '../store/authStore';

// Configuration de base
// @ts-ignore
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5050';

// Créer l'instance Axios
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Intercepteur de requête - Ajouter le token
apiClient.interceptors.request.use(
  (config) => {
    const { token } = useAuthStore.getState();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Intercepteur de réponse - Gérer les erreurs
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  async (error: AxiosError) => {
    // Token expiré → déconnecter et rediriger
    if (error.response?.status === 401) {
      const url = (error.config as any)?.url ?? '';
      if (!url.includes('/api/auth/')) {
        useAuthStore.getState().logout();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Drop-in replacement for fetch() that auto-injects the JWT token.
// On 401 from a PROTECTED route → auto logout + redirect to /login.
// Never redirects for /api/auth/* (login failure = wrong password, not expired token).
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { token } = useAuthStore.getState();
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const isAuthEndpoint = url.includes('/api/auth/');
  const alreadyOnLogin = window.location.pathname === '/login';

  if (res.status === 401 && !isAuthEndpoint && !alreadyOnLogin) {
    useAuthStore.getState().logout();
    window.location.href = '/login';
  }

  // Le serveur bloque toute l'API tant que le mot de passe par défaut n'a
  // pas été changé (voir backend/src/middleware/auth.middleware.ts). On
  // reflète ce blocage dans le store pour que l'interface (modale de
  // première connexion, écran SuperAdmin) réagisse même si l'état local
  // était désynchronisé.
  if (res.status === 403 && !isAuthEndpoint) {
    try {
      const body = await res.clone().json();
      if (body?.code === 'MUST_CHANGE_PASSWORD') {
        const { user, patchUser } = useAuthStore.getState();
        if (user && !user.mustChangePassword) {
          patchUser({ mustChangePassword: true });
        }
      }
    } catch { /* réponse non-JSON, ignorer */ }
  }

  return res;
}

export default apiClient;
