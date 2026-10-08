import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera, X, Building2, Users, Mail, Briefcase,
  Calendar, Award, MapPin, ZoomIn, ZoomOut, RotateCcw,
  ChevronDown, ChevronUp, Search, Maximize2,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { authFetch } from '../../services/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface OrgEmployee {
  id: number;
  nom: string;
  prenom: string;
  poste: string;
  direction: string;
  departement: string;
  service: string;
  role: string;
  photo?: string;
  dateRecrutement?: string;
  email?: string;
  categorie?: string;
  matricule?: string;
  pole?: string;
  responsable1?: string;
  responsable2?: string;
  responsable3?: string;
}

interface TNode {
  id: string;
  emp: OrgEmployee;
  children: TNode[];
}

// ── Constantes visuelles ──────────────────────────────────────────────────────

const NODE_W   = 148;  // largeur totale de la carte
const H_GAP    = 20;   // espace horizontal entre frères (de chaque côté)
const V_STEM   = 38;   // hauteur des tiges verticales

const AV_SIZE  = [80, 64, 54, 46, 40, 36]; // taille avatar selon profondeur

const ROLE_COLOR: Record<string, { ring: string; bg: string; text: string }> = {
  Directeur:   { ring: '#f59e0b', bg: '#fef3c7', text: '#92400e' },
  Manager:     { ring: '#8b5cf6', bg: '#ede9fe', text: '#5b21b6' },
  Responsable: { ring: '#3b82f6', bg: '#dbeafe', text: '#1e40af' },
  Superviseur: { ring: '#10b981', bg: '#d1fae5', text: '#064e3b' },
  RH:          { ring: '#ec4899', bg: '#fce7f3', text: '#9d174d' },
  Gestionnaire:{ ring: '#64748b', bg: '#f1f5f9', text: '#334155' },
};

const GRAD_POOL = [
  'from-blue-400 to-blue-600',
  'from-violet-400 to-violet-600',
  'from-emerald-400 to-emerald-600',
  'from-orange-400 to-orange-600',
  'from-pink-400 to-pink-600',
  'from-teal-400 to-teal-600',
  'from-red-400 to-red-600',
  'from-indigo-400 to-indigo-600',
  'from-amber-400 to-amber-600',
  'from-cyan-400 to-cyan-600',
];
function gradient(emp: OrgEmployee) {
  const h = `${emp.nom}${emp.prenom}`.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return GRAD_POOL[h % GRAD_POOL.length];
}

// ── Utilitaires ───────────────────────────────────────────────────────────────

async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = e => {
      img.onload = () => {
        const MAX = 320;
        const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
        const c = document.createElement('canvas');
        c.width  = Math.round(img.width  * ratio);
        c.height = Math.round(img.height * ratio);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = reject;
      img.src = e.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function yearsAt(d?: string): string {
  if (!d) return '—';
  const parts = d.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3) return '—';
  // Instanciation locale (pas UTC) → pas de décalage timezone
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  if (isNaN(date.getTime())) return '—';
  const y = Math.floor((Date.now() - date.getTime()) / (365.25 * 86400000));
  return y === 0 ? '< 1 an' : `${y} an${y > 1 ? 's' : ''}`;
}

// ── Construction hiérarchie responsable1 ─────────────────────────────────────

function buildHierarchy(employees: OrgEmployee[]): TNode[] {
  const idMap = new Map<number, OrgEmployee>(employees.map(e => [e.id, e]));
  const nameToId = new Map<string, number>();
  employees.forEach(emp => {
    [`${emp.nom} ${emp.prenom}`, `${emp.prenom} ${emp.nom}`].forEach(k => {
      if (!nameToId.has(k.toLowerCase().trim())) nameToId.set(k.toLowerCase().trim(), emp.id);
    });
  });
  const parentOf = new Map<number, number>();
  employees.forEach(emp => {
    if (!emp.responsable1) return;
    const pid = nameToId.get(emp.responsable1.toLowerCase().trim());
    if (pid && pid !== emp.id) parentOf.set(emp.id, pid);
  });
  const childrenOf = new Map<number, number[]>();
  parentOf.forEach((pid, cid) => {
    if (!childrenOf.has(pid)) childrenOf.set(pid, []);
    childrenOf.get(pid)!.push(cid);
  });
  const roots = employees.filter(e => !parentOf.has(e.id));
  const roleOrd: Record<string, number> = { Directeur: 0, Manager: 1, Responsable: 2, Superviseur: 3, RH: 4, Gestionnaire: 5 };
  roots.sort((a, b) => (roleOrd[a.role] ?? 9) - (roleOrd[b.role] ?? 9));

  function build(id: number, anc: Set<number>, depth: number): TNode {
    const emp = idMap.get(id)!;
    if (anc.has(id) || depth > 12) return { id: `n-${id}`, emp, children: [] };
    const next = new Set([...anc, id]);
    const cids = (childrenOf.get(id) || []).sort((a, b) => {
      const ea = idMap.get(a)!, eb = idMap.get(b)!;
      return `${ea.nom} ${ea.prenom}`.localeCompare(`${eb.nom} ${eb.prenom}`);
    });
    return { id: `n-${id}`, emp, children: cids.map(c => build(c, next, depth + 1)) };
  }
  return roots.map(r => build(r.id, new Set(), 0));
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ emp, px }: { emp: OrgEmployee; px: number }) {
  const rc   = ROLE_COLOR[emp.role];
  const ring = rc ? `2.5px solid ${rc.ring}` : '2px solid #e2e8f0';
  const shadow = '0 2px 10px rgba(0,0,0,0.18)';
  return emp.photo ? (
    <img src={emp.photo} alt=""
      style={{ width: px, height: px, borderRadius: '50%', objectFit: 'cover', border: ring, boxShadow: shadow, flexShrink: 0 }} />
  ) : (
    <div style={{ width: px, height: px, borderRadius: '50%', border: ring, boxShadow: shadow, fontSize: px * 0.36, fontWeight: 900, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
      className={`bg-gradient-to-br ${gradient(emp)}`}>
      {(emp.prenom?.[0] ?? '?').toUpperCase()}{(emp.nom?.[0] ?? '').toUpperCase()}
    </div>
  );
}

// ── Nœud de l'arbre ───────────────────────────────────────────────────────────

interface NodeProps {
  node: TNode;
  depth: number;
  collapsed: Set<string>;
  setCollapsed: (s: Set<string>) => void;
  highlight: string;
  onCardClick: (e: OrgEmployee) => void;
  canEditPhoto: (e: OrgEmployee) => boolean;
  openCamera: (e: OrgEmployee, ev: React.MouseEvent) => void;
}

function TreeNode({ node, depth, collapsed, setCollapsed, highlight, onCardClick, canEditPhoto, openCamera }: NodeProps) {
  const px      = AV_SIZE[Math.min(depth, AV_SIZE.length - 1)];
  const rc      = ROLE_COLOR[node.emp.role];
  const isCol   = collapsed.has(node.id);
  const hasKids = node.children.length > 0;
  const n       = node.children.length;
  const isHit   = highlight.length >= 2 &&
    `${node.emp.prenom} ${node.emp.nom}`.toLowerCase().includes(highlight.toLowerCase());

  function toggleCollapse(e: React.MouseEvent) {
    e.stopPropagation();
    const next = new Set(collapsed);
    isCol ? next.delete(node.id) : next.add(node.id);
    setCollapsed(next);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>

      {/* ── Carte ── */}
      <div
        onClick={() => onCardClick(node.emp)}
        title={`${node.emp.prenom} ${node.emp.nom} — ${node.emp.poste}`}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          width: NODE_W, cursor: 'pointer', userSelect: 'none',
        }}
        className="group"
      >
        {/* Avatar + camera btn */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar emp={node.emp} px={px} />
          {canEditPhoto(node.emp) && (
            <button
              onClick={ev => { ev.stopPropagation(); openCamera(node.emp, ev); }}
              style={{ position: 'absolute', bottom: 0, right: 0, width: 18, height: 18, borderRadius: '50%', background: '#3b82f6', border: '2px solid #fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', opacity: 0, transition: 'opacity .15s' }}
              className="group-hover:!opacity-100"
            >
              <Camera size={9} />
            </button>
          )}
        </div>

        {/* Label box */}
        <div style={{
          marginTop: 8, background: '#fff', borderRadius: 10, padding: '7px 8px',
          width: '100%', textAlign: 'center',
          border: isHit ? '2px solid #3b82f6' : '1.5px solid #e2e8f0',
          boxShadow: isHit ? '0 0 0 3px rgba(59,130,246,.15)' : '0 2px 8px rgba(0,0,0,.06)',
          transition: 'border-color .15s, box-shadow .15s',
        }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: '#1e293b', margin: 0, lineHeight: 1.25, wordBreak: 'break-word' }}>
            {node.emp.prenom} {node.emp.nom}
          </p>
          <p style={{ fontSize: 9.5, color: '#64748b', margin: '2px 0 0', lineHeight: 1.3,
            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
            {node.emp.poste}
          </p>
          {rc && (
            <span style={{ marginTop: 3, display: 'inline-block', fontSize: 8, fontWeight: 700, background: rc.bg, color: rc.text, padding: '1px 6px', borderRadius: 999 }}>
              {node.emp.role}
            </span>
          )}
        </div>

        {/* Toggle collapse */}
        {hasKids && (
          <button
            onClick={toggleCollapse}
            style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 999, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: 8.5, fontWeight: 700, color: '#64748b' }}
          >
            {isCol ? <ChevronDown size={9} /> : <ChevronUp size={9} />}
            {isCol ? `+${n} membres` : `Réduire (${n})`}
          </button>
        )}
      </div>

      {/* ── Connecteurs + enfants ── */}
      {hasKids && !isCol && (() => {
        const visibleChildren = node.children;
        return (
          <>
            {/* Tige verticale descendante */}
            <div style={{ width: 2, height: V_STEM, background: '#cbd5e1', flexShrink: 0 }} />

            {/* Rangée des enfants */}
            <div style={{ display: 'flex', alignItems: 'flex-start', flexShrink: 0, position: 'relative' }}>
              {visibleChildren.map((child, i) => {
                const isFirst = i === 0;
                const isLast  = i === n - 1;
                const isOnly  = n === 1;
                return (
                  <div key={child.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: `0 ${H_GAP}px`, position: 'relative', flexShrink: 0 }}>
                    {/* Barre horizontale */}
                    {!isOnly && (
                      <div style={{ position: 'absolute', top: 0, height: 2, background: '#cbd5e1', left: isFirst ? '50%' : 0, right: isLast ? '50%' : 0 }} />
                    )}
                    {/* Tige verticale vers l'enfant */}
                    <div style={{ width: 2, height: V_STEM, background: '#cbd5e1', flexShrink: 0, marginTop: isOnly ? 0 : 0 }} />

                    <TreeNode
                      node={child} depth={depth + 1}
                      collapsed={collapsed} setCollapsed={setCollapsed}
                      highlight={highlight}
                      onCardClick={onCardClick}
                      canEditPhoto={canEditPhoto}
                      openCamera={openCamera}
                    />
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}
    </div>
  );
}

// ── Modal profil ──────────────────────────────────────────────────────────────

function ProfileModal({ employee, onClose, canEdit, onPhotoUpdate }: {
  employee: OrgEmployee; onClose: () => void;
  canEdit: boolean; onPhotoUpdate: (id: number, photo: string) => void;
}) {
  const [photo, setPhoto]   = useState(employee.photo);
  const [busy, setBusy]     = useState(false);
  const fileRef             = useRef<HTMLInputElement>(null);
  const emp                 = { ...employee, photo };
  const rc                  = ROLE_COLOR[emp.role];

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const compressed = await compressImage(file);
      const r = await authFetch(`/api/orgchart/${employee.id}/photo`, { method: 'PATCH', body: JSON.stringify({ photo: compressed }) });
      if (!r.ok) throw new Error();
      setPhoto(compressed);
      onPhotoUpdate(employee.id, compressed);
    } catch { alert('Erreur lors de la mise à jour de la photo.'); }
    finally { setBusy(false); e.target.value = ''; }
  }

  const fields = [
    { icon: Calendar,  label: 'Ancienneté',  val: yearsAt(employee.dateRecrutement) },
    { icon: Building2, label: 'Direction',   val: employee.direction   || '—' },
    { icon: Users,     label: 'Département', val: employee.departement || '—' },
    { icon: Briefcase, label: 'Service',     val: employee.service     || '—' },
    { icon: Award,     label: 'Catégorie',   val: employee.categorie   || '—' },
    { icon: MapPin,    label: 'Pôle',        val: employee.pole        || '—' },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ background: rc ? `linear-gradient(135deg, ${rc.ring}cc, ${rc.ring}88)` : 'linear-gradient(135deg,#3b82f6,#6366f1)', minHeight: 100, position: 'relative' }}>
          <button onClick={onClose} className="absolute top-3 right-3 p-1.5 bg-white/20 hover:bg-white/35 rounded-lg text-white transition"><X size={16} /></button>
          <div className="absolute -bottom-14 left-1/2 -translate-x-1/2">
            <div className="relative group">
              <Avatar emp={emp} px={112} />
              {canEdit && (
                <>
                  <button onClick={() => fileRef.current?.click()} disabled={busy}
                    className="absolute inset-0 rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                    {busy ? <span className="text-xs font-bold">…</span> : <Camera size={24} />}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
                </>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="pb-6 px-6" style={{ paddingTop: 68 }}>
          <div className="text-center mb-4">
            <h3 className="text-xl font-black text-slate-800">{employee.prenom} {employee.nom}</h3>
            <p className="text-sm text-slate-500 mt-0.5">{employee.poste}</p>
            {rc && <span className="inline-block mt-1 px-3 py-1 rounded-full text-xs font-bold" style={{ background: rc.bg, color: rc.text }}>{employee.role}</span>}
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {fields.map(({ icon: Icon, label, val }) => (
              <div key={label} className="bg-slate-50 rounded-xl p-3">
                <div className="flex items-center gap-1 mb-1"><Icon size={11} className="text-slate-400" /><span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{label}</span></div>
                <p className="text-xs font-semibold text-slate-700 truncate" title={val}>{val}</p>
              </div>
            ))}
          </div>
          {employee.responsable1 && (
            <div className="bg-amber-50 rounded-xl p-3 border border-amber-100 mb-2">
              <p className="text-[9px] font-bold text-amber-600 uppercase tracking-wider mb-0.5">Responsable hiérarchique</p>
              <p className="text-xs font-semibold text-slate-700">{employee.responsable1}</p>
              {employee.responsable2 && <p className="text-xs text-slate-400 mt-0.5">N+2 : {employee.responsable2}</p>}
            </div>
          )}
          {employee.email && (
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="flex items-center gap-1 mb-0.5"><Mail size={11} className="text-slate-400" /><span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Email</span></div>
              <a href={`mailto:${employee.email}`} className="text-xs font-semibold text-blue-600 hover:underline truncate block">{employee.email}</a>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── OrgChartPage ──────────────────────────────────────────────────────────────

export function OrgChartPage() {
  const { user } = useAuthStore();

  // Data
  const [employees, setEmployees]       = useState<OrgEmployee[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');

  // UI state
  const [selectedEmp, setSelectedEmp]   = useState<OrgEmployee | null>(null);
  const [uploadTarget, setUploadTarget] = useState<OrgEmployee | null>(null);
  const [filterDir, setFilterDir]       = useState('ALL');
  const [collapsed, setCollapsed]       = useState<Set<string>>(new Set());
  const [highlight, setHighlight]       = useState('');
  const [searchOpen, setSearchOpen]     = useState(false);

  // Pan + zoom
  const [zoom, setZoom]   = useState(0.75);
  const [pan, setPan]     = useState({ x: 0, y: 0 });
  const dragging          = useRef(false);
  const lastMouse         = useRef({ x: 0, y: 0 });
  const containerRef      = useRef<HTMLDivElement>(null);
  const fileRef           = useRef<HTMLInputElement>(null);

  // ── Fetch ──
  useEffect(() => {
    authFetch('/api/orgchart')
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: OrgEmployee[]) => setEmployees(data.filter(e => e.role !== 'SuperAdmin')))
      .catch(() => setError('Impossible de charger l\'organigramme.'))
      .finally(() => setLoading(false));
  }, []);

  // ── Reset pan when filter changes ──
  useEffect(() => {
    setPan({ x: 60, y: 60 });
    setZoom(0.75);
    setCollapsed(new Set());
  }, [filterDir]);

  // ── Mouse wheel zoom centered on cursor ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      setZoom(prevZ => {
        const newZ = Math.max(0.15, Math.min(2.5, prevZ * factor));
        setPan(p => ({
          x: mx + (p.x - mx) * newZ / prevZ,
          y: my + (p.y - my) * newZ / prevZ,
        }));
        return newZ;
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // ── Drag to pan ──
  function onMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('button, a, input')) return;
    dragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    setPan(p => ({ x: p.x + dx, y: p.y + dy }));
  }
  function onMouseUp() { dragging.current = false; }

  // ── Derived data ──
  const directions = useMemo(() => {
    const dirs = [...new Set(employees.map(e => (e.direction || '').trim()).filter(Boolean))];
    return dirs.sort();
  }, [employees]);

  const roots = useMemo(() => {
    const filtered = filterDir === 'ALL'
      ? employees
      : employees.filter(e => (e.direction || '').trim() === filterDir);
    return buildHierarchy(filtered);
  }, [employees, filterDir]);

  const totalCount = filterDir === 'ALL'
    ? employees.length
    : employees.filter(e => (e.direction || '').trim() === filterDir).length;

  // ── Photo permissions ──
  const canEditPhoto = useCallback((target: OrgEmployee): boolean => {
    if (!user) return false;
    const u = user as any;
    if (['SuperAdmin', 'RH'].includes(user.role)) return true;
    if (u.poste === 'Responsable Recrutement & Formation') return true;
    if (user.role === 'Directeur'   && u.direction  === target.direction)   return true;
    if (user.role === 'Manager'     && u.department === target.departement) return true;
    if (user.role === 'Responsable' && u.service    === target.service)     return true;
    if (Number(u.id) === target.id) return true;
    return false;
  }, [user]);

  function updatePhoto(id: number, photo: string) {
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, photo } : e));
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;
    try {
      const compressed = await compressImage(file);
      const r = await authFetch(`/api/orgchart/${uploadTarget.id}/photo`, { method: 'PATCH', body: JSON.stringify({ photo: compressed }) });
      if (!r.ok) throw new Error();
      updatePhoto(uploadTarget.id, compressed);
    } catch { alert('Erreur mise à jour photo.'); }
    finally { e.target.value = ''; setUploadTarget(null); }
  }

  function openCamera(emp: OrgEmployee, ev: React.MouseEvent) {
    ev.stopPropagation();
    setUploadTarget(emp);
    setTimeout(() => fileRef.current?.click(), 0);
  }

  function resetView() { setPan({ x: 60, y: 60 }); setZoom(0.75); }

  // ── Loading / error ──
  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (error) return <div className="flex items-center justify-center h-64 text-red-500 font-semibold">{error}</div>;

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 80px)', gap: 12 }}>

      {/* ══ Barre de contrôle ══ */}
      <div className="flex flex-col gap-2 flex-shrink-0">
        {/* Ligne titre + outils */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black text-slate-800">Organigramme</h1>
            <p className="text-slate-400 text-sm">{totalCount} collaborateurs · {filterDir === 'ALL' ? 'toutes directions' : filterDir}</p>
          </div>

          {/* Barre d'outils droite */}
          <div className="flex items-center gap-2">
            {/* Recherche */}
            {searchOpen ? (
              <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-xl px-3 py-2 shadow-sm">
                <Search size={14} className="text-slate-400" />
                <input
                  autoFocus
                  value={highlight}
                  onChange={e => setHighlight(e.target.value)}
                  placeholder="Rechercher un nom…"
                  className="outline-none text-sm w-40 text-slate-700"
                  onKeyDown={e => { if (e.key === 'Escape') { setSearchOpen(false); setHighlight(''); } }}
                />
                <button onClick={() => { setSearchOpen(false); setHighlight(''); }} className="text-slate-400 hover:text-slate-700">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button onClick={() => setSearchOpen(true)}
                className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:border-slate-400 shadow-sm transition">
                <Search size={14} /> Rechercher
              </button>
            )}

            {/* Contrôles zoom */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2 py-1.5 shadow-sm">
              <button onClick={() => setZoom(z => Math.max(0.15, z / 1.2))} className="p-1 text-slate-500 hover:text-slate-800 transition rounded-lg hover:bg-slate-100"><ZoomOut size={15} /></button>
              <span className="text-xs font-bold text-slate-600 w-9 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.min(2.5, z * 1.2))} className="p-1 text-slate-500 hover:text-slate-800 transition rounded-lg hover:bg-slate-100"><ZoomIn  size={15} /></button>
              <div className="w-px h-4 bg-slate-200 mx-1" />
              <button onClick={resetView} title="Réinitialiser vue" className="p-1 text-slate-500 hover:text-slate-800 transition rounded-lg hover:bg-slate-100"><RotateCcw size={14} /></button>
              <button onClick={() => setCollapsed(new Set())} title="Tout déplier" className="p-1 text-slate-500 hover:text-slate-800 transition rounded-lg hover:bg-slate-100"><Maximize2 size={14} /></button>
            </div>
          </div>
        </div>

        {/* Filtre directions */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterDir('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
              filterDir === 'ALL' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >
            Toutes directions
          </button>
          {directions.map(dir => (
            <button key={dir}
              onClick={() => setFilterDir(dir)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                filterDir === dir ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
              }`}
            >
              {dir.replace(/^Direction\s*/i, '').trim() || dir}
            </button>
          ))}
        </div>
      </div>

      {/* ══ Canvas ══ */}
      <div
        ref={containerRef}
        className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden relative"
        style={{ cursor: dragging.current ? 'grabbing' : 'grab', minHeight: 0 }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {/* Grille de fond */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle, #e2e8f0 1px, transparent 1px)', backgroundSize: '28px 28px', opacity: 0.6, pointerEvents: 'none' }} />

        {/* Aide */}
        <div className="absolute bottom-3 left-3 text-[10px] text-slate-400 font-medium bg-white/80 rounded-lg px-2 py-1 border border-slate-200 pointer-events-none">
          🖱 Scroll pour zoomer · Glisser pour naviguer · Clic sur une carte pour le profil
        </div>

        {/* Compteur de nœuds */}
        {highlight.length >= 2 && (
          <div className="absolute top-3 left-3 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow">
            Recherche : « {highlight} »
          </div>
        )}

        {roots.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400 font-medium">
            Aucun collaborateur trouvé.
          </div>
        ) : (
          <div
            style={{
              position: 'absolute',
              top: 0, left: 0,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              display: 'inline-flex',
              gap: 64,
              padding: '32px 48px',
              minWidth: 'max-content',
              transition: dragging.current ? 'none' : 'transform 0.05s linear',
            }}
          >
            {roots.map(root => (
              <TreeNode
                key={root.id}
                node={root} depth={0}
                collapsed={collapsed} setCollapsed={setCollapsed}
                highlight={highlight}
                onCardClick={setSelectedEmp}
                canEditPhoto={canEditPhoto}
                openCamera={openCamera}
              />
            ))}
          </div>
        )}
      </div>

      {/* Légende */}
      <div className="flex items-center gap-4 flex-shrink-0 flex-wrap">
        <span className="text-xs text-slate-400 font-semibold">Légende :</span>
        {Object.entries(ROLE_COLOR).map(([role, c]) => (
          <span key={role} className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: c.text }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', border: `2.5px solid ${c.ring}`, display: 'inline-block' }} />
            {role}
          </span>
        ))}
      </div>

      {/* Inputs cachés */}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      {/* Modal profil */}
      {selectedEmp && (
        <ProfileModal
          employee={selectedEmp}
          onClose={() => setSelectedEmp(null)}
          canEdit={canEditPhoto(selectedEmp)}
          onPhotoUpdate={updatePhoto}
        />
      )}
    </div>
  );
}
