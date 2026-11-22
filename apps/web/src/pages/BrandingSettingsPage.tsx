import { useTranslation } from 'react-i18next';
import { ImageUp, Palette, PencilLine, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { BrandMark } from '../components/BrandMark';
import { Button, Dialog, Field, PageHeader, SectionHeader, Surface } from '../components/ui';
import { useBranding } from '../context/BrandingContext';
import { ApiError } from '../lib/api';
import {
  accentReadable, APP_NAME_MAX, BRANDING_PRESETS, brandingTokens, contrastRatio, isHexColor,
  type Branding, type BrandingFile,
} from '../lib/branding';
import { ImagePreparationError, logoProblem, prepareBrandIcons } from '../lib/image';
import { localeOf } from '../i18n';

type Open = 'name' | 'logo' | 'colours' | 'removeLogo' | 'reset' | null;
const KNOWN_ERRORS = ['BRANDING_LOW_CONTRAST', 'UNSUPPORTED_IMAGE', 'DIRECTOR_ONLY'] as const;

/** Director-only: the company's title, logo and colours, shown to everyone at once. */
export function BrandingSettingsPage() {
  const { t } = useTranslation(['branding', 'common']);
  const { branding, removeLogo, reset } = useBranding();
  const [open, setOpen] = useState<Open>(null);
  const [notice, setNotice] = useState('');
  const failure = useFailure();
  const done = () => { setOpen(null); setNotice(t('page.saved')); };

  return <>
    <PageHeader title={t('page.title')} description={t('page.description')} />
    {notice && <div className="notice notice--info" role="status">{notice}<button onClick={() => setNotice('')}>{t('common:actions.close')}</button></div>}
    <div className="branding-settings">
      <Surface className="branding-settings__card">
        <SectionHeader title={t('identity.title')} action={<div className="branding-settings__actions">
          <Button variant="secondary" icon={PencilLine} onClick={() => setOpen('name')}>{t('identity.rename')}</Button>
          <Button variant="secondary" icon={ImageUp} onClick={() => setOpen('logo')}>{t('identity.upload')}</Button>
          {branding.files && <Button variant="secondary" icon={Trash2} onClick={() => setOpen('removeLogo')}>{t('identity.remove')}</Button>}
        </div>} />
        <div className="branding-identity">
          <BrandMark className="brand-mark--xl" />
          <dl className="dialog-facts"><div><dt>{t('identity.name')}</dt><dd>{branding.appName}</dd></div>
            <div><dt>{t('identity.logo')}</dt><dd>{branding.files ? t('identity.logoSet') : t('identity.noLogo')}</dd></div></dl>
        </div>
      </Surface>
      <Surface className="branding-settings__card">
        <SectionHeader title={t('colours.title')} action={<Button variant="secondary" icon={Palette} onClick={() => setOpen('colours')}>{t('colours.change')}</Button>} />
        <div className="branding-swatches">
          <Swatch color={branding.accentColor} label={t('colours.accent')} hint={t('colours.accentHint')} />
          <Swatch color={branding.sidebarColor} label={t('colours.sidebar')} />
        </div>
      </Surface>
      <Surface className="branding-settings__card">
        <SectionHeader title={t('preview.title')} />
        <BrandingPreview branding={branding} />
      </Surface>
      <button type="button" className="text-button branding-settings__reset" onClick={() => setOpen('reset')}><RotateCcw size={14} aria-hidden /> {t('reset.action')}</button>
    </div>
    {open === 'name' && <NameDialog onClose={() => setOpen(null)} onDone={done} />}
    {open === 'logo' && <LogoDialog onClose={() => setOpen(null)} onDone={done} />}
    {open === 'colours' && <ColoursDialog onClose={() => setOpen(null)} onDone={done} />}
    {open === 'removeLogo' && <ConfirmDialog title={t('logo.removeTitle')} text={t('logo.removeText')} confirm={t('logo.removeConfirm')} error={failure.message}
      onClose={() => setOpen(null)} onConfirm={() => failure.run(removeLogo).then((ok) => ok && done())} />}
    {open === 'reset' && <ConfirmDialog title={t('reset.title')} text={t('reset.text')} confirm={t('reset.confirm')} error={failure.message}
      onClose={() => setOpen(null)} onConfirm={() => failure.run(reset).then((ok) => ok && done())} />}
  </>;
}

/** Runs a save, keeping a readable error for the open dialog. */
function useFailure() {
  const { t } = useTranslation('branding');
  const [message, setMessage] = useState('');
  const run = async (action: () => Promise<void>): Promise<boolean> => {
    setMessage('');
    try { await action(); return true; } catch (reason) {
      const code = reason instanceof ApiError ? reason.code : reason instanceof Error ? reason.message : undefined;
      const known = KNOWN_ERRORS.find((item) => item === code);
      setMessage(reason instanceof ImagePreparationError ? reason.message : known ? t(`errors.${known}`) : t('page.failed'));
      return false;
    }
  };
  return { message, run };
}

function Swatch({ color, label, hint }: { color: string; label: string; hint?: string }) {
  return <div className="branding-swatch"><i style={{ background: color }} aria-hidden /><span><small>{label}</small><strong>{color}</strong>{hint && <small>{hint}</small>}</span></div>;
}

/** A small sidebar, a primary button and a link in the given colours. */
function BrandingPreview({ branding }: { branding: Pick<Branding, 'appName' | 'accentColor' | 'sidebarColor'> }) {
  const { t } = useTranslation('branding');
  const style = useMemo(() => brandingTokens(branding) as React.CSSProperties, [branding]);
  return <div className="branding-preview" style={style}>
    <div className="branding-preview__side"><strong>{branding.appName}</strong>
      <span>{t('preview.nav1')}</span><span className="is-active">{t('preview.nav2')}</span><span>{t('preview.nav3')}</span></div>
    <div className="branding-preview__main"><p>{t('preview.text')}</p>
      <div><span className="button button--primary branding-preview__button">{t('preview.button')}</span> <span className="branding-preview__link">{t('preview.link')}</span></div></div>
  </div>;
}

function NameDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation(['branding', 'common']);
  const { branding, update } = useBranding();
  const [name, setName] = useState(branding.appName);
  const [saving, setSaving] = useState(false);
  const failure = useFailure();
  const valid = name.trim().length >= 1 && name.trim().length <= APP_NAME_MAX;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setSaving(true);
    if (await failure.run(() => update({ appName: name.trim() }))) onDone();
    setSaving(false);
  };
  return <Dialog open size="sm" title={t('name.title')} description={t('name.text')} onClose={onClose} footer={<>
    <Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button>
    <Button type="submit" form="branding-name-form" disabled={saving || !valid}>{t('common:actions.save')}</Button></>}>
    <form id="branding-name-form" onSubmit={(event) => void submit(event)}>
      <Field label={t('name.field')} hint={`${name.trim().length} / ${APP_NAME_MAX}`} error={!valid ? t('name.invalid') : failure.message || undefined}>
        <input value={name} maxLength={60} autoFocus onChange={(event) => setName(event.target.value)} />
      </Field>
    </form>
  </Dialog>;
}

function LogoDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation(['branding', 'common']);
  const { branding, uploadLogo } = useBranding();
  const [files, setFiles] = useState<Record<BrandingFile, Blob> | null>(null);
  const [previews, setPreviews] = useState<{ logo: string; icon: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const failure = useFailure();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (previews) { URL.revokeObjectURL(previews.logo); URL.revokeObjectURL(previews.icon); } }, [previews]);
  const choose = async (file: File | undefined) => {
    if (!file) return;
    setFiles(null); setPreviews(null);
    setBusy(true);
    await failure.run(async () => {
      const problem = logoProblem(file);
      if (problem) throw new ImagePreparationError(problem);
      const prepared = await prepareBrandIcons(file, branding.accentColor);
      setFiles(prepared);
      setPreviews({ logo: URL.createObjectURL(prepared.logo), icon: URL.createObjectURL(prepared.icon192) });
    });
    setBusy(false);
  };
  const save = async () => {
    if (!files) return;
    setBusy(true);
    if (await failure.run(() => uploadLogo(files))) onDone();
    setBusy(false);
  };
  return <Dialog open title={t('logo.title')} description={t('logo.text')} onClose={onClose} footer={<>
    <Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button>
    <Button type="button" disabled={busy || !files} onClick={() => void save()}>{t('logo.save')}</Button></>}>
    <div className="branding-logo-dialog">
      <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp" aria-label={t('logo.file')} onChange={(event) => { void choose(event.target.files?.[0]); event.target.value = ''; }} />
      <Button type="button" variant="secondary" icon={ImageUp} disabled={busy} onClick={() => input.current?.click()}>{t('logo.choose')}</Button>
      <small>{busy && !files ? t('logo.preparing') : t('logo.rules')}</small>
      {previews && <div className="branding-logo-dialog__previews">
        <figure><span className="brand-mark brand-mark--logo brand-mark--xl"><img src={previews.logo} alt="" /></span><figcaption>{t('logo.mark')}</figcaption></figure>
        <figure><img className="branding-logo-dialog__icon" src={previews.icon} alt="" /><figcaption>{t('logo.appIcon')}</figcaption></figure>
      </div>}
      {failure.message && <div className="form-error" role="alert">{failure.message}</div>}
    </div>
  </Dialog>;
}

function ColoursDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation(['branding', 'common']);
  const { branding, update } = useBranding();
  const [accent, setAccent] = useState(branding.accentColor);
  const [sidebar, setSidebar] = useState(branding.sidebarColor);
  const [saving, setSaving] = useState(false);
  const failure = useFailure();
  const accentValid = isHexColor(accent);
  const sidebarValid = isHexColor(sidebar);
  const readable = accentReadable(accent);
  const ratio = accentValid ? new Intl.NumberFormat(localeOf(), { maximumFractionDigits: 1 }).format(contrastRatio('#ffffff', accent)) : '';
  const canSave = accentValid && sidebarValid && readable && !saving;
  const save = async () => {
    setSaving(true);
    if (await failure.run(() => update({ accentColor: accent.toLowerCase(), sidebarColor: sidebar.toLowerCase() }))) onDone();
    setSaving(false);
  };
  const colourField = (label: string, value: string, set: (next: string) => void, valid: boolean, problem?: string) => <Field label={label} error={!valid ? t('dialog.invalidCode') : problem}>
    <span className="branding-colour-field">
      <input type="color" aria-label={t('dialog.picker', { label })} value={valid ? value.toLowerCase() : '#000000'} onChange={(event) => set(event.target.value)} />
      <input aria-label={t('dialog.code', { label })} value={value} maxLength={7} onChange={(event) => set(event.target.value.trim())} />
    </span>
  </Field>;
  return <Dialog open size="lg" title={t('dialog.title')} description={t('dialog.text')} onClose={onClose} footer={<>
    <Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button>
    <Button type="button" disabled={!canSave} onClick={() => void save()}>{t('common:actions.save')}</Button></>}>
    <h3 className="branding-dialog__heading">{t('dialog.presets')}</h3>
    <div className="branding-presets" role="radiogroup" aria-label={t('dialog.presets')}>
      {BRANDING_PRESETS.map((preset) => {
        const checked = preset.accentColor === accent.toLowerCase() && preset.sidebarColor === sidebar.toLowerCase();
        return <button key={preset.key} type="button" role="radio" aria-checked={checked} title={t(`presets.${preset.key}`)} aria-label={t(`presets.${preset.key}`)}
          className={checked ? 'is-active' : ''} onClick={() => { setAccent(preset.accentColor); setSidebar(preset.sidebarColor); }}>
          <i style={{ background: preset.accentColor }} /><i style={{ background: preset.sidebarColor }} />
        </button>;
      })}
    </div>
    <div className="form-grid">
      {colourField(t('dialog.accent'), accent, setAccent, accentValid, accentValid && !readable ? t('dialog.lowContrast', { ratio }) : undefined)}
      {colourField(t('dialog.sidebar'), sidebar, setSidebar, sidebarValid)}
    </div>
    <h3 className="branding-dialog__heading">{t('dialog.preview')}</h3>
    <BrandingPreview branding={{ appName: branding.appName, accentColor: accentValid ? accent : branding.accentColor, sidebarColor: sidebarValid ? sidebar : branding.sidebarColor }} />
    {failure.message && <div className="form-error" role="alert">{failure.message}</div>}
  </Dialog>;
}

function ConfirmDialog({ title, text, confirm, error, onClose, onConfirm }: { title: string; text: string; confirm: string; error: string; onClose: () => void; onConfirm: () => Promise<unknown> }) {
  const { t } = useTranslation('common');
  const [busy, setBusy] = useState(false);
  return <Dialog open size="sm" title={title} onClose={onClose} footer={<>
    <Button variant="secondary" onClick={onClose}>{t('actions.cancel')}</Button>
    <Button type="button" variant="danger" disabled={busy} onClick={() => { setBusy(true); void onConfirm().finally(() => setBusy(false)); }}>{confirm}</Button></>}>
    <p className="dialog-note">{text}</p>
    {error && <div className="form-error" role="alert">{error}</div>}
  </Dialog>;
}
