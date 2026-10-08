import React from 'react';

export const Footer: React.FC<{ className?: string }> = ({ className = '' }) => (
  <footer className={`text-center text-[11px] font-medium text-slate-400 py-4 ${className}`}>
    V1.0 — Tous droits réservés LDM Groupe
  </footer>
);
