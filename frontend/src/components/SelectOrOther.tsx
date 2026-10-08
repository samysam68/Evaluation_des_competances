import React, { useEffect, useState } from 'react';

const OTHER = 'Autre (à préciser)';

interface Props {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  otherPlaceholder?: string;
  /** Rendu compact sur une ligne (ex. cellule de tableau) : champ "Autre" en
   *  saisie simple ligne au lieu d'une zone de texte, classes plus resserrées. */
  compact?: boolean;
  disabled?: boolean;
  /** Le champ "Autre" est obligatoire une fois activé (ex. thématique de formation libre). */
  otherRequired?: boolean;
}

// Liste déroulante avec repli "Autre (à préciser)" : un bouton dédié bascule vers
// une saisie libre (au lieu d'une option noyée dans la liste), avec possibilité de
// revenir à la liste. Si la valeur déjà enregistrée ne figure pas dans la liste
// (texte libre saisi avant l'introduction de ce composant), la saisie libre s'ouvre
// automatiquement.
export const SelectOrOther: React.FC<Props> = ({ value, onChange, options, otherPlaceholder, compact = false, disabled = false, otherRequired = false }) => {
  const [showOther, setShowOther] = useState(value !== '' && !options.includes(value));

  useEffect(() => {
    if (value !== '' && !options.includes(value)) setShowOther(true);
  }, [value, options]);

  const openOther = () => { setShowOther(true); onChange(''); };
  const backToList = () => { setShowOther(false); onChange(''); };

  // En mode compact, ces champs vivent dans une ligne flex avec un bouton
  // ("+ Autre" / "✕") à côté : `w-full` (= 100% du conteneur) entre en conflit
  // avec ce bouton et écrase le champ à une largeur quasi nulle, rendant le texte
  // sélectionné invisible dans la cellule du tableau. `flex-1 min-w-0` laisse le
  // champ occuper l'espace restant tout en autorisant son rétrécissement réel.
  const selectClass = compact
    ? 'flex-1 min-w-0 p-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none disabled:opacity-50 disabled:cursor-not-allowed'
    : 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-sm disabled:opacity-50 disabled:cursor-not-allowed';
  const otherClass = compact
    ? 'flex-1 min-w-0 p-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none disabled:opacity-50 disabled:cursor-not-allowed'
    : 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none resize-none text-sm disabled:opacity-50 disabled:cursor-not-allowed';
  const otherMissing = otherRequired && showOther && !value.trim();

  if (showOther) {
    return (
      <div className={compact ? 'space-y-1' : 'space-y-2'}>
        <div className="flex items-center gap-1.5">
          {compact ? (
            <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={otherPlaceholder}
              disabled={disabled}
              className={`${otherClass} ${otherMissing ? 'border-red-400' : ''}`} />
          ) : (
            <textarea value={value} onChange={e => onChange(e.target.value)} rows={2} placeholder={otherPlaceholder}
              disabled={disabled}
              className={`${otherClass} ${otherMissing ? 'border-red-400' : ''}`} />
          )}
          <button type="button" onClick={backToList} disabled={disabled} title="Revenir à la liste"
            className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40">
            ✕
          </button>
        </div>
        {otherMissing && <p className="text-[10px] text-red-500 font-semibold">Champ obligatoire.</p>}
      </div>
    );
  }

  return (
    <div className={compact ? 'flex items-center gap-1.5' : 'space-y-2'}>
      <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled} className={selectClass}>
        <option value="">Sélectionner...</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <button type="button" onClick={openOther} disabled={disabled}
        className={compact
          ? 'flex-shrink-0 px-2 py-1.5 text-[10px] font-bold text-primary-600 bg-primary-50 hover:bg-primary-100 border border-primary-200 rounded-lg transition-colors whitespace-nowrap disabled:opacity-40'
          : 'inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-primary-600 bg-primary-50 hover:bg-primary-100 border border-primary-200 rounded-lg transition-colors disabled:opacity-40'}>
        + {OTHER}
      </button>
    </div>
  );
};
