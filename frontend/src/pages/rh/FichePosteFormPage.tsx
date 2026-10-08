import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Save, Loader2, ChevronLeft, Printer } from 'lucide-react';
import { API_BASE_URL, authFetch } from '../../services/api';
import { useAuthStore } from '../../store/authStore';

// ──── Types ─────────────────────────────────────────────────────────────────
export interface ActivitySection { titre: string; items: string[]; }

export interface FicheForm {
  intitule: string; direction: string; service: string; rattachementHierarchique: string;
  versionFichePoste: string; codePosition: string; codeSysteme: string;
  dateCreation: string; subordonneesDirect: string; reference: string;
  statut: string; categorie: string; coefficient: string;
  departement: string; localisation: string;
  missionPrincipale: string;
  activitesPrincipales: ActivitySection[];
  activitesSecondaires: string[];
  tachesInterimaires: string[];
  activitesSMI: string[];
  autorites: string[];
  indicateursPerformance: string[];
  formationRequise: string; specialite: string; experienceRequise: string;
  autreQualite: string; conditionsParticulieres: string;
  exigencesParticulieres: string[];
  competencesTechniques: string[];
  savoirFaire: string[];
  savoirEtre: string[];
  competencesComportementales: string[];
  relationsInternes: string[]; relationsExternes: string[];
  langues: string[]; outils: string[];
}

const EMPTY: FicheForm = {
  intitule: '', direction: '', service: '', rattachementHierarchique: '',
  versionFichePoste: '01', codePosition: '', codeSysteme: '',
  dateCreation: '', subordonneesDirect: 'NA', reference: 'RH-SOP-004-01/FRM01',
  statut: '', categorie: '', coefficient: '', departement: '', localisation: '',
  missionPrincipale: '',
  activitesPrincipales: [],
  activitesSecondaires: [], tachesInterimaires: [],
  activitesSMI: [], autorites: [],
  indicateursPerformance: [],
  formationRequise: '', specialite: '', experienceRequise: '',
  autreQualite: '', conditionsParticulieres: '',
  exigencesParticulieres: [],
  competencesTechniques: [], savoirFaire: [], savoirEtre: [],
  competencesComportementales: [],
  relationsInternes: [], relationsExternes: [],
  langues: [], outils: [],
};

// ──── Champ texte transparent (inline sur le template) ────────────────────────
interface EFProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  bold?: boolean;
  multiline?: boolean;
  minRows?: number;
  style?: React.CSSProperties;
}
const EF: React.FC<EFProps> = ({ value, onChange, placeholder, bold, multiline, minRows = 1, style }) => {
  const base: React.CSSProperties = {
    border: 'none', outline: 'none', background: 'transparent',
    fontFamily: 'Arial, sans-serif', fontSize: '9pt', padding: 0, margin: 0,
    width: '100%', fontWeight: bold ? 'bold' : 'normal',
    resize: 'none', lineHeight: '1.5', color: '#000',
    ...style,
  };
  if (multiline) {
    return <textarea value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} rows={minRows} style={base} className="ef-field" />;
  }
  return <input type="text" value={value} onChange={e => onChange(e.target.value)}
    placeholder={placeholder} style={base} className="ef-field" />;
};

// ──── Liste éditable inline (Entrée = nouvelle ligne) ─────────────────────────
interface InlineListProps {
  items: string[];
  onChange: (v: string[]) => void;
  prefix?: string;
  placeholder?: string;
}
const InlineList: React.FC<InlineListProps> = ({ items, onChange, prefix = '☐', placeholder = 'Ajouter…' }) => {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const update = (i: number, val: string) => { const n = [...items]; n[i] = val; onChange(n); };
  const add = (after?: number) => {
    const idx = after !== undefined ? after + 1 : items.length;
    const n = [...items.slice(0, idx), '', ...items.slice(idx)];
    onChange(n);
    setTimeout(() => inputRefs.current[idx]?.focus(), 30);
  };
  const remove = (i: number) => {
    onChange(items.filter((_, j) => j !== i));
    setTimeout(() => inputRefs.current[Math.max(0, i - 1)]?.focus(), 30);
  };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key === 'Enter') { e.preventDefault(); add(i); }
    else if (e.key === 'Backspace' && items[i] === '') { e.preventDefault(); remove(i); }
  };
  return (
    <div style={{ paddingLeft: '2px' }}>
      {items.map((item, i) => (
        <div key={i} className="ef-list-row" style={{ display: 'flex', alignItems: 'center', gap: '4px', minHeight: '16px' }}>
          <span style={{ fontSize: '9pt', color: '#333', flexShrink: 0, userSelect: 'none' }}>{prefix}</span>
          <input ref={el => { inputRefs.current[i] = el; }} type="text" value={item}
            onChange={e => update(i, e.target.value)} onKeyDown={e => onKey(e, i)}
            style={{ border: 'none', outline: 'none', background: 'transparent', flex: 1, fontFamily: 'Arial,sans-serif', fontSize: '9pt', padding: 0, color: '#000' }}
            className="ef-field" placeholder={placeholder} />
          <button type="button" onClick={() => remove(i)} className="no-print ef-delete-btn"
            style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: '10px', padding: '0 2px', lineHeight: 1 }}>×</button>
        </div>
      ))}
      <button type="button" onClick={() => add()} className="no-print"
        style={{ fontSize: '8pt', color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', marginTop: '1px' }}>
        + Ajouter
      </button>
    </div>
  );
};

// ──── Sections activités A, B, C… ─────────────────────────────────────────────
interface SectionsEditorProps {
  sections: ActivitySection[];
  onChange: (s: ActivitySection[]) => void;
}
const SectionsEditor: React.FC<SectionsEditorProps> = ({ sections, onChange }) => {
  const addSection = () => onChange([...sections, { titre: '', items: [] }]);
  const removeSection = (i: number) => onChange(sections.filter((_, j) => j !== i));
  const updateTitle = (i: number, titre: string) => { const s = [...sections]; s[i] = { ...s[i], titre }; onChange(s); };
  const updateItems = (i: number, items: string[]) => { const s = [...sections]; s[i] = { ...s[i], items }; onChange(s); };
  return (
    <div>
      {sections.map((sec, i) => (
        <div key={i} style={{ marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
            <span style={{ fontWeight: 'bold', fontSize: '9pt', fontFamily: 'Arial,sans-serif', flexShrink: 0 }}>
              {String.fromCharCode(65 + i)}.
            </span>
            <input type="text" value={sec.titre} onChange={e => updateTitle(i, e.target.value)}
              placeholder="Titre de la sous-section…" className="ef-field"
              style={{ border: 'none', outline: 'none', background: 'transparent', flex: 1, fontFamily: 'Arial,sans-serif', fontSize: '9pt', fontWeight: 'bold', padding: 0, color: '#000' }} />
            <button type="button" onClick={() => removeSection(i)} className="no-print ef-delete-btn"
              style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: '11px', padding: '0 3px' }}>×</button>
          </div>
          <div style={{ paddingLeft: '16px' }}>
            <InlineList items={sec.items} onChange={v => updateItems(i, v)} prefix="•" placeholder="Ajouter une activité…" />
          </div>
        </div>
      ))}
      <button type="button" onClick={addSection} className="no-print"
        style={{ fontSize: '8pt', color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', marginTop: '2px' }}>
        + Ajouter une sous-section
      </button>
    </div>
  );
};

// ──── Logo LDM (top-level = jamais remonté) ────────────────────────────────────
const LDMLogo: React.FC = () => (
  <img src="/logo-ldm.png" alt="LDM Groupe" style={{ height: '52px', width: '80px', objectFit: 'contain' }} />
);

// ──── En-tête de page (top-level = jamais remonté) ────────────────────────────
interface PageHeaderProps {
  page: number;
  reference: string; onRef: (v: string) => void;
  version: string;   onVersion: (v: string) => void;
}
const tbl: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '9pt', fontFamily: 'Arial,sans-serif', marginBottom: '6px' };
const cell: React.CSSProperties = { border: '1px solid black', padding: '3px 5px', verticalAlign: 'top' };
const cellH: React.CSSProperties = { ...cell, fontWeight: 'bold', backgroundColor: '#f5f5f5', whiteSpace: 'nowrap' };

const PageHeader: React.FC<PageHeaderProps> = ({ page, reference, onRef, version, onVersion }) => (
  <table style={tbl}>
    <tbody>
      <tr>
        <td style={{ ...cell, width: '90px', textAlign: 'center', verticalAlign: 'middle' }}><LDMLogo /></td>
        <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold', fontSize: '10pt', verticalAlign: 'middle' }}>
          Fiche de poste et profil de compétences
        </td>
        <td style={{ ...cell, width: '210px', fontSize: '8pt', lineHeight: '1.9' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            <span style={{ whiteSpace: 'nowrap' }}>Référence :</span>
            <EF value={reference} onChange={onRef} placeholder="RH-SOP-004-01/FRM01" />
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <span style={{ whiteSpace: 'nowrap' }}>Version :</span>
            <EF value={version} onChange={onVersion} placeholder="01" style={{ width: '40px' }} />
          </div>
          <div>Date d'application : 07/12/2023</div>
          <div>Page <strong>{page}</strong> sur 3</div>
        </td>
      </tr>
    </tbody>
  </table>
);

// ──── Styles réutilisables ─────────────────────────────────────────────────────
const secTitle: React.CSSProperties = {
  fontWeight: '900', fontSize: '9.5pt', fontFamily: 'Arial,sans-serif',
  textDecoration: 'underline', margin: '8px 0 3px',
};
const boldLabel: React.CSSProperties = {
  fontWeight: 'bold', fontSize: '9.5pt', fontFamily: 'Arial,sans-serif', margin: '8px 0 3px',
};
const pageBreakStyle: React.CSSProperties = {
  marginTop: '32px', paddingTop: '16px', borderTop: '2px dashed #e2e8f0',
};

const DocFooter: React.FC = () => (
  <p style={{ textAlign: 'center', fontSize: '7pt', marginTop: '20px', borderTop: '1px solid black', paddingTop: '4px' }}>
    INFORMATIONS CONFIDENTIELLES LDM<br />
    NE PAS ÊTRE REPRODUIT / DIVULGUÉ SANS APPROBATION ÉCRITE PRÉALABLE
  </p>
);

// ──── Page principale ─────────────────────────────────────────────────────────
export const FichePosteFormPage: React.FC = () => {
  const navigate   = useNavigate();
  const { id }     = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isEdit     = Boolean(id);
  const { user: currentUser } = useAuthStore();

  const targetEmployeeId   = searchParams.get('employeeId');
  const targetEmployeeName = searchParams.get('employeeName');

  const [form, setForm] = useState<FicheForm>({
    ...EMPTY,
    intitule:    searchParams.get('intitule')    || '',
    direction:   searchParams.get('direction')   || '',
    departement: searchParams.get('departement') || '',
    service:     searchParams.get('service')     || '',
  });
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  // Noms auto-remplis pour la section signatures (page 3)
  const [sigConcerneNom, setSigConcerneNom] = useState(targetEmployeeName || '');
  const [sigHierarchNom, setSigHierarchNom] = useState(currentUser?.fullName || '');

  useEffect(() => {
    if (!isEdit) return;
    authFetch(`${API_BASE_URL}/api/fiche-poste/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.id) {
          let ap = data.activitesPrincipales;
          if (Array.isArray(ap) && ap.length > 0 && typeof ap[0] === 'string') {
            ap = [{ titre: 'Activités principales', items: ap }];
          }
          setForm({ ...EMPTY, ...data, activitesPrincipales: ap || [] });
          // En mode édition : remplir le créateur comme responsable hiérarchique
          if (data.createdByNom || data.createdByPrenom) {
            setSigHierarchNom(`${data.createdByPrenom || ''} ${data.createdByNom || ''}`.trim());
          }
        }
        setLoading(false);
      });
  }, [id, isEdit]);

  const set = <K extends keyof FicheForm>(key: K, val: FicheForm[K]) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const save = async () => {
    if (!form.intitule.trim()) { alert("L'intitulé du poste est requis."); return; }
    setSaving(true);
    const url    = isEdit ? `${API_BASE_URL}/api/fiche-poste/${id}` : `${API_BASE_URL}/api/fiche-poste`;
    const method = isEdit ? 'PATCH' : 'POST';
    const r      = await authFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const data   = await r.json();
    if (!r.ok) { alert(data.message || 'Erreur lors de la sauvegarde.'); setSaving(false); return; }
    if (!isEdit && targetEmployeeId && data.id) {
      await authFetch(`${API_BASE_URL}/api/fiche-poste/${data.id}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: [Number(targetEmployeeId)] }),
      });
      navigate(-1);
    } else {
      setSaving(false); setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      if (!isEdit && data.id) navigate(`/dashboard/rh/fiches-poste/${data.id}/edit`, { replace: true });
    }
  };

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-indigo-400" /></div>;
  }

  return (
    <>
      {/* ── Styles pour l'édition inline sur template ── */}
      <style>{`
        .ef-field { transition: background 0.1s; }
        .ef-field::placeholder { color: #c4c4c4; font-style: italic; }
        .ef-field:hover, .ef-field:focus { background: rgba(99,102,241,0.07) !important; border-radius: 2px; }
        .ef-delete-btn { opacity: 0; transition: opacity 0.15s; }
        .ef-list-row:hover .ef-delete-btn { opacity: 1; }
        /* Mode lecture seule RH */
        @media print {
          .no-print { display: none !important; }
          .ef-field { background: transparent !important; }
          body { background: white !important; }
          .doc-wrap { padding: 0 !important; box-shadow: none !important; border: none !important; max-width: 100% !important; border-radius: 0 !important; }
          .page-break { page-break-before: always; border: none !important; margin: 0 !important; padding: 0 !important; }
          /* Masquer sidebar, header app (notif + profil) et footer */
          aside, header { display: none !important; }
          main { margin-left: 0 !important; width: 100% !important; height: auto !important; overflow: visible !important; }
          main > div { padding: 0 !important; overflow: visible !important; }
        }
        @page { size: A4; margin: 1.5cm; }
      `}</style>

      {/* ── Barre d'outils (cachée à l'impression) ── */}
      <div className="no-print" style={{
        position: 'sticky', top: 0, zIndex: 50, background: 'white',
        borderBottom: '1px solid #e2e8f0', padding: '8px 24px',
        display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px',
      }}>
        <button onClick={() => navigate(-1)}
          style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
          <ChevronLeft size={16} /> Retour
        </button>
        <div style={{ flex: 1 }} />
        {targetEmployeeName && (
          <span style={{ fontSize: '12px', color: '#6366f1', fontWeight: 700, background: '#eef2ff', padding: '4px 10px', borderRadius: '8px' }}>
            Pour : {targetEmployeeName}
          </span>
        )}
        <button onClick={() => window.print()}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#475569' }}>
          <Printer size={14} /> Imprimer
        </button>
        <button onClick={save} disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', background: saved ? '#10b981' : 'linear-gradient(to right,#4f46e5,#7c3aed)', border: 'none', borderRadius: '10px', padding: '6px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: 'white', opacity: saving ? 0.7 : 1 }}>
          {saving ? <Loader2 size={14} /> : <Save size={14} />}
          {saved ? 'Sauvegardé ✓' : saving ? '...' : 'Enregistrer'}
        </button>
      </div>

      {/* ══════════════ DOCUMENT A4 ÉDITABLE ══════════════════ */}
      <div className="doc-wrap" style={{ maxWidth: '820px', margin: '0 auto', background: 'white', padding: '32px', boxShadow: '0 0 0 1px #e2e8f0', borderRadius: '12px', fontFamily: 'Arial,sans-serif', fontSize: '9pt', color: '#000' }}>

        {/* ══ PAGE 1 ════════════════════════════════════════════ */}
        <PageHeader page={1}
          reference={form.reference} onRef={v => set('reference', v)}
          version={form.versionFichePoste} onVersion={v => set('versionFichePoste', v)} />

        {/* Tableau d'identification */}
        <table style={tbl}>
          <tbody>
            <tr>
              <td colSpan={6} style={{ ...cell, fontWeight: 'bold' }}>
                Intitulé de poste :&nbsp;
                <EF value={form.intitule} onChange={v => set('intitule', v)} placeholder="ex: Gestionnaire SI" bold />
              </td>
            </tr>
            <tr>
              <td style={{ ...cellH, width: '10%' }}>Structure :</td>
              <td style={{ ...cell, width: '14%' }}><EF value={form.direction} onChange={v => set('direction', v)} placeholder="DSI" /></td>
              <td style={{ ...cellH, width: '8%' }}>Service :</td>
              <td style={{ ...cell, width: '14%' }}><EF value={form.service} onChange={v => set('service', v)} placeholder="DSI" /></td>
              <td style={{ ...cellH, width: '18%', whiteSpace: 'nowrap' }}>Responsable hiérarchique :</td>
              <td style={{ ...cell, width: '36%' }}><EF value={form.rattachementHierarchique} onChange={v => set('rattachementHierarchique', v)} placeholder="Responsable SI" /></td>
            </tr>
            <tr>
              <td style={cellH}>Version fiche de poste :</td>
              <td style={cell}><EF value={form.versionFichePoste} onChange={v => set('versionFichePoste', v)} placeholder="01" /></td>
              <td colSpan={2} style={cellH}>Code position :</td>
              <td colSpan={2} style={cell}><EF value={form.codePosition} onChange={v => set('codePosition', v)} placeholder="0201000003" /></td>
            </tr>
            <tr>
              <td style={cellH}>Code système :</td>
              <td style={cell}><EF value={form.codeSysteme} onChange={v => set('codeSysteme', v)} placeholder="02660" /></td>
              <td style={cellH}>Date de création :</td>
              <td style={cell}><EF value={form.dateCreation} onChange={v => set('dateCreation', v)} placeholder="14/12/2025" /></td>
              <td style={cellH}>Dénomination des postes des Subordonnés Directs :</td>
              <td style={cell}><EF value={form.subordonneesDirect} onChange={v => set('subordonneesDirect', v)} placeholder="NA" /></td>
            </tr>
            <tr>
              <td style={{ ...cellH, verticalAlign: 'top' }}>Missions principales :</td>
              <td colSpan={5} style={cell}>
                <EF value={form.missionPrincipale} onChange={v => set('missionPrincipale', v)}
                  multiline minRows={3}
                  placeholder={"• Assure un rôle hybride…\n• Contribution au bon fonctionnement du SI…"} />
              </td>
            </tr>
          </tbody>
        </table>

        <p style={secTitle}>LES ACTIVITÉS PRINCIPALES :</p>
        <SectionsEditor sections={form.activitesPrincipales} onChange={v => set('activitesPrincipales', v)} />

        <p style={secTitle}>TÂCHES SECONDAIRES :</p>
        <InlineList items={form.activitesSecondaires} onChange={v => set('activitesSecondaires', v)}
          placeholder="Participer à la gestion documentaire ERP…" />

        <p style={secTitle}>LES TÂCHES INTÉRIMAIRES :</p>
        <InlineList items={form.tachesInterimaires} onChange={v => set('tachesInterimaires', v)}
          placeholder="Assurer le remplacement de l'équipe SI en cas d'absence…" />

        <DocFooter />

        {/* ══ PAGE 2 ════════════════════════════════════════════ */}
        <div className="page-break" style={pageBreakStyle} />
        <PageHeader page={2}
          reference={form.reference} onRef={v => set('reference', v)}
          version={form.versionFichePoste} onVersion={v => set('versionFichePoste', v)} />

        <p style={secTitle}>ACTIVITÉS DANS LE CADRE DU SYSTÈME DE MANAGEMENT INTÉGRÉ :</p>
        <InlineList items={form.activitesSMI} onChange={v => set('activitesSMI', v)}
          placeholder="Appliquer les procédures IT en conformité avec cGMP, ISO 27001…" />

        <p style={boldLabel}>Autorités :</p>
        <InlineList items={form.autorites} onChange={v => set('autorites', v)}
          placeholder="Recommander des solutions techniques adaptées…" />

        <p style={boldLabel}>Indicateurs de performance (KPI), atteinte des objectifs :</p>
        <InlineList items={form.indicateursPerformance} onChange={v => set('indicateursPerformance', v)}
          placeholder="Taux de résolution des tickets Help Desk dans les délais (> 90%)…" />

        <p style={{ ...boldLabel, marginTop: '10px' }}>Exigence de poste :</p>
        <table style={tbl}>
          <tbody>
            <tr>
              <td style={{ ...cellH, width: '38%' }}>Niveau de qualifications (Profil)</td>
              <td style={cell}><EF value={form.formationRequise} onChange={v => set('formationRequise', v)} placeholder="Bac+3 en informatique, systèmes d'information…" /></td>
            </tr>
            <tr>
              <td style={cellH}>Formation professionnelle</td>
              <td style={cell}><EF value={form.specialite} onChange={v => set('specialite', v)} multiline minRows={2} placeholder="Induction SAP Business One, ITIL Foundation…" /></td>
            </tr>
            <tr>
              <td style={cellH}>Expérience professionnelle</td>
              <td style={cell}><EF value={form.experienceRequise} onChange={v => set('experienceRequise', v)} placeholder="2 ans d'expérience en IT et/ou applicatif" /></td>
            </tr>
            <tr>
              <td style={cellH}>Autre qualité souhaitée</td>
              <td style={cell}><EF value={form.autreQualite} onChange={v => set('autreQualite', v)} multiline minRows={2} placeholder="Capacité d'analyse et de synthèse, rigueur…" /></td>
            </tr>
            <tr>
              <td style={cellH}>Conditions et contraintes d'exercice</td>
              <td style={cell}><EF value={form.conditionsParticulieres} onChange={v => set('conditionsParticulieres', v)} multiline minRows={3} placeholder="Poste principalement sédentaire…" /></td>
            </tr>
            <tr>
              <td style={cellH}>Exigences particulières</td>
              <td style={cell}><InlineList items={form.exigencesParticulieres} onChange={v => set('exigencesParticulieres', v)} placeholder="Disponibilité renforcée en cas d'incident majeur…" /></td>
            </tr>
          </tbody>
        </table>

        <p style={secTitle}>Les compétences nécessaires</p>
        <table style={tbl}>
          <tbody>
            <tr>
              <td style={{ ...cellH, width: '38%' }}>Savoir (Connaissances)</td>
              <td style={cell}><InlineList items={form.competencesTechniques} onChange={v => set('competencesTechniques', v)} placeholder="Environnements OS (Windows/MAC/LINUX)…" /></td>
            </tr>
            <tr>
              <td style={cellH}>Savoir-faire (Être capable de faire)</td>
              <td style={cell}><InlineList items={form.savoirFaire} onChange={v => set('savoirFaire', v)} placeholder="Diagnostiquer et résoudre des incidents IT…" /></td>
            </tr>
            <tr>
              <td style={cellH}>Savoir être (aptitudes)</td>
              <td style={cell}><InlineList items={form.savoirEtre} onChange={v => set('savoirEtre', v)} placeholder="Sens du service et orientation utilisateur…" /></td>
            </tr>
          </tbody>
        </table>

        <DocFooter />

        {/* ══ PAGE 3 ════════════════════════════════════════════ */}
        <div className="page-break" style={pageBreakStyle} />
        <PageHeader page={3}
          reference={form.reference} onRef={v => set('reference', v)}
          version={form.versionFichePoste} onVersion={v => set('versionFichePoste', v)} />

        <p style={{ fontSize: '9pt', margin: '12px 0', lineHeight: '1.7' }}>
          Je déclare avoir pris connaissance de mes responsabilités en matière de respect du règlement
          intérieur du groupe, des règles d'hygiène et de sécurité et de préservation de l'environnement,
          ainsi que les modalités d'application des chartes, codes et procédures du groupe.
        </p>

        {/* Tableau signatures */}
        <table style={tbl}>
          <tbody>
            <tr>
              <td style={{ ...cell, width: '50%', height: '130px', verticalAlign: 'top' }}>
                <p style={{ fontWeight: 'bold', marginBottom: '8px' }}>Signature du concerné</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '4px' }}>
                  <span style={{ whiteSpace: 'nowrap', fontSize: '9pt' }}>Nom et prénom :</span>
                  <EF value={sigConcerneNom} onChange={setSigConcerneNom} placeholder="Nom et prénom du titulaire" bold />
                </div>
                <p>Fonction : <EF value={form.intitule} onChange={v => set('intitule', v)} /></p>
                <p style={{ marginTop: '36px' }}>Visa :</p>
              </td>
              <td style={{ ...cell, width: '50%', height: '130px', verticalAlign: 'top' }}>
                <p style={{ fontWeight: 'bold', marginBottom: '8px' }}>Responsable Hiérarchique</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '4px' }}>
                  <span style={{ whiteSpace: 'nowrap', fontSize: '9pt' }}>Nom et prénom :</span>
                  <EF value={sigHierarchNom} onChange={setSigHierarchNom} placeholder="Nom du responsable" bold />
                </div>
                <p>Fonction : <EF value={form.rattachementHierarchique} onChange={v => set('rattachementHierarchique', v)} placeholder="Titre / Poste" /></p>
                <p style={{ marginTop: '36px' }}>Visa :</p>
              </td>
            </tr>
            <tr>
              <td style={{ ...cell, height: '90px', verticalAlign: 'top' }}>
                <p style={{ fontWeight: 'bold', marginBottom: '6px' }}>Approbation Direction Technique (si applicable)</p>
                <p>Nom et prénom :</p>
                <p>Fonction :</p>
                <p style={{ marginTop: '20px' }}>Visa :</p>
              </td>
              <td style={{ ...cell, height: '90px', verticalAlign: 'top' }}>
                <p style={{ fontWeight: 'bold', marginBottom: '6px' }}>Approbation Ressources humaines</p>
                <p>Nom et prénom :</p>
                <p>Fonction : Directeur Finances &amp; Administration Générale — Groupe LDM</p>
                <p style={{ marginTop: '12px' }}>Visa :</p>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Tableau historique */}
        <p style={{ fontWeight: 'bold', fontSize: '9.5pt', margin: '16px 0 6px' }}>TABLEAU HISTORIQUE :</p>
        <table style={tbl}>
          <thead>
            <tr>
              <td style={{ ...cellH, textAlign: 'center', width: '20%' }}>Édition</td>
              <td style={{ ...cellH, textAlign: 'center', width: '40%' }}>Date de diffusion</td>
              <td style={{ ...cellH, textAlign: 'center', width: '40%' }}>Description de la révision</td>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...cell, textAlign: 'center' }}>1.</td>
              <td style={{ ...cell, textAlign: 'center' }}>
                <EF value={form.dateCreation} onChange={v => set('dateCreation', v)} placeholder="14/12/2025" />
              </td>
              <td style={{ ...cell, textAlign: 'center' }}>Création</td>
            </tr>
          </tbody>
        </table>

        <DocFooter />
      </div>
    </>
  );
};
