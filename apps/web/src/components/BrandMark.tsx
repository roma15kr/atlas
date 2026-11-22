import { useBranding } from '../context/BrandingContext';

/** The company's mark: its logo, or the first letter of its app name on the accent colour. */
export function BrandMark({ className = '', variant }: { className?: string; variant?: 'light' }) {
  const { branding } = useBranding();
  const letter = Array.from(branding.appName.trim())[0]?.toUpperCase() ?? 'A';
  if (branding.files) return <span className={`brand-mark brand-mark--logo ${className}`.trim()}><img src={branding.files.logo} alt="" /></span>;
  return <span className={`brand-mark ${variant === 'light' ? 'brand-mark--light' : ''} ${className}`.trim()} aria-hidden="true">{letter}</span>;
}
