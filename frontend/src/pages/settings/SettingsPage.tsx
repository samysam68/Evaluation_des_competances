import React, { useState } from 'react';
import { Settings, Lock, Save, Shield, Loader2 } from 'lucide-react';
import { API_BASE_URL, authFetch } from '../../services/api';

export const SettingsPage: React.FC = () => {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (pwForm.next !== pwForm.confirm) {
      setPwError('Les mots de passe ne correspondent pas.');
      return;
    }
    if (pwForm.next.length < 6) {
      setPwError('Le mot de passe doit faire au moins 6 caractères.');
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/auth/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next })
      });
      const data = await res.json();
      if (!res.ok) {
        setPwError(data.message || 'Erreur lors de la mise à jour.');
      } else {
        setSaved(true);
        setPwForm({ current: '', next: '', confirm: '' });
        setTimeout(() => setSaved(false), 4000);
      }
    } catch {
      setPwError('Erreur réseau. Veuillez réessayer.');
    }
    setSaving(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-12 animate-fade-in">

      {/* Header */}
      <div>
        <h1 className="text-3xl md:text-4xl font-black text-slate-800 tracking-tight flex items-center gap-3">
          <Settings className="h-8 w-8 text-primary-500" />
          Paramètres du compte
        </h1>
        <p className="text-slate-500 font-medium mt-2">Gérez la sécurité de votre compte.</p>
      </div>

      {/* Security Card */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Sécurité & Mot de passe</h2>
            <p className="text-xs text-slate-400 font-medium">Définissez un mot de passe local pour la connexion hors réseau AD</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-2">
              <Lock className="inline h-3.5 w-3.5 mr-1 opacity-60" />
              Mot de passe actuel
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={pwForm.current}
              onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all font-medium"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-2">Nouveau mot de passe</label>
              <input
                type="password"
                placeholder="Minimum 6 caractères"
                value={pwForm.next}
                onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all font-medium"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-2">Confirmer le mot de passe</label>
              <input
                type="password"
                placeholder="Répétez le nouveau mot de passe"
                value={pwForm.confirm}
                onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all font-medium"
              />
            </div>
          </div>

          {pwError && (
            <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-100 rounded-xl">
              <span className="text-rose-500 text-lg leading-none">⚠</span>
              <p className="text-sm font-semibold text-rose-600">{pwError}</p>
            </div>
          )}

          {saved && (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
              <span className="text-emerald-500 text-lg leading-none">✓</span>
              <p className="text-sm font-bold text-emerald-600">Mot de passe mis à jour avec succès !</p>
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex-shrink-0 flex items-center gap-2 px-7 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold transition-all shadow-md shadow-primary-500/20 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              Mettre à jour
            </button>
          </div>
        </form>
      </div>

    </div>
  );
};
