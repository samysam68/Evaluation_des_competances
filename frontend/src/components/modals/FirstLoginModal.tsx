import { useState } from 'react';
import { Lock, Mail, Eye, EyeOff, CheckCircle, XCircle, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { authFetch } from '../../services/api';

function Rule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`flex items-center gap-1 text-xs ${ok ? 'text-green-600' : 'text-gray-400'}`}>
      {ok ? <CheckCircle size={12} /> : <XCircle size={12} />}
      {label}
    </span>
  );
}

export function FirstLoginModal() {
  const { user, patchUser } = useAuthStore();

  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const has10     = password.length >= 10;
  const hasUpper  = /[A-Z]/.test(password);
  const hasDigit  = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const pwdValid  = has10 && hasUpper && hasDigit && hasSpecial;
  const matches   = password === confirm && confirm.length > 0;
  const canSubmit = emailValid && pwdValid && matches && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const r = await authFetch('/api/auth/first-login', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), newPassword: password }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || 'Erreur serveur.');
      patchUser({ email: email.trim(), mustChangePassword: false });
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue.');
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-xl">
            <ShieldCheck size={22} className="text-white" />
          </div>
          <div>
            <h2 className="text-white font-bold text-lg leading-tight">Première connexion</h2>
            <p className="text-blue-100 text-xs mt-0.5">Veuillez sécuriser votre compte avant de continuer</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Adresse email
            </label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={`w-full pl-9 pr-4 py-2.5 border rounded-lg text-sm outline-none transition
                  ${emailValid ? 'border-green-400 focus:ring-2 focus:ring-green-200' : 'border-gray-300 focus:ring-2 focus:ring-blue-200'}`}
                placeholder="votre.email@ldmgroupe.com"
                autoComplete="email"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Vérifiez que c'est bien votre adresse. Si elle est incorrecte, modifiez-la.
            </p>
          </div>

          {/* Nouveau mot de passe */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nouveau mot de passe
            </label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-9 pr-10 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200 transition"
                placeholder="••••••••••"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPwd(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            {password.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <Rule ok={has10}      label="10 caractères minimum" />
                <Rule ok={hasUpper}   label="Une majuscule" />
                <Rule ok={hasDigit}   label="Un chiffre" />
                <Rule ok={hasSpecial} label="Un caractère spécial" />
              </div>
            )}
          </div>

          {/* Confirmation */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirmer le mot de passe
            </label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className={`w-full pl-9 pr-10 py-2.5 border rounded-lg text-sm outline-none transition
                  ${confirm.length > 0 ? (matches ? 'border-green-400 focus:ring-2 focus:ring-green-200' : 'border-red-400 focus:ring-2 focus:ring-red-200') : 'border-gray-300 focus:ring-2 focus:ring-blue-200'}`}
                placeholder="••••••••••"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {confirm.length > 0 && !matches && (
              <p className="text-xs text-red-500 mt-1">Les mots de passe ne correspondent pas.</p>
            )}
          </div>

          {/* Erreur serveur */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Bouton */}
          <button
            type="submit"
            disabled={!canSubmit}
            className={`w-full py-2.5 rounded-lg font-semibold text-sm transition
              ${canSubmit
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
          >
            {submitting ? 'Enregistrement…' : 'Confirmer et accéder à mon espace'}
          </button>
        </form>
      </div>
    </div>
  );
}
