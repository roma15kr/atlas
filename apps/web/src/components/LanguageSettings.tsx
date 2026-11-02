import { Languages } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AppContext';
import { applyLanguage, currentLanguage, LANGUAGES, type Language } from '../i18n';
import { SectionHeader, Surface } from './ui';

/** «Мова інтерфейсу»: Українська, Русский or English, saved on the account and applied at once. */
export function LanguageSettings() {
  const { t } = useTranslation('profile');
  const { t: common } = useTranslation();
  const { updateProfile } = useAuth();
  const [saving, setSaving] = useState<Language | null>(null);
  const [error, setError] = useState('');
  const active = currentLanguage();
  const choose = async (language: Language) => {
    if (language === active || saving) return;
    setSaving(language); setError('');
    try { await updateProfile({ language }); await applyLanguage(language); }
    catch { setError(t('language.failed')); }
    finally { setSaving(null); }
  };
  return <Surface className="language-settings">
    <SectionHeader title={t('language.title')} />
    <div className="security-rows"><div><span className="settings-icon"><Languages size={17} /></span><span><small>{t('language.hint')}</small></span></div></div>
    <div className="segmented language-settings__choices" role="radiogroup" aria-label={t('language.title')}>
      {LANGUAGES.map((language) => <button key={language} type="button" role="radio" aria-checked={language === active} lang={language}
        className={language === active ? 'is-active' : ''} disabled={saving !== null} onClick={() => void choose(language)}>{common(`languages.${language}`)}</button>)}
    </div>
    {error && <div className="form-error" role="alert">{error}</div>}
  </Surface>;
}
