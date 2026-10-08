import React, { useState } from 'react';
import { Users, AlertCircle, FileCheck, Search, ChevronRight, Clock } from 'lucide-react';

const employees = [
  { name: "Alice Dupont", role: "Développeur Front", status: "À faire", statusColor: "text-orange-600 bg-orange-100 border-orange-200", avatar: "from-orange-400 to-red-500" },
  { name: "Marc Tremblay", role: "Développeur Back", status: "Terminé", statusColor: "text-emerald-600 bg-emerald-100 border-emerald-200", avatar: "from-emerald-400 to-teal-500" },
  { name: "Sophie Martin", role: "UX Designer", status: "En cours", statusColor: "text-blue-600 bg-blue-100 border-blue-200", avatar: "from-blue-400 to-indigo-500" },
  { name: "Karim Benali", role: "Data Analyst", status: "À faire", statusColor: "text-orange-600 bg-orange-100 border-orange-200", avatar: "from-purple-400 to-pink-500" },
];

export const ManagerDashboard: React.FC = () => {
  const [search, setSearch] = useState('');
  const filtered = employees.filter(e => e.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-3xl p-8 text-white relative overflow-hidden shadow-lg shadow-emerald-500/20">
        <div className="absolute right-0 top-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4"></div>
        <div className="relative z-10">
          <h1 className="text-3xl md:text-4xl font-black mb-2 tracking-tight">Espace Manager</h1>
          <p className="text-white/80 font-medium">Pilotez la performance et les objectifs de votre équipe.</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { icon: Users, label: "Membres d'équipe", value: "12", color: "text-blue-500", bg: "bg-blue-50", border: "border-blue-100" },
          { icon: AlertCircle, label: "À évaluer ce mois", value: "3", color: "text-orange-500", bg: "bg-orange-50", border: "border-orange-100" },
          { icon: FileCheck, label: "Objectifs validés", value: "85%", color: "text-emerald-500", bg: "bg-emerald-50", border: "border-emerald-100" }
        ].map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 hover:border-primary-200 hover:-translate-y-1 hover:shadow-md transition-all duration-300">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${stat.bg} border ${stat.border} mb-5`}>
              <stat.icon className={`h-7 w-7 ${stat.color}`} />
            </div>
            <h3 className="text-3xl font-black text-slate-800 mb-1">{stat.value}</h3>
            <p className="text-sm text-slate-500 font-semibold">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Evaluation Urgencies */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
          <h2 className="text-xl font-bold text-slate-800 mb-6">À Évaluer en Urgence</h2>
          <div className="space-y-4">
            {employees.filter(e => e.status === "À faire").map((emp, i) => (
              <div key={i} className="flex items-center gap-3 p-4 bg-orange-50 border border-orange-100 rounded-2xl">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${emp.avatar} flex items-center justify-center text-white font-black text-sm flex-shrink-0`}>
                  {emp.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 text-sm truncate">{emp.name}</p>
                  <p className="text-xs text-orange-600 font-semibold flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3" /> Évaluation en attente
                  </p>
                </div>
                <button className="flex-shrink-0 px-3 py-1.5 bg-primary-600 text-white text-xs font-bold rounded-lg hover:bg-primary-700 transition-colors">
                  Évaluer
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Team Table */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
            <h2 className="text-xl font-bold text-slate-800">Mon Équipe</h2>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Rechercher..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none w-full sm:w-56 transition-all"
              />
            </div>
          </div>

          <div className="space-y-3">
            {filtered.map((emp, i) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 hover:border-primary-200 hover:bg-slate-50 transition-all cursor-pointer group">
                <div className="flex items-center gap-4">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${emp.avatar} flex items-center justify-center text-white font-black text-base shadow-md`}>
                    {emp.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">{emp.name}</p>
                    <p className="text-xs text-slate-500 font-medium">{emp.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border ${emp.statusColor}`}>
                    {emp.status}
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-primary-600 transition-colors" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
