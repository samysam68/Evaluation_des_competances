import React, { useState } from 'react';
import { Search, ChevronRight, Filter, UserCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const allEmployees = [
  { id: '1', name: "Alice Dupont", role: "Employe", status: "À évaluer", team: "Engineering", avatar: "from-orange-400 to-red-500" },
  { id: '2', name: "Marc Tremblay", role: "Superviseur", status: "Évalué", team: "Engineering", avatar: "from-emerald-400 to-teal-500" },
  { id: '3', name: "Sophie Martin", role: "Responsable", status: "En cours", team: "Design", avatar: "from-blue-400 to-indigo-500" },
  { id: '4', name: "Karim Benali", role: "Gestionnaire", status: "À évaluer", team: "Engineering", avatar: "from-purple-400 to-pink-500" },
];

const statusColor: Record<string, string> = {
  "À évaluer": "text-orange-600 bg-orange-100 border-orange-200",
  "Évalué": "text-emerald-600 bg-emerald-100 border-emerald-200",
  "En cours": "text-blue-600 bg-blue-100 border-blue-200",
};

export const TeamPage: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const filtered = allEmployees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.role.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black text-slate-800 tracking-tight mb-1">Mon Équipe</h1>
        <p className="text-slate-500 font-medium">Gérez et évaluez les membres de votre équipe.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-6">
        {[
          { label: "Total membres", value: allEmployees.length, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100" },
          { label: "Évalués", value: allEmployees.filter(e => e.status === "Évalué").length, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100" },
          { label: "À évaluer", value: allEmployees.filter(e => e.status === "À évaluer").length, color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-100" },
        ].map((s, i) => (
          <div key={i} className={`bg-white p-6 rounded-3xl border ${s.border} shadow-sm text-center`}>
            <p className={`text-4xl font-black ${s.color} mb-1`}>{s.value}</p>
            <p className="text-slate-500 font-semibold text-sm">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Team List */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
          <h2 className="text-xl font-bold text-slate-800">Liste des Membres</h2>
          <div className="flex gap-3">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Rechercher..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none w-52 transition-all"
              />
            </div>
            <button className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
              <Filter className="h-4 w-4" /> Filtrer
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {filtered.map((emp) => (
            <div key={emp.id} className="flex items-center justify-between p-5 rounded-2xl border border-slate-100 hover:border-primary-200 hover:bg-primary-50/40 transition-all group">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${emp.avatar} flex items-center justify-center text-white font-black text-lg shadow-md`}>
                  {emp.name.charAt(0)}
                </div>
                <div>
                  <p className="font-bold text-slate-800">{emp.name}</p>
                  <p className="text-sm text-slate-500 font-medium">{emp.role} · {emp.team}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className={`px-3 py-1.5 rounded-full text-xs font-bold border ${statusColor[emp.status]}`}>
                  {emp.status}
                </span>
                {emp.status === "À évaluer" && (
                  <button 
                    onClick={() => navigate(`/dashboard/evaluations/new?name=${encodeURIComponent(emp.name)}&role=${encodeURIComponent(emp.role)}`)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary-600 transition-colors shadow-sm"
                  >
                    <UserCheck className="h-3.5 w-3.5" /> Évaluer
                  </button>
                )}
                <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-primary-600 transition-colors" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
