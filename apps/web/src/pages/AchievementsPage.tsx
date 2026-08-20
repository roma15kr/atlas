import { Award, CheckCircle2, Medal, Sparkles, Target, Trophy } from 'lucide-react';
import { EmptyState, Meter, PageHeader, SectionHeader, Surface } from '../components/ui';
import { useAuth, useWorkspace } from '../context/AppContext';
import { formatDate } from '../lib/format';

const icons = [Target, Sparkles, Trophy, Award];
export function AchievementsPage() {
  const { session } = useAuth(); const { achievements, users } = useWorkspace(); const me = session!.user;
  const ranking = [...users].sort((a, b) => b.rating - a.rating); const place = ranking.findIndex((user) => user.id === me.id) + 1;
  return <>
    <PageHeader title="Достижения" description="Личный результат и командный рейтинг" />
    <div className="achievement-hero"><Surface className="score-panel"><div className="score-ring" style={{ '--score': `${me.rating * 3.6}deg` } as React.CSSProperties}><span><strong>{me.rating}</strong><small>из 100</small></span></div><div><span>Рейтинг успешности</span><h2>{me.fullName}</h2><p>{place ? `${place}-е место в доступной команде` : 'Рейтинг формируется'}</p><Meter value={me.rating} /><small>{achievements.reduce((sum, achievement) => sum + achievement.points, 0)} баллов за достижения</small></div></Surface><Surface className="achievement-stats"><div><Medal size={20} /><span><strong>{achievements.length}</strong><small>получено</small></span></div><div><CheckCircle2 size={20} /><span><strong>{me.kpis.filter((kpi) => kpi.actual >= kpi.target).length}</strong><small>KPI выполнено</small></span></div><div><Trophy size={20} /><span><strong>{place || '—'}</strong><small>место в рейтинге</small></span></div></Surface></div>
    <div className="achievements-layout"><Surface className="badge-gallery"><SectionHeader title="Мои награды" />{achievements.length ? <div className="achievement-grid">{achievements.map((achievement, index) => { const Icon = icons[index % icons.length]; return <article key={achievement.id}><span><Icon size={24} /></span><div><strong>{achievement.name}</strong><p>{achievement.description}</p><small>{formatDate(achievement.awardedAt)} · +{achievement.points} баллов</small></div></article>; })}</div> : <EmptyState title="Наград пока нет" description="Они появятся после первых завершённых целей" icon={Award} />}</Surface><Surface className="ranking-panel"><SectionHeader title="Рейтинг команды" /><ol>{ranking.slice(0, 8).map((user, index) => <li key={user.id} className={user.id === me.id ? 'is-me' : ''}><span>{index + 1}</span><div><strong>{user.fullName}</strong><small>{user.jobTitle}</small></div><b>{user.rating}</b></li>)}</ol></Surface></div>
  </>;
}
