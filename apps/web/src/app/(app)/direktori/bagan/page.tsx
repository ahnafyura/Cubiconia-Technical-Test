'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Empty, Skeleton, StatusBadge } from '@/components/ui';

interface OrgNode {
  id: string;
  name: string;
  code: string;
  employeeCount: number;
  children: OrgNode[];
}
interface Employee {
  id: string; fullName: string; email: string; position: string; deletedAt: string | null;
}
interface Edge { d: string; color: string }

// Nama pada kartu ini murni pemanis visual, diminta pengguna untuk melengkapi
// bagan — dipilih deterministik dari id unit (stabil antar-render), BUKAN
// data karyawan sesungguhnya. Klik kartu untuk melihat karyawan ASLI di unit
// itu (lewat /directory/employees?orgUnitId=), bukan nama dekoratif ini.
const DUMMY_NAMES = [
  'Ayu Lestari', 'Bagas Saputra', 'Cinta Amelia', 'Dimas Prakoso',
  'Elang Nusantara', 'Fitri Handayani', 'Galih Purnomo', 'Hana Salsabila',
  'Irfan Maulana', 'Jasmine Putri', 'Kevin Wirawan', 'Laras Ayuningtyas',
];
// Warna kategorikal (bukan --color-accent) — satu hue per cabang divisi,
// diwariskan ke seluruh sub-unit di bawahnya, termasuk garis penghubungnya.
// Ini pemakaian --viz-* yang sah: identitas cabang, bukan magnitude/status.
const BRANCH_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];
const NEUTRAL_LINE = '#c9d4e1'; // = --color-rule, dituliskan literal karena dipakai sebagai atribut SVG

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function dummyName(id: string): string {
  return DUMMY_NAMES[hashStr(id) % DUMMY_NAMES.length];
}
function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function collectEdges(nodes: OrgNode[], parentId: string | null = null): { parentId: string; childId: string }[] {
  let out: { parentId: string; childId: string }[] = [];
  for (const n of nodes) {
    if (parentId) out.push({ parentId, childId: n.id });
    if (n.children.length) out = out.concat(collectEdges(n.children, n.id));
  }
  return out;
}
function collectColors(nodes: OrgNode[], depth = 0, inherited: string | null = null): Record<string, string | null> {
  let map: Record<string, string | null> = {};
  nodes.forEach((n, i) => {
    const color = inherited ?? (depth === 1 ? BRANCH_COLORS[i % BRANCH_COLORS.length] : null);
    map[n.id] = color;
    Object.assign(map, collectColors(n.children, depth + 1, color));
  });
  return map;
}

/** Konektor siku membulat — turun dari bawah kartu induk, melengkung ke arah
 *  kartu anak, mendatar, melengkung lagi, lalu turun ke atap kartu anak.
 *  Kalau induk dan anak segaris (anak tunggal), cukup garis lurus turun —
 *  melengkungkan garis lurus cuma bikin bentuk aneh, bukan lebih rapi. */
function elbowPath(x1: number, y1: number, x2: number, y2: number, r = 12): string {
  const dir = x2 > x1 + 0.5 ? 1 : x2 < x1 - 0.5 ? -1 : 0;
  if (dir === 0) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const midY = (y1 + y2) / 2;
  const rr = Math.min(r, Math.abs(x2 - x1) / 2, Math.max(0, midY - y1), Math.max(0, y2 - midY));
  return [
    `M ${x1} ${y1}`,
    `L ${x1} ${midY - rr}`,
    `Q ${x1} ${midY} ${x1 + dir * rr} ${midY}`,
    `L ${x2 - dir * rr} ${midY}`,
    `Q ${x2} ${midY} ${x2} ${midY + rr}`,
    `L ${x2} ${y2}`,
  ].join(' ');
}

export default function OrgChartPage() {
  const [tree, setTree] = useState<OrgNode[] | null>(null);
  const [selected, setSelected] = useState<OrgNode | null>(null);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => { api<OrgNode[]>('/directory/org-units/chart').then(setTree).catch(() => setTree([])); }, []);

  const measure = useCallback(() => {
    const canvas = canvasRef.current;
    if (!tree || !canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const colors = collectColors(tree);
    const next = collectEdges(tree).flatMap(({ parentId, childId }) => {
      const parentEl = cardRefs.current.get(parentId);
      const childEl = cardRefs.current.get(childId);
      if (!parentEl || !childEl) return [];
      const pr = parentEl.getBoundingClientRect();
      const cr = childEl.getBoundingClientRect();
      const x1 = pr.left + pr.width / 2 - canvasRect.left;
      const y1 = pr.bottom - canvasRect.top;
      const x2 = cr.left + cr.width / 2 - canvasRect.left;
      const y2 = cr.top - canvasRect.top;
      return [{ d: elbowPath(x1, y1, x2, y2), color: colors[childId] ?? NEUTRAL_LINE }];
    });
    setEdges(next);
    setCanvasSize({ width: canvas.scrollWidth, height: canvas.scrollHeight });
  }, [tree]);

  useLayoutEffect(measure, [measure]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    // Font Montserrat dimuat async (display:swap) — lebar kartu bisa geser
    // sedikit begitu font "nyata" masuk menggantikan fallback. Ukur ulang
    // sekali lagi begitu font selesai supaya garis tidak sedikit meleset.
    document.fonts?.ready?.then(measure).catch(() => {});
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Bagan Organisasi</h1>
          <p className="page-sub">Dirakit dari closure table, setiap unit tahu seluruh bawahannya tanpa rekursi manual. Klik kartu untuk lihat karyawannya.</p>
        </div>
        <Link className="btn btn-sm" href="/direktori">← Direktori</Link>
      </div>

      {!tree ? (
        <Skeleton rows={5} />
      ) : tree.length === 0 ? (
        <Empty title="Belum ada unit organisasi" hint="Struktur organisasi belum dibuat." />
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="orgchart-scroll">
            <div className="orgchart-canvas" ref={canvasRef}>
              <svg
                className="orgchart-svg"
                width={canvasSize.width}
                height={canvasSize.height}
                aria-hidden="true"
              >
                {edges.map((e, i) => (
                  <path key={i} d={e.d} fill="none" stroke={e.color} strokeWidth={2} strokeLinecap="round" />
                ))}
              </svg>
              <ul className="orgchart">
                {tree.map((node, i) => (
                  <OrgTreeNode key={node.id} node={node} depth={0} branchColor={null} branchIndex={i} onSelect={setSelected} cardRefs={cardRefs} />
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {selected && <UnitEmployeesModal node={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function OrgTreeNode({
  node, depth, branchColor, branchIndex, onSelect, cardRefs,
}: {
  node: OrgNode; depth: number; branchColor: string | null; branchIndex: number;
  onSelect: (n: OrgNode) => void; cardRefs: React.MutableRefObject<Map<string, HTMLButtonElement>>;
}) {
  // Cabang mendapat warnanya persis satu kali, di depth 1 (anak langsung
  // root) — lalu diwariskan apa adanya ke seluruh keturunannya, termasuk ke
  // garis SVG yang menyambungkannya (lihat collectColors di atas, logikanya
  // sengaja disamakan persis). Root sendiri (Kantor Pusat) netral.
  const color = branchColor ?? (depth === 1 ? BRANCH_COLORS[branchIndex % BRANCH_COLORS.length] : null);
  const person = dummyName(node.id);

  return (
    <li>
      <button
        type="button"
        className="org-card"
        onClick={() => onSelect(node)}
        ref={(el) => { if (el) cardRefs.current.set(node.id, el); else cardRefs.current.delete(node.id); }}
        style={color ? ({ '--org-accent': color } as React.CSSProperties) : undefined}
      >
        <span className="org-level-tag">L{depth + 1}</span>
        <span className="org-avatar" aria-hidden="true">{initials(person)}</span>
        <span className="org-card-body">
          <span className="org-card-name">{node.name}</span>
          <span className="org-card-person">{person}</span>
          <span className="row" style={{ marginTop: 4, gap: 6, flexWrap: 'nowrap' }}>
            <span className="badge s-muted">
              <span className="badge-dot" aria-hidden="true" />
              {node.employeeCount}
            </span>
            <span className="muted num" style={{ fontSize: 10 }}>{node.code}</span>
          </span>
        </span>
      </button>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child, i) => (
            <OrgTreeNode key={child.id} node={child} depth={depth + 1} branchColor={color} branchIndex={i} onSelect={onSelect} cardRefs={cardRefs} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Menampilkan karyawan ASLI di unit yang diklik, bukan nama dekoratif
 *  kartu. Data lewat endpoint direktori yang sama dengan /direktori. */
function UnitEmployeesModal({ node, onClose }: { node: OrgNode; onClose: () => void }) {
  const [employees, setEmployees] = useState<Employee[] | null>(null);

  useEffect(() => {
    setEmployees(null);
    api<Employee[]>(`/directory/employees?orgUnitId=${node.id}`).then(setEmployees).catch(() => setEmployees([]));
  }, [node.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" role="dialog" aria-modal="true" aria-label={`Karyawan di ${node.name}`} onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 'var(--space-md)' }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-md)' }}>{node.name}</h2>
            <p className="muted num" style={{ fontSize: 'var(--text-xs)', marginTop: 2 }}>{node.code}</p>
          </div>
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label="Tutup">✕</button>
        </div>

        {!employees ? (
          <Skeleton rows={3} />
        ) : employees.length === 0 ? (
          <Empty title="Belum ada karyawan di unit ini" />
        ) : (
          <div className="stack" style={{ gap: 'var(--space-xs)' }}>
            {employees.map((e) => (
              <div key={e.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-rule)' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{e.fullName}</div>
                  <div className="muted" style={{ fontSize: 'var(--text-xs)' }}>{e.position} · {e.email}</div>
                </div>
                <StatusBadge status={e.deletedAt ? 'INACTIVE' : 'ACTIVE'} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
