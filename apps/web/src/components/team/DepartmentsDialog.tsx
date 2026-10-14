import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useWorkspace } from '../../context/AppContext';
import { departmentsBackend, parentOptions, type DepartmentSummary } from '../../lib/departments';
import { Button, Dialog } from '../ui';
import { memberErrorMessage } from './MemberDialogs';

/** Director-only: the department structure, with «Входит в» per department (one level). */
export function DepartmentsDialog({ onClose }: { onClose: () => void }) {
  const { users, refresh } = useWorkspace();
  const backend = useMemo(() => departmentsBackend(users), [users]);
  const [rows, setRows] = useState<DepartmentSummary[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => { backend.list().then(setRows).catch((reason) => { setRows([]); setError(memberErrorMessage(reason, 'Отделы не загрузились')); }); }, [backend]);

  const ordered = useMemo(() => {
    if (!rows) return [];
    const tops = rows.filter((row) => !row.parentId);
    return tops.flatMap((top) => [top, ...rows.filter((row) => row.parentId === top.id)]);
  }, [rows]);

  const change = async (row: DepartmentSummary, parentId: string | null) => {
    setSaving(row.id); setError(''); setNotice('');
    try {
      const updated = await backend.setParent(row.id, parentId);
      setRows((current) => (current ?? []).map((item) => item.id === row.id ? updated : item));
      const parent = rows?.find((item) => item.id === parentId);
      setNotice(parent ? `${parent.head?.fullName ?? 'Руководитель'} («${parent.name}») теперь видит людей и данные «${row.name}» и может управлять его сотрудниками, включая руководителя.` : `«${row.name}» больше не входит в другой отдел.`);
      void refresh();
    } catch (reason) { setError(memberErrorMessage(reason, 'Структура не изменена')); } finally { setSaving(null); }
  };

  return <Dialog open size="lg" title="Отделы" description="Руководитель отдела видит и подотделы: их клиентов, сделки, задачи, чаты и людей" onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>Закрыть</Button>}>
    {!rows ? <p className="dialog-note">Загружаем отделы…</p> : <table className="departments-table">
      <thead><tr><th>Отдел</th><th>Руководитель</th><th>Людей</th><th>Входит в</th></tr></thead>
      <tbody>{ordered.map((row) => {
        const options = parentOptions(rows, row.id);
        return <tr key={row.id}>
          <td className={row.parentId ? 'departments-table__sub' : undefined}>{row.parentId ? '↳ ' : ''}{row.name}</td>
          <td>{row.head?.fullName ?? inheritedHead(rows, row)}</td>
          <td>{row.memberCount}</td>
          <td><select aria-label={`Входит в: ${row.name}`} value={row.parentId ?? ''} disabled={saving !== null || (!options.length && !row.parentId)}
            onChange={(event) => void change(row, event.target.value || null)}>
            <option value="">—</option>
            {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select></td>
        </tr>;
      })}</tbody>
    </table>}
    {notice && <p className="dialog-note" role="status">{notice}</p>}
    {error && <div className="form-error" role="alert">{error}</div>}
  </Dialog>;
}

/** A sub-department without a head of its own is led by its parent's head. */
function inheritedHead(rows: Array<{ id: string; name: string; parentId?: string | null; head?: { fullName: string } | null }>, row: { parentId?: string | null }): ReactNode {
  const parent = row.parentId ? rows.find((item) => item.id === row.parentId) : undefined;
  if (!parent?.head) return '—';
  return <span className="departments-table__inherited">{parent.head.fullName} <small>· через «{parent.name}»</small></span>;
}
