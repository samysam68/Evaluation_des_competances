import React, { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useNavigate } from 'react-router-dom';
import { User as UserIcon, Lock, ArrowRight, Loader2 } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading, error } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      // Error handled by store
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="glass rounded-[2rem] p-8 md:p-12 relative overflow-hidden bg-white/70">
        
        <div className="relative z-10">
          <div className="text-center mb-10">
            <img src="/logo-talents.png" alt="Talents LDM" className="h-28 mx-auto mb-4 object-contain drop-shadow-[0_8px_20px_rgba(14,165,233,0.15)]" />
            <p className="text-slate-500 font-medium text-sm">Connexion à votre session d'entreprise</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Identifiant
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <UserIcon className="h-5 w-5 text-slate-400 group-focus-within:text-primary-500 transition-colors" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="votre.identifiant"
                  className="block w-full pl-11 pr-4 py-3.5 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none shadow-sm"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Mot de passe
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400 group-focus-within:text-primary-500 transition-colors" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-11 pr-4 py-3.5 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none shadow-sm"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm animate-fade-in flex items-center gap-2 font-medium">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-4 group relative overflow-hidden rounded-xl bg-primary hover:bg-primary-600 text-white shadow-[0_8px_20px_-6px_rgba(14,165,233,0.5)] hover:shadow-[0_12px_25px_-6px_rgba(14,165,233,0.6)] transition-all duration-300 transform hover:-translate-y-0.5"
            >
              <div className="px-4 py-4 flex items-center justify-center gap-2">
                {isLoading ? (
                  <Loader2 className="h-5 w-5 text-white animate-spin" />
                ) : (
                  <>
                    <span className="font-semibold text-base">Se connecter</span>
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1.5 transition-transform" />
                  </>
                )}
              </div>
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col items-center gap-4">
            <div className="flex items-center justify-center gap-2 text-xs font-medium text-slate-400">
              <Lock className="h-3.5 w-3.5" />
              <span>Sécurisé via Active Directory</span>
            </div>
            <img src="/logo-ldm.png" alt="LDM Groupe" className="h-14 object-contain" />
          </div>
        </div>
      </div>
    </div>
  );
};
