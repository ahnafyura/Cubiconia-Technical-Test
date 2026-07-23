'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Empty, Skeleton, StatusBadge } from '@/components/ui';

interface Employee {
  id: string;
  employeeNo: string;
  fullName: string;
  email: string;
  phone: string | null;
  position: string;
  orgUnit: { id: string; name: string } | null;
  manager: { id: string; fullName: string } | null;
  deletedAt: string | null;
}
interface OrgUnit { id: string; name: string; code: string; parentId: string | null; employeeCount: number }

/**
 * Status akun sebagai KOLOM UTAMA, bukan detail sekunder (ux-spec.md §7.8).
 * Manfaat directory management adalah memutus akses saat karyawan keluar —
 * dan itu cuma berguna kalau akun aktif-padahal-seharusnya-mati kelihatan
 * dalam sekali pandang, bukan tersembunyi di halaman detail.
 */
export default function DirectoryPage() {
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [search, setSearch] = useState('');
  const [orgUnitId, setOrgUnitId] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | ''>('');
  const [editing, setEditing] = useState<Employee | 'new' | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (orgUnitId) params.set('orgUnitId', orgUnitId);
    if (status) params.set('status', status);
    api<Employee[]>(`/directory/employees?${params}`).then(setEmployees).catch(() => setEmployees([]));
  }, [search, orgUnitId, status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api<OrgUnit[]>('/directory/org-units').then(setOrgUnits).catch(() => {}); }, []);

  async function toggleActive(emp: Employee) {
    const action = emp.deletedAt ? 'reactivate' : null;
    if (action) {
      await api(`/directory/employees/${emp.id}/reactivate`, { method: 'POST' });
    } else {
      await api(`/directory/employees/${emp.id}`, { method: 'DELETE' });
    }
    load();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Direktori Karyawan</h1>
          <p className="page-sub">
            Menonaktifkan akun di sini adalah cara memutus akses, bukan sekadar catatan HR
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>+ Karyawan</button>
      </div>

      <div className="row" style={{ marginBottom: 'var(--space-md)' }}>
        <input
          className="input" style={{ maxWidth: 260 }} placeholder="Cari nama, email, jabatan…"
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
        <select className="select" style={{ width: 'auto' }} value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)}>
          <option value="">Semua unit</option>
          {orgUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select className="select" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'inactive' | '')}>
          <option value="">Semua status</option>
          <option value="active">Aktif</option>
          <option value="inactive">Nonaktif</option>
        </select>
      </div>

      {editing && (
        <EmployeeEditor
          employee={editing === 'new' ? null : editing}
          orgUnits={orgUnits}
          employees={employees ?? []}
          onDone={() => { setEditing(null); load(); }}
          onCancel={() => setEditing(null)}
        />
      )}

      {!employees ? (
        <Skeleton rows={6} />
      ) : employees.length === 0 ? (
        <Empty
          title={search || orgUnitId || status ? 'Tidak ada karyawan yang cocok' : 'Belum ada karyawan'}
          hint={search || orgUnitId || status ? 'Coba ubah saringan.' : 'Tambahkan karyawan pertama untuk mulai mengelola direktori.'}
          action={
            search || orgUnitId || status ? (
              <button className="btn btn-sm" onClick={() => { setSearch(''); setOrgUnitId(''); setStatus(''); }}>Reset saringan</button>
            ) : undefined
          }
        />
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>Status</th><th>Nama</th><th>Jabatan</th><th>Unit</th><th>Atasan</th><th></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id}>
                  <td><StatusBadge status={e.deletedAt ? 'INACTIVE' : 'ACTIVE'} /></td>
                  <td>
                    {e.fullName}
                    <div className="muted" style={{ fontSize: 'var(--text-xs)' }}>{e.email}</div>
                  </td>
                  <td>{e.position}</td>
                  <td className="muted">{e.orgUnit?.name ?? 'Belum ada'}</td>
                  <td className="muted">{e.manager?.fullName ?? 'Belum ada'}</td>
                  <td className="right">
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn btn-sm" onClick={() => setEditing(e)}>Ubah</button>
                      <button
                        className={e.deletedAt ? 'btn btn-sm' : 'btn btn-sm btn-danger'}
                        onClick={() => toggleActive(e)}
                      >
                        {e.deletedAt ? 'Aktifkan' : 'Nonaktifkan'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="page-sub" style={{ marginTop: 'var(--space-md)' }}>
        <Link href="/direktori/bagan">Lihat bagan organisasi →</Link>
      </p>
    </>
  );
}

function EmployeeEditor({
  employee, orgUnits, employees, onDone, onCancel,
}: {
  employee: Employee | null;
  orgUnits: OrgUnit[];
  employees: Employee[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [fullName, setFullName] = useState(employee?.fullName ?? '');
  const [email, setEmail] = useState(employee?.email ?? '');
  const [phone, setPhone] = useState(employee?.phone ?? '');
  const [position, setPosition] = useState(employee?.position ?? '');
  const [orgUnitId, setOrgUnitId] = useState(employee?.orgUnit?.id ?? '');
  const [managerId, setManagerId] = useState(employee?.manager?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true); setError(null);
    try {
      const body = {
        fullName, email, phone: phone || null, position,
        orgUnitId: orgUnitId || null, managerId: managerId || null,
      };
      if (employee) {
        await api(`/directory/employees/${employee.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api('/directory/employees', { method: 'POST', body: JSON.stringify(body) });
      }
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
      <h2 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-md)' }}>
        {employee ? `Ubah ${employee.fullName}` : 'Karyawan baru'}
      </h2>
      <div className="grid-2">
        <div>
          <div className="field">
            <label htmlFor="fullName">Nama lengkap</label>
            <input id="fullName" className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="phone">Telepon (opsional)</label>
            <input id="phone" className="input" value={phone ?? ''} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div>
          <div className="field">
            <label htmlFor="position">Jabatan</label>
            <input id="position" className="input" value={position} onChange={(e) => setPosition(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="orgUnit">Unit organisasi</label>
            <select id="orgUnit" className="select" value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)}>
              <option value="">Tanpa unit</option>
              {orgUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="manager">Atasan</label>
            <select id="manager" className="select" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
              <option value="">Tanpa atasan</option>
              {employees.filter((e) => e.id !== employee?.id).map((e) => (
                <option key={e.id} value={e.id}>{e.fullName}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && <div className="alert s-critical" role="alert">{error}</div>}

      <div className="row">
        <button className="btn btn-primary" disabled={busy || !fullName || !email || !position} onClick={save}>
          {busy ? 'Menyimpan…' : 'Simpan'}
        </button>
        <button className="btn btn-sm" onClick={onCancel}>Batal</button>
      </div>
    </div>
  );
}
