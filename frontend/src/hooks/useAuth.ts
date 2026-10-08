import { useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { authService } from '../services/authService';

export const useAuth = () => {
  const {
    user,
    token,
    isAuthenticated,
    isLoading,
    error,
    setToken,
    setLoading,
    setError,
    clearError,
    // @ts-ignore
    setUser,
    // @ts-ignore
    setAuthData,
    // @ts-ignore
    logout: logoutStore,
  } = useAuthStore();

  const loginWithAD = useCallback(async () => {
    try {
      setLoading(true);
      clearError();

      // Appel au service AD
      // @ts-ignore
      const response = await authService.loginWithAD();
      
      if (response) {
        setAuthData(response);
        return true;
      }
      return false;
    } catch (err: any) {
      const errorMsg = err?.message || 'Erreur de connexion Active Directory';
      setError(errorMsg);
      console.error('AD Login Error:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, setError, setAuthData]);

  const loginWithCredentials = useCallback(
    async (username: string, password: string) => {
      try {
        setLoading(true);
        clearError();

        // @ts-ignore
        const response = await authService.loginWithCredentials(username, password);
        
        if (response) {
          setAuthData(response);
          return true;
        }
        return false;
      } catch (err: any) {
        const errorMsg = err?.message || 'Identifiants invalides';
        setError(errorMsg);
        console.error('Credentials Login Error:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [setLoading, clearError, setError, setAuthData]
  );

  const logout = useCallback(async () => {
    try {
      setLoading(true);
      await authService.logout();
      logoutStore();
    } catch (err) {
      console.error('Logout Error:', err);
    } finally {
      setLoading(false);
    }
  }, [setLoading, logoutStore]);

  const refreshToken = useCallback(async () => {
    try {
      // @ts-ignore
      const response = await authService.refreshToken();
      if (response) {
        setToken(response.token);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Token Refresh Error:', err);
      logout();
      return false;
    }
  }, [setToken, logout]);

  return {
    user,
    token,
    isAuthenticated,
    isLoading,
    error,
    loginWithAD,
    loginWithCredentials,
    logout,
    refreshToken,
    clearError,
  };
};
