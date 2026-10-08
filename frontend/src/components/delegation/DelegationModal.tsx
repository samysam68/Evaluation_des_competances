import React, { useState } from 'react';
import { X, Search, ShieldCheck, UserPlus, Loader2 } from 'lucide-react';

interface DelegationModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetEmployeeName?: string;
}

const teamMembers = [
  { id: '1', name: 'Jean Dupont', role: 'Superviseur', department: 'Engineering', avatar: 'from-blue-400 to-indigo-500' },
  { id: '2', name: 'Sophie Martin', role: 'Gestionnaire', department: 'Engineering', avatar: 'from-emerald-400 to-teal-500' }
];

export const DelegationModal: React.FC<DelegationModalProps> = ({ isOpen, onClose, targetEmployeeName }) => {
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!selectedUser) return;
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-slide-up">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="text-primary-600" /> Transférer la délégation
            </h2>
            {targetEmployeeName && (
              <p className="text-sm text-slate-500 mt-1 font-medium">Pour l'évaluation de : <span className="font-bold text-slate-700">{targetEmployeeName}</span></p>
            )}
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
            <input 
              type="text" 
              placeholder="Rechercher un manager ou superviseur..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all font-medium"
            />
          </div>

          {/* List */}
          <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Membres éligibles</p>
            {teamMembers.map(member => (
              <div 
                key={member.id}
                onClick={() => setSelectedUser(member.id)}
                className={`flex items-center gap-4 p-3 rounded-2xl border cursor-pointer transition-all ${
                  selectedUser === member.id 
                    ? 'border-primary-500 bg-primary-50 shadow-sm' 
                    : 'border-slate-100 hover:border-primary-200 hover:bg-slate-50'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${member.avatar} flex items-center justify-center text-white font-bold`}>
                  {member.name.charAt(0)}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-800 text-sm">{member.name}</p>
                  <p className="text-xs text-slate-500 font-medium">{member.role} · {member.department}</p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  selectedUser === member.id ? 'border-primary-500' : 'border-slate-300'
                }`}>
                  {selectedUser === member.id && <div className="w-2.5 h-2.5 bg-primary-500 rounded-full"></div>}
                </div>
              </div>
            ))}
          </div>

          {/* Warning */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-sm">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
            <p className="text-amber-800 font-medium">
              En transférant cette délégation, cette personne sera responsable de remplir et valider l'évaluation. Vous garderez un droit de regard.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 flex gap-3 bg-slate-50/50">
          <button onClick={onClose} className="flex-1 py-3 px-4 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors">
            Annuler
          </button>
          <button 
            onClick={handleSubmit}
            disabled={!selectedUser || isSubmitting}
            className="flex-1 py-3 px-4 bg-primary hover:bg-primary-600 text-white font-bold rounded-xl shadow-lg shadow-primary-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:shadow-none"
          >
            {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserPlus className="h-5 w-5" />}
            Confirmer
          </button>
        </div>

      </div>
    </div>
  );
};

// Temp import for the alert icon since it was missing above
import { AlertCircle } from 'lucide-react';
