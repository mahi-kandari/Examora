import { Suspense, lazy } from 'react';
import { Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';

const Splash = lazy(() => import('./pages/Splash'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Login = lazy(() => import('./pages/Login'));
const Permissions = lazy(() => import('./pages/Permissions'));
const Dashboard = lazy(() => import('./pages/Home'));
const Upload = lazy(() => import('./pages/Upload'));
const Confirm = lazy(() => import('./pages/Confirm'));
const Success = lazy(() => import('./pages/Success'));
const ExamDetail = lazy(() => import('./pages/ExamDetail'));
const History = lazy(() => import('./pages/History'));
const Profile = lazy(() => import('./pages/Profile'));

function LoadingScreen() {
	return (
		<div className="flex min-h-screen items-center justify-center bg-app-gradient">
			<div className="h-12 w-12 animate-spin rounded-full border-4 border-white/15 border-t-accent" />
		</div>
	);
}

function NotFound() {
	return (
		<div className="flex min-h-screen items-center justify-center bg-app-gradient px-4">
			<div className="glass w-full max-w-md rounded-[28px] p-8 text-center shadow-glass">
				<h1 className="text-2xl font-semibold text-text-heading">Page not found</h1>
				<p className="mt-2 text-sm text-text-muted">The page you&apos;re looking for doesn&apos;t exist.</p>
			</div>
		</div>
	);
}

function LegacyExamRedirect() {
	const { id } = useParams();
	return <Navigate to={`/exams/${id}`} replace />;
}

function PrivateRoute() {
	const { user, loading } = useAuth();

	if (loading) {
		return <LoadingScreen />;
	}

	if (!user) {
		return <Navigate to="/login" replace />;
	}

	return <Outlet />;
}

function AppRoutes() {
	return (
		<Suspense fallback={<LoadingScreen />}>
			<Routes>
				<Route path="/" element={<Splash />} />
				<Route path="/onboarding" element={<Onboarding />} />
				<Route path="/login" element={<Login />} />

				<Route element={<PrivateRoute />}>
					<Route path="/permissions" element={<Permissions />} />
				</Route>

				<Route element={<PrivateRoute />}>
					<Route path="/home" element={<Dashboard />} />
					<Route path="/upload" element={<Upload />} />
					<Route path="/confirm/:id" element={<Confirm />} />
					<Route path="/success/:id" element={<Success />} />
					<Route path="/exams/:id" element={<ExamDetail />} />
					<Route path="/exams" element={<History />} />
					<Route path="/profile" element={<Profile />} />
				</Route>

				<Route path="/dashboard" element={<Navigate to="/home" replace />} />
				<Route path="/history" element={<Navigate to="/exams" replace />} />
				<Route path="/exam/:id" element={<LegacyExamRedirect />} />
				<Route path="*" element={<NotFound />} />
			</Routes>
		</Suspense>
	);
}

export default function App() {
	return (
		<ThemeProvider>
			<AuthProvider>
				<AppRoutes />
			</AuthProvider>
		</ThemeProvider>
	);
}