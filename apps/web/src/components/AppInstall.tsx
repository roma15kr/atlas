import { useTranslation } from 'react-i18next';
import { Download, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { installState, onInstallChange, promptInstall, type InstallState } from '../lib/install';
import { Badge, Button, SectionHeader, Surface } from './ui';

/** «Профиль → Приложение»: install Atlas as an app on this device. */
export function AppInstall() {
  const { t } = useTranslation(['profile', 'common']);
  const [state, setState] = useState<InstallState>(installState);
  useEffect(() => onInstallChange(() => setState(installState())), []);

  return <Surface className="app-install" aria-label={t('install.title')}>
    <SectionHeader title={t('install.title')} meta={state === 'installed' ? <Badge tone="success">{t('install.installed')}</Badge> : undefined} />
    {state === 'installed' && <p className="dialog-note">{t('install.installedText')}</p>}
    {state === 'available' && <>
      <p className="dialog-note">{t('install.offer')}</p>
      <Button icon={Download} onClick={() => void promptInstall().then(() => setState(installState()))}>{t('install.button')}</Button>
    </>}
    {state === 'ios' && <div className="app-install__steps">
      <p className="dialog-note"><Smartphone size={15} aria-hidden /> {t('install.iphone')}</p>
      <ol><li>{t('install.step1')}</li><li>{t('install.step2')}</li><li>{t('install.step3')}</li></ol>
      <p className="form-hint">{t('install.iphoneNote')}</p>
    </div>}
    {state === 'unavailable' && <p className="dialog-note">{t('install.unavailable')}</p>}
  </Surface>;
}
