import { Download, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { installState, onInstallChange, promptInstall, type InstallState } from '../lib/install';
import { Badge, Button, SectionHeader, Surface } from './ui';

/** «Профиль → Приложение»: install Atlas as an app on this device. */
export function AppInstall() {
  const [state, setState] = useState<InstallState>(installState);
  useEffect(() => onInstallChange(() => setState(installState())), []);

  return <Surface className="app-install" aria-label="Приложение">
    <SectionHeader title="Приложение" meta={state === 'installed' ? <Badge tone="success">Установлено</Badge> : undefined} />
    {state === 'installed' && <p className="dialog-note">Atlas открыт как приложение. Уведомления включаются в разделе «Уведомления».</p>}
    {state === 'available' && <>
      <p className="dialog-note">Установите Atlas как приложение: своя иконка, полный экран и уведомления, как у обычного приложения.</p>
      <Button icon={Download} onClick={() => void promptInstall().then(() => setState(installState()))}>Установить приложение</Button>
    </>}
    {state === 'ios' && <div className="app-install__steps">
      <p className="dialog-note"><Smartphone size={15} aria-hidden /> Чтобы установить Atlas на iPhone:</p>
      <ol><li>Нажмите «Поделиться» внизу Safari.</li><li>Выберите «На экран Домой» и нажмите «Добавить».</li><li>Откройте Atlas с иконки на экране.</li></ol>
      <p className="form-hint">Уведомления на iPhone работают только в установленном приложении, начиная с iOS 16.4.</p>
    </div>}
    {state === 'unavailable' && <p className="dialog-note">Откройте Atlas в Google Chrome на телефоне или компьютере — там появится кнопка «Установить приложение». На iPhone используйте Safari.</p>}
  </Surface>;
}
