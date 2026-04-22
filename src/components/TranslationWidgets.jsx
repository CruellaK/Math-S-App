import React from 'react';
import { LifeBuoy, Languages, Lock, Unlock, X, Zap } from 'lucide-react';
import { renderMixedContent } from './KaTeXRenderer';

export function TranslationButton({ onClick, disabled = false, title = 'Traduction malgache' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-6 h-6 rounded-full border border-black/5 bg-white/30 text-txt-muted hover:text-primary hover:bg-primary/5 active:scale-90 transition-all flex items-center justify-center disabled:opacity-40"
    >
      <Languages size={12} strokeWidth={1.8} className="opacity-65" />
    </button>
  );
}

export function TranslationModal({ open, target, revealed, busy, userHintPacks, userEnergy, onReveal, onClose }) {
  if (!open || !target) return null;

  const available = Boolean(target.translationText);
  const packCost = Math.max(1, Number(target.cost) || 0);
  const energyCost = Math.max(1, Number(target.energyCost ?? target.cost) || 0);
  const scoreCost = Math.max(0, Number(target.scoreCost ?? target.cost) || 0);

  return (
    <div className="fixed inset-0 z-[125] bg-black/45 p-4 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-white shadow-xl animate-scale-in overflow-hidden" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 text-primary-dark">
            <Languages size={18} className="text-primary" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-txt-muted font-semibold">Traduction</p>
              <h3 className="text-base font-extrabold">{target.title || 'Malagasy'}</h3>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-gray-100 text-txt-sub flex items-center justify-center active:scale-90 transition-transform">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-3 flex items-center gap-3 text-[11px] text-txt-sub border-b border-gray-100 bg-gray-50/60">
          <span className="inline-flex items-center gap-1"><LifeBuoy size={12} className="text-primary" /> {userHintPacks} pack{userHintPacks > 1 ? 's' : ''} d’indice</span>
          <span className="inline-flex items-center gap-1"><Zap size={12} className="text-amber-600" /> {userEnergy} énergie</span>
        </div>

        <div className="px-5 py-4 space-y-3">
          {!available ? (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
              <p className="text-sm font-semibold text-txt-main">Traduction indisponible</p>
              <p className="text-[11px] text-txt-muted mt-1">Aucune traduction malgache n’a encore été fournie pour cet élément.</p>
            </div>
          ) : revealed ? (
            <div className="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-4">
              <p className="text-[10px] uppercase tracking-wider text-primary-dark font-semibold mb-1">Version malgache</p>
              <div className="text-sm text-txt-main leading-relaxed">{renderMixedContent(target.translationText)}</div>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                <p className="text-sm font-semibold text-txt-main">Confirmer la dépense</p>
                <p className="text-[11px] text-txt-muted mt-1">Révélez la traduction malgache de cet élément. Le coût est appliqué une seule fois pour cet élément pendant la session.</p>
              </div>
              <div className="rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3 text-[11px] text-txt-sub space-y-1.5">
                <p className="font-semibold text-primary-dark">Coût</p>
                <p>{packCost} pack{packCost > 1 ? 's' : ''} d’indice ou {energyCost} énergie</p>
                <p>{scoreCost} point{scoreCost > 1 ? 's' : ''} de score dépensé{scoreCost > 1 ? 's' : ''}</p>
              </div>
              <button
                onClick={onReveal}
                disabled={busy}
                className={`w-full py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-transform active:scale-95 ${busy ? 'bg-gray-100 text-txt-muted' : 'bg-primary text-white shadow-gold'}`}
              >
                {busy ? <><Lock size={14} /> Chargement...</> : <><Unlock size={14} /> Confirmer et révéler</>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
