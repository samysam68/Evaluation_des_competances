import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Printer, ChevronLeft, Pencil, Loader2 } from 'lucide-react';
import { API_BASE_URL, authFetch } from '../../services/api';
import { ActivitySection } from './FichePosteFormPage';

interface Fiche {
  id: number; intitule: string; direction: string; departement: string;
  service: string; localisation: string; statut: string; categorie: string;
  coefficient: string; reference: string; rattachementHierarchique: string;
  codePosition: string; codeSysteme: string; versionFichePoste: string;
  dateCreation: string; subordonneesDirect: string;
  missionPrincipale: string;
  activitesPrincipales: ActivitySection[] | string[];
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
  competencesComportementales: string[];
  savoirEtre: string[];
  langues: string[]; outils: string[];
  updatedAt: string; createdByNom: string; createdByPrenom: string;
}

// ──── Logo LDM SVG ─────────────────────────────────────────────────────────────
const LDMLogo: React.FC = () => (
  <svg viewBox="0 0 80 60" width="80" height="60" xmlns="http://www.w3.org/2000/svg">
    {/* Double chevron rose/rouge */}
    <path d="M8 12 L22 30 L8 48" stroke="#E91E8C" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M18 12 L32 30 L18 48" stroke="#E91E8C" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    {/* LDM texte */}
    <text x="36" y="28" fontFamily="Arial,sans-serif" fontWeight="900" fontSize="14" fill="#1a2744">LDM</text>
    <text x="36" y="40" fontFamily="Arial,sans-serif" fontWeight="600" fontSize="8" fill="#1a2744" letterSpacing="2">GROUPE</text>
  </svg>
);

// ──── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (d?: string) => {
  if (!d) return '';
  const p = d.slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
};

const parseActivitesPrincipales = (ap: ActivitySection[] | string[]): ActivitySection[] => {
  if (!Array.isArray(ap) || ap.length === 0) return [];
  if (typeof ap[0] === 'string') return [{ titre: 'Activités principales', items: ap as string[] }];
  return ap as ActivitySection[];
};

const CB = '☐'; // checkbox unicode pour les items

const CheckList: React.FC<{ items: string[] }> = ({ items }) => (
  <div style={{ padding: '2px 8px' }}>
    {items.map((it, i) => (
      <p key={i} style={{ margin: '2px 0', fontSize: '9pt', display: 'flex', gap: '6px' }}>
        <span>{CB}</span><span>{it}</span>
      </p>
    ))}
  </div>
);

const BulletList: React.FC<{ items: string[] }> = ({ items }) => (
  <div style={{ padding: '2px 8px' }}>
    {items.map((it, i) => (
      <p key={i} style={{ margin: '2px 0', fontSize: '9pt', display: 'flex', gap: '6px' }}>
        <span>•</span><span>{it}</span>
      </p>
    ))}
  </div>
);

// ──── Page ─────────────────────────────────────────────────────────────────────
export const FichePostePrintPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      authFetch(`${API_BASE_URL}/api/fiche-poste/${id}`).then(r => r.json()),
      authFetch(`${API_BASE_URL}/api/fiche-poste/${id}/employees`).then(r => r.json()),
    ]).then(([f, e]) => {
      if (f.id) setFiche(f);
      setEmployees(Array.isArray(e) ? e : []);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-indigo-400" /></div>;
  if (!fiche) return <div className="text-center py-24 text-slate-500">Fiche introuvable.</div>;

  const ap = parseActivitesPrincipales(fiche.activitesPrincipales);
  const appDate = '07/12/2023';
  const ref     = fiche.reference || 'RH-SOP-004-01/FRM01';
  const version = fiche.versionFichePoste || '01';

  // Styles inline pour impression A4 précise
  const tbl: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '9pt', fontFamily: 'Arial, sans-serif', marginBottom: '8px' };
  const cell: React.CSSProperties = { border: '1px solid black', padding: '4px 6px', verticalAlign: 'top' };
  const cellH: React.CSSProperties = { ...cell, fontWeight: 'bold', backgroundColor: '#f5f5f5' };
  const sectionHeader: React.CSSProperties = { fontWeight: '900', fontSize: '9.5pt', textDecoration: 'underline', marginTop: '10px', marginBottom: '4px', fontFamily: 'Arial, sans-serif' };

  const HeaderBlock = ({ page, total = 3 }: { page: number; total?: number }) => (
    <table style={tbl}>
      <tbody>
        <tr>
          <td style={{ ...cell, width: '90px', textAlign: 'center', verticalAlign: 'middle' }}>
            <LDMLogo />
          </td>
          <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold', fontSize: '10pt', verticalAlign: 'middle' }}>
            Fiche de poste et profil de compétences
          </td>
          <td style={{ ...cell, width: '200px', fontSize: '8pt', verticalAlign: 'top', lineHeight: '1.6' }}>
            <div>Référence : {ref}</div>
            <div>Version : {version}</div>
            <div>Date d'application : {appDate}</div>
            <div>Page <strong>{page}</strong> sur {total}</div>
          </td>
        </tr>
      </tbody>
    </table>
  );

  const missions = fiche.missionPrincipale
    ? fiche.missionPrincipale.split('\n').filter(Boolean)
    : [];

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; }
          .print-wrap { padding: 0 !important; max-width: 100% !important; }
          .page-break { page-break-before: always; }
        }
        @page { size: A4; margin: 1.5cm; }
        .print-body { font-family: Arial, sans-serif; font-size: 9pt; color: #000; }
      `}</style>

      {/* Barre d'outils web */}
      <div className="no-print flex items-center gap-3 mb-6 max-w-4xl mx-auto">
        <button onClick={() => navigate('/dashboard/rh/fiches-poste')}
          className="flex items-center gap-1.5 text-slate-500 hover:text-indigo-600 text-sm font-semibold transition-colors">
          <ChevronLeft className="h-4 w-4" /> Retour
        </button>
        <div className="flex-1" />
        <button onClick={() => navigate(`/dashboard/rh/fiches-poste/${id}/edit`)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50">
          <Pencil className="h-4 w-4" /> Modifier
        </button>
        <button onClick={() => window.print()}
          className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-indigo-600 to-violet-500 text-white rounded-xl font-bold text-sm shadow">
          <Printer className="h-4 w-4" /> Imprimer / PDF
        </button>
      </div>

      {/* ═══════════════════════ DOCUMENT IMPRIMABLE ═══════════════════════ */}
      <div className="print-wrap print-body max-w-4xl mx-auto bg-white p-8 shadow-sm border border-slate-200 rounded-2xl no-print-border">

        {/* ══ PAGE 1 ══════════════════════════════════════════════════════════ */}
        <HeaderBlock page={1} />

        {/* Table identification */}
        <table style={{ ...tbl, marginTop: '0' }}>
          <tbody>
            <tr>
              <td colSpan={6} style={{ ...cellH, fontWeight: 'bold', fontSize: '9.5pt' }}>
                Intitulé de poste : {fiche.intitule}
              </td>
            </tr>
            <tr>
              <td style={cellH}>Structure :</td>
              <td style={cell}>{fiche.direction}</td>
              <td style={cellH}>Service :</td>
              <td style={cell}>{fiche.service}</td>
              <td style={{ ...cellH, whiteSpace: 'nowrap' }}>Responsable hiérarchique :</td>
              <td style={cell}>{fiche.rattachementHierarchique}</td>
            </tr>
            <tr>
              <td style={cellH}>Version fiche de poste :</td>
              <td style={cell}>{fiche.versionFichePoste || '01'}</td>
              <td colSpan={2} style={cellH}>Code position :</td>
              <td colSpan={2} style={cell}>{fiche.codePosition}</td>
            </tr>
            <tr>
              <td style={cellH}>Code système :</td>
              <td style={cell}>{fiche.codeSysteme}</td>
              <td style={cellH}>Date de création :</td>
              <td style={cell}>{fmtDate(fiche.dateCreation)}</td>
              <td style={cellH}>Dénomination des postes des Subordonnés Directs :</td>
              <td style={cell}>{fiche.subordonneesDirect || 'NA'}</td>
            </tr>
            {missions.length > 0 && (
              <tr>
                <td style={{ ...cellH, verticalAlign: 'top', whiteSpace: 'nowrap' }}>Missions principales :</td>
                <td colSpan={5} style={cell}>
                  {missions.map((m, i) => (
                    <p key={i} style={{ margin: '2px 0', display: 'flex', gap: '6px' }}>
                      <span>•</span><span>{m.replace(/^[•\-]\s*/, '')}</span>
                    </p>
                  ))}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Activités principales */}
        {ap.length > 0 && (
          <div>
            <p style={sectionHeader}>LES ACTIVITÉS PRINCIPALES :</p>
            {ap.map((sec, si) => (
              <div key={si}>
                {sec.titre && (
                  <p style={{ fontWeight: 'bold', fontSize: '9pt', margin: '6px 0 2px', paddingLeft: '8px' }}>
                    {String.fromCharCode(65 + si)}. {sec.titre}
                  </p>
                )}
                <BulletList items={sec.items} />
              </div>
            ))}
          </div>
        )}

        {/* Tâches secondaires */}
        {fiche.activitesSecondaires?.length > 0 && (
          <div>
            <p style={sectionHeader}>TÂCHES SECONDAIRES :</p>
            <CheckList items={fiche.activitesSecondaires} />
          </div>
        )}

        {/* Tâches intérimaires */}
        {fiche.tachesInterimaires?.length > 0 && (
          <div>
            <p style={sectionHeader}>LES TÂCHES INTÉRIMAIRES :</p>
            <CheckList items={fiche.tachesInterimaires} />
          </div>
        )}

        {/* ══ PAGE 2 ══════════════════════════════════════════════════════════ */}
        <div className="page-break" />
        <HeaderBlock page={2} />

        {/* Activités SMI */}
        {fiche.activitesSMI?.length > 0 && (
          <div>
            <p style={sectionHeader}>ACTIVITÉS DANS LE CADRE DU SYSTÈME DE MANAGEMENT INTÉGRÉ :</p>
            <CheckList items={fiche.activitesSMI} />
          </div>
        )}

        {/* Autorités */}
        {fiche.autorites?.length > 0 && (
          <div>
            <p style={{ ...sectionHeader, textDecoration: 'none' }}>Autorités :</p>
            <CheckList items={fiche.autorites} />
          </div>
        )}

        {/* KPI */}
        {fiche.indicateursPerformance?.length > 0 && (
          <div>
            <p style={{ ...sectionHeader, textDecoration: 'none' }}>Indicateurs de performance (KPI), atteinte des objectifs :</p>
            <CheckList items={fiche.indicateursPerformance} />
          </div>
        )}

        {/* Exigence de poste */}
        <div>
          <p style={{ ...sectionHeader, textDecoration: 'none' }}>Exigence de poste :</p>
          <table style={tbl}>
            <tbody>
              {[
                ['Niveau de qualifications (Profil)', fiche.formationRequise],
                ['Formation professionnelle', fiche.specialite],
                ['Expérience professionnelle', fiche.experienceRequise],
                ['Autre qualité souhaitée', fiche.autreQualite],
                ['Conditions et contraintes d\'exercice', fiche.conditionsParticulieres],
              ].filter(([, v]) => v).map(([label, val]) => (
                <tr key={label}>
                  <td style={{ ...cellH, width: '35%' }}>{label}</td>
                  <td style={cell}>{val}</td>
                </tr>
              ))}
              {fiche.exigencesParticulieres?.length > 0 && (
                <tr>
                  <td style={cellH}>Exigences particulières</td>
                  <td style={cell}>
                    {fiche.exigencesParticulieres.map((e, i) => (
                      <p key={i} style={{ margin: '1px 0', display: 'flex', gap: '6px', fontSize: '9pt' }}>
                        <span>{CB}</span><span>{e}</span>
                      </p>
                    ))}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Compétences nécessaires */}
        <div>
          <p style={sectionHeader}>Les compétences nécessaires</p>
          <table style={tbl}>
            <tbody>
              {/* Savoir */}
              {(fiche.competencesTechniques?.length > 0) && (
                <tr>
                  <td style={{ ...cellH, width: '35%' }}>Savoir (Connaissances)</td>
                  <td style={cell}>
                    {fiche.competencesTechniques.map((e, i) => (
                      <p key={i} style={{ margin: '1px 0', display: 'flex', gap: '6px', fontSize: '9pt' }}>
                        <span>{CB}</span><span>{e}</span>
                      </p>
                    ))}
                  </td>
                </tr>
              )}
              {/* Savoir-faire */}
              {(fiche.savoirFaire?.length > 0) && (
                <tr>
                  <td style={cellH}>Savoir-faire (Être capable de faire)</td>
                  <td style={cell}>
                    {fiche.savoirFaire.map((e, i) => (
                      <p key={i} style={{ margin: '1px 0', display: 'flex', gap: '6px', fontSize: '9pt' }}>
                        <span>{CB}</span><span>{e}</span>
                      </p>
                    ))}
                  </td>
                </tr>
              )}
              {/* Savoir-être */}
              {((fiche.savoirEtre?.length > 0) || (fiche.competencesComportementales?.length > 0)) && (
                <tr>
                  <td style={cellH}>Savoir être (aptitudes)</td>
                  <td style={cell}>
                    {(fiche.savoirEtre?.length ? fiche.savoirEtre : fiche.competencesComportementales).map((e, i) => (
                      <p key={i} style={{ margin: '1px 0', display: 'flex', gap: '6px', fontSize: '9pt' }}>
                        <span>{CB}</span><span>{e}</span>
                      </p>
                    ))}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer page 2 */}
        <p style={{ textAlign: 'center', fontSize: '7pt', marginTop: '20px', borderTop: '1px solid black', paddingTop: '4px' }}>
          INFORMATIONS CONFIDENTIELLES LDM<br />
          NE PAS ÊTRE REPRODUIT / DIVULGUÉ SANS APPROBATION ÉCRITE PRÉALABLE
        </p>

        {/* ══ PAGE 3 ══════════════════════════════════════════════════════════ */}
        <div className="page-break" />
        <HeaderBlock page={3} />

        {/* Déclaration */}
        <p style={{ fontSize: '9pt', margin: '12px 0', lineHeight: '1.6', fontFamily: 'Arial, sans-serif' }}>
          Je déclare avoir pris connaissance de mes responsabilités en matière de respect du règlement
          intérieur du groupe, des règles d'hygiène et de sécurité et de préservation de l'environnement,
          ainsi que les modalités d'application des chartes, codes et procédures du groupe.
        </p>

        {/* Signatures */}
        <table style={tbl}>
          <tbody>
            <tr>
              <td style={{ ...cell, width: '50%', verticalAlign: 'top', height: '110px' }}>
                <p style={{ fontWeight: 'bold', marginBottom: '6px', fontSize: '9pt' }}>Signature du concerné</p>
                {employees.slice(0, 1).map(e => (
                  <div key={e.id}>
                    <p style={{ fontSize: '9pt' }}>Nom et prénom : <strong>{e.prenom} {e.nom}</strong></p>
                    <p style={{ fontSize: '9pt' }}>Fonction : {e.poste}</p>
                    <p style={{ fontSize: '9pt', marginTop: '24px' }}>Visa :</p>
                  </div>
                ))}
                {employees.length === 0 && (
                  <>
                    <p style={{ fontSize: '9pt' }}>Nom et prénom :</p>
                    <p style={{ fontSize: '9pt' }}>Fonction :</p>
                    <p style={{ fontSize: '9pt', marginTop: '24px' }}>Visa :</p>
                  </>
                )}
              </td>
              <td style={{ ...cell, width: '50%', verticalAlign: 'top', height: '110px' }}>
                <p style={{ fontWeight: 'bold', marginBottom: '6px', fontSize: '9pt' }}>Responsable Hiérarchique</p>
                <p style={{ fontSize: '9pt' }}>Nom et prénom : {fiche.rattachementHierarchique}</p>
                <p style={{ fontSize: '9pt' }}>Fonction :</p>
                <p style={{ fontSize: '9pt', marginTop: '24px' }}>Visa :</p>
              </td>
            </tr>
            <tr>
              <td style={{ ...cell, verticalAlign: 'top', height: '90px' }}>
                <p style={{ fontWeight: 'bold', marginBottom: '6px', fontSize: '9pt' }}>Approbation Direction Technique (si applicable)</p>
                <p style={{ fontSize: '9pt' }}>Nom et prénom :</p>
                <p style={{ fontSize: '9pt' }}>Fonction :</p>
                <p style={{ fontSize: '9pt', marginTop: '20px' }}>Visa :</p>
              </td>
              <td style={{ ...cell, verticalAlign: 'top', height: '90px' }}>
                <p style={{ fontWeight: 'bold', marginBottom: '6px', fontSize: '9pt' }}>Approbation Ressources humaines</p>
                <p style={{ fontSize: '9pt' }}>Nom et prénom :</p>
                <p style={{ fontSize: '9pt' }}>Fonction : Directeur Finances & Administration Générale — Groupe LDM</p>
                <p style={{ fontSize: '9pt', marginTop: '10px' }}>Visa :</p>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Tableau historique */}
        <p style={{ fontWeight: 'bold', fontSize: '9.5pt', margin: '16px 0 6px', fontFamily: 'Arial, sans-serif' }}>TABLEAU HISTORIQUE :</p>
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
              <td style={{ ...cell, textAlign: 'center' }}>{fmtDate(fiche.dateCreation) || fmtDate(fiche.updatedAt)}</td>
              <td style={{ ...cell, textAlign: 'center' }}>Création</td>
            </tr>
          </tbody>
        </table>

        {/* Footer page 3 */}
        <p style={{ textAlign: 'center', fontSize: '7pt', marginTop: '20px', borderTop: '1px solid black', paddingTop: '4px' }}>
          INFORMATIONS CONFIDENTIELLES LDM<br />
          NE PAS ÊTRE REPRODUIT / DIVULGUÉ SANS APPROBATION ÉCRITE PRÉALABLE
        </p>
      </div>
    </>
  );
};
