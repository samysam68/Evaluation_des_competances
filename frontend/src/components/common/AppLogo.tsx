import React from 'react';

/** Logo de l'application Talents — utilisé uniquement sur la page de connexion. */
export const AppLogo: React.FC<{ size?: number; className?: string }> = ({ size = 72, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 96 96"
    className={className}
    role="img"
    aria-label="Logo Talents"
  >
    <defs>
      <linearGradient id="etalents-badge" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#0ea5e9" />
        <stop offset="100%" stopColor="#8b5cf6" />
      </linearGradient>
    </defs>

    <rect x="2" y="2" width="92" height="92" rx="24" fill="url(#etalents-badge)" />
    <rect x="2" y="2" width="92" height="92" rx="24" fill="white" fillOpacity="0.04" />

    {/* Monogramme "T" */}
    <text
      x="34"
      y="63"
      textAnchor="middle"
      fontFamily="Outfit, Inter, sans-serif"
      fontWeight="800"
      fontSize="40"
      fill="white"
    >
      T
    </text>

    {/* Étincelle — symbole du talent */}
    <path
      d="M70 20 L74 30 L84 34 L74 38 L70 48 L66 38 L56 34 L66 30 Z"
      fill="white"
      fillOpacity="0.92"
    />
  </svg>
);
