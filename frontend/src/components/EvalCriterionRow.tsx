import React from 'react';
import { EVAL_LEVELS, LevelKey, CriterionRating, LevelDescriptions, TRAINING_CATALOG_OPTIONS } from '../constants/evaluationForms';
import { SelectOrOther } from './SelectOrOther';

interface Props {
  id: string;
  label: string;
  description?: string;
  levelDescriptions?: LevelDescriptions;
  value: CriterionRating;
  onChange: (val: CriterionRating) => void;
  showJustification?: boolean;
  justificationRequired?: boolean;
  /** Critère générique « Autre » : la colonne devient un champ libre où
   *  l'évaluateur précise ce que ce critère mesure, au lieu d'une liste
   *  déroulante de formations. */
  isCustomCriterion?: boolean;
}

export const EvalCriterionRow: React.FC<Props> = ({
  id,
  label,
  description,
  levelDescriptions,
  value,
  onChange,
  showJustification = true,
  justificationRequired = false,
  isCustomCriterion = false,
}) => {
  const justificationMissing = justificationRequired && !!value.level && !value.justification.trim();
  const selectedLevel = EVAL_LEVELS.find(l => l.key === value.level) ?? null;

  const handleLevelChange = (levelKey: LevelKey) => {
    const lvl = EVAL_LEVELS.find(l => l.key === levelKey)!;
    const mid = Math.round((lvl.min + lvl.max) / 2);
    onChange({ ...value, level: levelKey, note: mid });
  };

  const handleNoteChange = (raw: string) => {
    if (!selectedLevel) return;
    const n = parseInt(raw, 10);
    if (isNaN(n)) { onChange({ ...value, note: null }); return; }
    const clamped = Math.max(selectedLevel.min, Math.min(selectedLevel.max, n));
    onChange({ ...value, note: clamped });
  };

  const levelBadgeColors: Record<string, string> = {
    insatisfaisant: 'text-red-600',
    ameliorer:      'text-orange-600',
    satisfaisant:   'text-emerald-600',
    superieur:      'text-blue-700',
  };

  return (
    <tr className="hover:bg-slate-50/50 transition-colors border-b border-slate-100 last:border-0 group align-top">

      {/* Col 1 — Critère (label) */}
      <td className="p-3">
        <p className="text-sm font-bold text-slate-800 leading-snug">
          {label}
          {justificationRequired && (
            <span className="text-red-500" title={isCustomCriterion ? 'Précision obligatoire dès qu\'une note est donnée' : 'Action de formation obligatoire dès qu\'une note est donnée'}> *</span>
          )}
        </p>
      </td>

      {/* Col 2 — Définition / Comportements observables */}
      <td className="p-3 border-l border-slate-100 align-top min-w-[260px]">
        {/* Définition générale du critère */}
        {description && (
          <p className="text-[11px] text-slate-500 italic leading-relaxed mb-2 pb-2 border-b border-slate-100">
            {description}
          </p>
        )}

        {/* Comportements observables par niveau (depuis le Word) */}
        {levelDescriptions ? (
          <div className="space-y-1.5">
            <p className="text-[10px] leading-relaxed">
              <span className={`font-bold ${levelBadgeColors.insatisfaisant}`}>Insatisfaisant :</span>{' '}
              <span className="text-slate-600">{levelDescriptions.insatisfaisant}</span>
            </p>
            <p className="text-[10px] leading-relaxed">
              <span className={`font-bold ${levelBadgeColors.ameliorer}`}>À améliorer :</span>{' '}
              <span className="text-slate-600">{levelDescriptions.ameliorer}</span>
            </p>
            <p className="text-[10px] leading-relaxed">
              <span className={`font-bold ${levelBadgeColors.satisfaisant}`}>Satisfaisant :</span>{' '}
              <span className="text-slate-600">{levelDescriptions.satisfaisant}</span>
            </p>
            <p className="text-[10px] leading-relaxed">
              <span className={`font-bold ${levelBadgeColors.superieur}`}>Supérieur :</span>{' '}
              <span className="text-slate-600">{levelDescriptions.superieur}</span>
            </p>
          </div>
        ) : !description ? (
          <span className="text-xs text-slate-300">—</span>
        ) : null}
      </td>

      {/* Cols 3-6 — 4 niveaux */}
      {EVAL_LEVELS.map(lvl => {
        const isSelected = value.level === lvl.key;
        return (
          <td
            key={lvl.key}
            className={`p-2 border-l border-slate-100 text-center align-top transition-colors ${lvl.bg} ${lvl.hoverBg}`}
          >
            <div className="flex justify-center mb-1">
              <input
                type="radio"
                name={`level_${id}`}
                className={`w-5 h-5 ${lvl.accent} cursor-pointer`}
                checked={isSelected}
                onChange={() => handleLevelChange(lvl.key as LevelKey)}
              />
            </div>
            {isSelected && (
              <div className="mt-1">
                <input
                  type="number"
                  min={lvl.min}
                  max={lvl.max}
                  value={value.note ?? ''}
                  onChange={e => handleNoteChange(e.target.value)}
                  className={`w-14 mx-auto block text-center text-xs font-bold border rounded-lg py-1 px-1 outline-none focus:ring-2 focus:ring-offset-0 ${lvl.textColor} ${lvl.border} bg-white`}
                  placeholder={`${lvl.min}-${lvl.max}`}
                />
                <p className={`text-[10px] text-center mt-0.5 font-medium ${lvl.textColor} opacity-70`}>
                  {lvl.min}–{lvl.max}
                </p>
              </div>
            )}
          </td>
        );
      })}

      {/* Col 7 — Note affichée */}
      <td className="p-2 border-l border-slate-100 text-center align-middle">
        {value.level && value.note !== null ? (
          <div className="flex items-center justify-center gap-1.5">
            <span className={`text-sm font-black ${selectedLevel?.textColor ?? 'text-slate-700'}`}>
              {value.note}/20
            </span>
            <button
              type="button"
              title="Annuler cette note"
              onClick={() => onChange({ ...value, level: null, note: null })}
              className="text-slate-300 hover:text-red-500 transition-colors text-xs leading-none"
            >
              ✕
            </button>
          </div>
        ) : (
          <span className="text-xs text-slate-300">—</span>
        )}
      </td>

      {/* Col 8 — Action de formation / Plan de développement individuel (liste déroulante),
          ou pour un critère « Autre » : précision libre de ce que le critère mesure. */}
      {showJustification && (
        <td className="p-2 border-l border-slate-100 align-middle">
          {isCustomCriterion ? (
            <>
              <textarea
                rows={2}
                value={value.justification}
                onChange={e => onChange({ ...value, justification: e.target.value })}
                placeholder="Précisez ce que ce critère évalue (obligatoire)..."
                className={`w-full text-xs px-2 py-1.5 bg-slate-50 border rounded-lg outline-none focus:ring-1 resize-none ${
                  justificationMissing ? 'border-red-400 focus:ring-red-400' : 'border-slate-200 focus:ring-primary-400'
                }`}
              />
              {justificationMissing && (
                <p className="text-[10px] text-red-500 font-semibold mt-1">Précisez ce critère avant de le noter.</p>
              )}
            </>
          ) : (
            <>
              <SelectOrOther compact
                value={value.justification}
                onChange={justification => onChange({ ...value, justification })}
                options={TRAINING_CATALOG_OPTIONS}
                otherRequired={justificationRequired}
                otherPlaceholder="Nom de la formation" />
              {justificationMissing && (
                <p className="text-[10px] text-red-500 font-semibold mt-1">Action de formation obligatoire pour ce critère.</p>
              )}
            </>
          )}
        </td>
      )}
    </tr>
  );
};
