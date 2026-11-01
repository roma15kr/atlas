import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, GripVertical, Pencil, Trash2 } from 'lucide-react';
import { useState, type DragEvent, type FormEvent } from 'react';
import i18n from '../i18n';
import { Badge, Button, Dialog, Field, IconButton, SelectField } from './ui';

/** Presets reuse colors already on the Sales board; any color can still be chosen. */
export const stageColorPresets = ['#398078', '#176f68', '#366e9e', '#765ca8', '#a66c20', '#b07627', '#39815a', '#a44444'];

/** How a screen names the records in a stage: a count («3 сделки»), none of them («сделок») and moving them («сделки»). */
export interface StageRecords { count: (count: number) => string; none: string; move: string }

/** The per-stage classification a screen configures: a funnel outcome or a task board category. */
export type KindOptions<K extends string> = Record<K, { label: string; tone: 'neutral' | 'success' | 'danger' | 'info' | 'warning'; hint: string }>;

/** Stage shape shared by the settings screens; `kind` is the outcome or category, `count` the records in it. */
export interface EditableStage<K extends string> {
  id: string;
  name: string;
  color: string;
  kind: K;
  count: number;
}

export interface EditableStageInput<K extends string> {
  name: string;
  color: string;
  kind: K;
}

export type DescribeError = (reason: unknown, fallback: string) => string;

/** Shared submit handling: keeps the dialog open with an error in the user's language when the API rejects the change. */
export function useSubmit(onClose: () => void, describe: DescribeError) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setSaving(true); setError('');
    try { await action(); onClose(); } catch (reason) { setError(describe(reason, fallback)); } finally { setSaving(false); }
  };
  return { saving, error, run };
}

export function NameDialog({ title, description, label, placeholder, submitLabel, initial, describeError, onClose, onSubmit }: {
  title: string; description?: string; label: string; placeholder: string; submitLabel: string; initial: string;
  describeError: DescribeError; onClose: () => void; onSubmit: (name: string) => Promise<unknown>;
}) {
  const { t } = useTranslation(['stages', 'common']);
  const [name, setName] = useState(initial);
  const { saving, error, run } = useSubmit(onClose, describeError);
  const trimmed = name.trim();
  const submit = (event: FormEvent) => { event.preventDefault(); void run(() => onSubmit(trimmed), i18n.t('stages:nameFailed')); };
  return <Dialog open title={title} description={description} size="sm" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button><Button type="submit" form="name-form" disabled={saving || !trimmed || trimmed === initial}>{saving ? t('common:actions.saving') : submitLabel}</Button></>}>
    <form id="name-form" className="form-grid" onSubmit={submit}><Field label={label} className="field--wide"><input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required placeholder={placeholder} autoFocus /></Field>{error && <div className="form-error field--wide" role="alert">{error}</div>}</form>
  </Dialog>;
}

export function StageDialog<K extends string>({ stage, kinds, kindLabel, defaultKind, placement, describeError, onClose, onSubmit }: {
  stage?: EditableStage<K>; kinds: KindOptions<K>; kindLabel: string; defaultKind: K; placement: string;
  describeError: DescribeError; onClose: () => void; onSubmit: (input: EditableStageInput<K>) => Promise<unknown>;
}) {
  const { t } = useTranslation(['stages', 'common']);
  const [draft, setDraft] = useState<EditableStageInput<K>>({ name: stage?.name ?? '', color: stage?.color ?? stageColorPresets[0]!, kind: stage?.kind ?? defaultKind });
  const { saving, error, run } = useSubmit(onClose, describeError);
  const name = draft.name.trim();
  const unchanged = Boolean(stage) && name === stage!.name && draft.color.toLowerCase() === stage!.color.toLowerCase() && draft.kind === stage!.kind;
  const submit = (event: FormEvent) => { event.preventDefault(); void run(() => onSubmit({ ...draft, name }), stage ? t('stageFailed') : t('addFailed')); };
  return <Dialog open title={stage ? t('editTitle') : t('newTitle')} description={stage ? undefined : placement} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button><Button type="submit" form="stage-form" disabled={saving || !name || unchanged}>{saving ? t('common:actions.saving') : stage ? t('common:actions.save') : t('add')}</Button></>}>
    <form id="stage-form" className="form-grid" onSubmit={submit}>
      <Field label={t('name')} className="field--wide"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={100} required placeholder={t('namePlaceholder')} autoFocus /></Field>
      <Field label={t('color')} className="field--wide"><span className="color-presets" role="radiogroup" aria-label={t('colorGroup')}>{stageColorPresets.map((color) => <button key={color} type="button" role="radio" aria-checked={draft.color.toLowerCase() === color} aria-label={t('colorOption', { color })} className={draft.color.toLowerCase() === color ? 'is-active' : ''} style={{ background: color }} onClick={() => setDraft({ ...draft, color })} />)}<label className={`color-presets__custom ${stageColorPresets.includes(draft.color.toLowerCase()) ? '' : 'is-active'}`} title={t('otherColor')}><input type="color" aria-label={t('otherColor')} value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /></label></span></Field>
      <div className="field field--wide"><SelectField label={kindLabel} value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as K })}>{(Object.keys(kinds) as K[]).map((value) => <option key={value} value={value}>{kinds[value].label}</option>)}</SelectField><small>{kinds[draft.kind].hint}</small></div>
      {error && <div className="form-error field--wide" role="alert">{error}</div>}
    </form>
  </Dialog>;
}

export function DeleteStageDialog<K extends string>({ stage, stages, records, describeError, onClose, onDelete }: {
  stage: EditableStage<K>; stages: Array<EditableStage<K>>; records: StageRecords;
  describeError: DescribeError; onClose: () => void; onDelete: (moveToStageId?: string) => Promise<unknown>;
}) {
  const { t } = useTranslation(['stages', 'common']);
  const [target, setTarget] = useState('');
  const { saving, error, run } = useSubmit(onClose, describeError);
  const needsTarget = stage.count > 0;
  return <Dialog open title={t('deleteTitle', { name: stage.name })} description={needsTarget ? t('deleteMove', { records: records.count(stage.count) }) : t('deleteEmpty', { none: records.none })} size="sm" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button><Button variant="danger" disabled={saving || (needsTarget && !target)} onClick={() => void run(() => onDelete(needsTarget ? target : undefined), t('deleteFailed'))}>{needsTarget ? t('moveAndDelete') : t('common:actions.delete')}</Button></>}>
    {needsTarget && <SelectField label={t('moveTo', { records: records.move })} value={target} onChange={(event) => setTarget(event.target.value)} required><option value="">{t('chooseStage')}</option>{stages.filter((item) => item.id !== stage.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField>}
    {error && <div className="form-error" role="alert">{error}</div>}
  </Dialog>;
}

/** Read-only, reorderable stage rows with edit and delete icons; editing happens in dialogs. */
export function StageRows<K extends string>({ stages, kinds, countLabel, deleteBlockedReason, onReorder, onEdit, onDelete }: {
  stages: Array<EditableStage<K>>; kinds: KindOptions<K>; countLabel: (count: number) => string;
  deleteBlockedReason: (stage: EditableStage<K>) => string | undefined;
  onReorder: (stageIds: string[]) => void; onEdit: (stage: EditableStage<K>) => void; onDelete: (stage: EditableStage<K>) => void;
}) {
  const { t } = useTranslation(['stages', 'common']);
  const [dragged, setDragged] = useState<string | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= stages.length || from === to) return;
    const ids = stages.map((stage) => stage.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved!);
    onReorder(ids);
  };
  const drop = (event: DragEvent, index: number) => {
    event.preventDefault();
    if (dragged) move(stages.findIndex((stage) => stage.id === dragged), index);
    setDragged(null);
  };
  return <ol className="stage-rows">{stages.map((stage, index) => { const blocked = deleteBlockedReason(stage); return <li key={stage.id} draggable onDragStart={() => setDragged(stage.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, index)} className={dragged === stage.id ? 'is-dragging' : ''}>
    <span className="drag-handle" aria-hidden="true"><GripVertical size={15} /></span>
    <i className="color-marker" style={{ background: stage.color }} aria-hidden="true" />
    <span className="stage-rows__name"><strong>{stage.name}</strong><small>{countLabel(stage.count)}</small></span>
    <Badge tone={kinds[stage.kind].tone}>{kinds[stage.kind].label}</Badge>
    <span className="row-actions">
      <IconButton label={t('up', { name: stage.name })} icon={ArrowUp} disabled={index === 0} onClick={() => move(index, index - 1)} />
      <IconButton label={t('down', { name: stage.name })} icon={ArrowDown} disabled={index === stages.length - 1} onClick={() => move(index, index + 1)} />
      <IconButton label={t('edit', { name: stage.name })} icon={Pencil} onClick={() => onEdit(stage)} />
      <IconButton label={t('delete', { name: stage.name })} icon={Trash2} disabled={Boolean(blocked)} title={blocked ?? t('delete', { name: stage.name })} onClick={() => onDelete(stage)} />
    </span>
  </li>; })}</ol>;
}
