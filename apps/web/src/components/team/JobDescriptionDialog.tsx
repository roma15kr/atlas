import { FileText } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button, Dialog, Field } from '../ui';
import { memberErrorMessage } from './MemberDialogs';
import type { User } from '../../types';

export const JOB_DESCRIPTION_MAX = 20_000;

/** A starting structure; each section is filled in one point per line. */
export const JOB_DESCRIPTION_TEMPLATE = [
  'Цель должности:',
  '',
  '',
  'Обязанности:',
  '- ',
  '',
  'Показатели результата:',
  '- ',
  '',
  'Полномочия:',
  '- ',
  '',
  'Взаимодействие:',
  '- ',
].join('\n');

const count = new Intl.NumberFormat('ru-RU');

/** The dedicated editor for a member's job description; an empty save clears it. */
export function JobDescriptionDialog({ member, save, onClose }: { member: User; save: (jobDescription: string) => Promise<void>; onClose: () => void }) {
  const [text, setText] = useState(member.jobDescription ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const unchanged = text.trim() === (member.jobDescription ?? '').trim();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError('');
    try { await save(text.trim()); onClose(); }
    catch (reason) { setError(memberErrorMessage(reason, 'Инструкция не сохранена')); }
    finally { setSaving(false); }
  };

  return <Dialog open size="lg" title="Должностная инструкция" description={member.fullName} onClose={() => { if (!saving) onClose(); }}
    footer={<><Button variant="secondary" disabled={saving} onClick={onClose}>Отмена</Button><Button type="submit" form="job-description-form" disabled={saving || unchanged}>{saving ? 'Сохраняем…' : 'Сохранить'}</Button></>}>
    <form id="job-description-form" className="job-description-form" onSubmit={(event) => void submit(event)}>
      <p className="dialog-note">Используется AI-аналитикой как описание ожидаемых обязанностей. Пишите по одному пункту в строке.</p>
      {!text.trim() && <Button type="button" variant="secondary" icon={FileText} onClick={() => setText(JOB_DESCRIPTION_TEMPLATE)}>Вставить шаблон</Button>}
      <Field label="Текст инструкции" hint={`${count.format(text.length)} / ${count.format(JOB_DESCRIPTION_MAX)}`}>
        <textarea rows={16} maxLength={JOB_DESCRIPTION_MAX} value={text} onChange={(event) => setText(event.target.value)} placeholder="Цель должности, обязанности, показатели результата, полномочия" autoFocus />
      </Field>
      {error && <div className="form-error" role="alert">{error}</div>}
    </form>
  </Dialog>;
}
