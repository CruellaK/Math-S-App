import React, { Suspense, lazy } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import MobileLayout from './components/MobileLayout';
import Toast from './components/Toast';

const HomePage = lazy(() => import('./pages/HomePage'));
const ChapterView = lazy(() => import('./pages/ChapterView'));
const QuizView = lazy(() => import('./pages/QuizView'));
const ProfileView = lazy(() => import('./pages/ProfileView'));
const AdminView = lazy(() => import('./pages/AdminView'));
const ExerciseFlowView = lazy(() => import('./pages/ExerciseFlowView'));

function Loading() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 animate-fade-in">
        <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-gold text-white font-extrabold text-xl">B</div>
        <p className="text-sm font-semibold text-txt-sub">Chargement…</p>
      </div>
    </div>
  );
}

function Router() {
  const { view, loading } = useApp();

  if (loading) return <Loading />;

  const showNav = !['quiz', 'exercise-flow'].includes(view);

  return (
    <MobileLayout showBottomNav={showNav}>
      <Suspense fallback={<Loading />}>
        {view === 'home' && <HomePage />}
        {view === 'subjects' && <HomePage tab="subjects" />}
        {view === 'chapter' && <ChapterView />}
        {view === 'quiz' && <QuizView />}
        {view === 'profile' && <ProfileView />}
        {view === 'admin' && <AdminView />}
        {view === 'exercise-flow' && <ExerciseFlowView />}
      </Suspense>
    </MobileLayout>
  );
}

export default function App() {
  return (
    <AppProvider>
      <div className="min-h-[100dvh] bg-bg text-txt-main">
        <Router />
        <Toast />
      </div>
    </AppProvider>
  );
}
