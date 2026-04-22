import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Home, BookOpen, User, Shield, Coins, Trophy, Zap, Flame, Star } from 'lucide-react';

const NAV_ITEMS = [
  { view: 'home', label: 'Accueil', icon: Home },
  { view: 'subjects', label: 'Matières', icon: BookOpen },
  { view: 'profile', label: 'Profil', icon: User },
  { view: 'admin', label: 'Admin', icon: Shield },
];

function AnimatedCounter({ value }) {
  const isNumeric = Number.isFinite(Number(value));
  const [displayValue, setDisplayValue] = useState(isNumeric ? Number(value) : value);
  const previousValueRef = useRef(isNumeric ? Number(value) : value);

  useEffect(() => {
    if (!Number.isFinite(Number(value))) {
      previousValueRef.current = value;
      setDisplayValue(value);
      return undefined;
    }

    const nextValue = Number(value) || 0;
    const startValue = Number(previousValueRef.current) || 0;
    previousValueRef.current = nextValue;
    if (startValue === nextValue) {
      setDisplayValue(nextValue);
      return undefined;
    }

    let frameId;
    const duration = 450;
    const startTime = performance.now();

    const animate = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(startValue + ((nextValue - startValue) * eased)));
      if (progress < 1) frameId = window.requestAnimationFrame(animate);
    };

    frameId = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frameId);
  }, [value]);

  return Number.isFinite(Number(displayValue)) ? Number(displayValue).toLocaleString('fr-FR') : displayValue;
}

function HeaderChip({ icon: Icon, label, value, tone }) {
  const toneClass = tone === 'credits'
    ? 'bg-accent-green/10 text-accent-green border-accent-green/20'
    : tone === 'average'
      ? 'bg-accent-blue/10 text-accent-blue border-accent-blue/20'
      : tone === 'fire'
        ? 'bg-accent-red/10 text-accent-red border-accent-red/20'
        : tone === 'energy'
          ? 'bg-amber-100 text-amber-700 border-amber-200'
    : 'bg-primary/10 text-primary-dark border-primary/20';

  return (
    <div className={`shrink-0 min-w-[74px] rounded-2xl border px-2.5 py-1.5 shadow-sm backdrop-blur ${toneClass}`}>
      <div className="flex items-center gap-1.5">
        <Icon size={12} />
        <div>
          <p className="text-[8px] uppercase tracking-wide font-extrabold opacity-80 leading-none">{label}</p>
          <p className="text-xs font-extrabold leading-none mt-0.5"><AnimatedCounter value={value} /></p>
        </div>
      </div>
    </div>
  );
}

export default function MobileLayout({ children, showBottomNav = true }) {
  const { view, navigate, playClick, data, floatingFx } = useApp();
  const user = data?.user || {};
  const energyCap = Math.max(1, Math.round(Number(data?.settings?.scoreCaps?.energy) || 100));
  const showTopHud = view === 'home';
  const hudRows = [
    { icon: Trophy, label: 'Moy.', value: `${Number(user.averageScore || 0).toFixed(1)}/20`, tone: 'average' },
    { icon: Zap, label: 'Énergie', value: `${Math.round(user.energy || 0)}/${energyCap}`, tone: 'energy' },
    { icon: Coins, label: 'Crédits', value: user.credits || 0, tone: 'credits' },
    { icon: Flame, label: 'Feu', value: user.fire || user.streak || 0, tone: 'fire' },
    { icon: Star, label: 'XP', value: user.xp || 0, tone: 'xp' },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col max-w-lg mx-auto">
      {showTopHud && (
        <div className="sticky top-0 z-50 px-2 pt-2 pb-1.5 bg-bg/85 backdrop-blur-xl">
          <div className="space-y-1.5">
            <div className="rounded-[24px] border border-white/60 bg-white/90 shadow-card backdrop-blur-xl px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div>
                  <p className="text-[8px] uppercase tracking-[0.18em] text-txt-muted font-extrabold leading-none">Accueil</p>
                  <h2 className="text-xs font-extrabold text-primary-dark mt-0.5">{user.profileName || 'Élève BacBooster'}</h2>
                  <p className="text-[10px] text-txt-sub mt-0.5 leading-none">{user.selectedClass || 'Terminale'}</p>
                </div>
                <button
                  onClick={() => navigate('profile')}
                  className="w-9 h-9 rounded-xl overflow-hidden bg-gradient-to-br from-primary to-primary-light text-white flex items-center justify-center shadow-gold active:scale-95 transition-transform"
                >
                  {user.avatar ? (
                    <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-extrabold">{(user.profileName || 'B').trim().charAt(0).toUpperCase()}</span>
                  )}
                </button>
              </div>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                {hudRows.map((item) => (
                  <HeaderChip key={item.label} icon={item.icon} label={item.label} value={item.value} tone={item.tone} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {floatingFx.length > 0 && (
        <div className="pointer-events-none fixed top-3 left-0 right-0 z-[60] max-w-lg mx-auto px-3 flex flex-col items-end gap-1">
          {floatingFx.slice(-3).map((entry, index) => (
            <div
              key={entry.id}
              className={`animate-bounce-in rounded-2xl px-2.5 py-1.5 text-[10px] font-extrabold shadow-card border ${entry.positive ? 'bg-accent-green/95 border-accent-green/30 text-white' : 'bg-accent-red/95 border-accent-red/30 text-white'}`}
              style={{ transform: `translateY(${index * 2}px)` }}
            >
              <span>{entry.positive ? '+' : ''}{entry.amount} {entry.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className={`flex-1 pt-0 ${showBottomNav ? 'pb-20' : 'pb-4'}`}>
        {children}
      </div>

      {showBottomNav && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-primary/10 safe-bottom">
          <div className="max-w-lg mx-auto flex items-center justify-around px-2 py-1.5">
            {NAV_ITEMS.map(item => {
              const isActive = view === item.view || (item.view === 'home' && view === 'chapter');
              const Icon = item.icon;
              return (
                <button
                  key={item.view}
                  onClick={() => { playClick(); navigate(item.view); }}
                  className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all active:scale-90 ${
                    isActive
                      ? 'text-primary-dark bg-primary/10'
                      : 'text-txt-sub'
                  }`}
                >
                  <Icon size={20} strokeWidth={isActive ? 2.3 : 1.8} />
                  <span className={`text-[10px] font-semibold ${isActive ? 'text-primary-dark' : ''}`}>{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
