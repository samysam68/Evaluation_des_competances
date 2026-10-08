import React from 'react';
import { Outlet } from 'react-router-dom';
import { Footer } from '../common/Footer';

export const AuthLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 relative overflow-hidden flex flex-col">
      {/* Light Premium Background Effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary-100 rounded-full blur-[120px] animate-blob"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-accent-100 rounded-full blur-[120px] animate-blob" style={{ animationDelay: '2s' }}></div>
      <div className="absolute top-[40%] left-[60%] w-[40%] h-[40%] bg-blue-100/50 rounded-full blur-[100px] animate-blob" style={{ animationDelay: '4s' }}></div>

      {/* Grid Pattern overlay for texture */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTEgMWgyMHYyMEgxVjF6IiBmaWxsPSJub25lIiBzdHJva2U9InJnYmEoMTUsIDIzLCA0MiwgMC4wMykiIHN0cm9rZS13aWR0aD0iMSIvPjwvc3ZnPg==')] opacity-50"></div>

      {/* Content */}
      <div className="relative z-10 flex-1 w-full animate-fade-in flex items-center justify-center p-4">
        <Outlet />
      </div>
      <Footer className="relative z-10" />
    </div>
  );
};
