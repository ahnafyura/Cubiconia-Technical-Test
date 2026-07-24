'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Empty, Skeleton } from '@/components/ui';

interface AuditEntry {
  id: string; actorId: string | null; action: string; aggregateType: string; aggregateId: string;
  metadata: Record<string, unknown> | null; createdAt: string;
}

const AGGREGATE_TYPES = ['Transaction', 'ProfitSharingRule', 'ProfitDistribution', 'Employee', 'OrgUnit', 'Product', 'Customer', 'Setting'];

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [type, setType] = useState('');

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (type) params.set('aggregateType', type);
    api<AuditEntry[]>(`/audit-logs?${params}`).then(setEntries).catch(() => setEntries([]));
  }, [type]);
  useEffect(load, [load]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Audit Log</h1>
          <p className="page-sub">Jejak siapa melakukan apa, kapan, terhadap data apa, 50 kejadian terakhir</p>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 'var(--space-md)' }}>
        <select className="select" style={{ maxWidth: 240 }} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Semua jenis data</option>
          {AGGREGATE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {!entries ? (
        <Skeleton rows={8} />
      ) : entries.length === 0 ? (
        <Empty title="Belum ada kejadian tercatat" hint="Aksi seperti membuat transaksi atau menyetujui distribusi akan muncul di sini." />
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr><th>Waktu</th><th>Aksi</th><th>Jenis data</th><th>ID data</th></tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="muted" style={{ fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>
                    {new Date(e.createdAt).toLocaleString('id-ID')}
                  </td>
                  <td className="num">{e.action}</td>
                  <td className="muted">{e.aggregateType}</td>
                  <td className="muted num" style={{ fontSize: 'var(--text-xs)' }}>{e.aggregateId.slice(0, 8)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
