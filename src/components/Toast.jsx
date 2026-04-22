import React from 'react';
import { useApp } from '../context/AppContext';
import { CheckCircle, AlertCircle, Info } from 'lucide-react';

const ICONS = { success: CheckCircle, error: AlertCircle, info: Info };
const COLORS = {
  success: 'bg-accent-green/10 border-accent-green/30 text-accent-green',
  error: 'bg-accent-red/10 border-accent-red/30 text-accent-red',
  info: 'bg-primary/10 border-primary/30 text-primary-dark',
};

export default function Toast() {
  const { toast } = useApp();
  if (!toast) return null;
  const Icon = ICONS[toast.type] || Info;
  const color = COLORS[toast.type] || COLORS.info;

  return (
    <div className="fixed top-4 left-4 right-4 z-[999] flex justify-center pointer-events-none animate-fade-in-up">
      <div className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl border backdrop-blur-md shadow-lg text-sm font-semibold ${color}`}>
        <Icon size={18} />
        <span>{toast.message}</span>
      </div>
    </div>
  );
}
