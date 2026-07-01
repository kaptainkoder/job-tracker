import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import TrackerPage from '../features/tracker/TrackerPage';
import ResumeReviewPage from '../features/resume/ResumeReviewPage';
import SettingsPage from '../features/settings/SettingsPage';
import PrivacyPage from '../features/privacy/PrivacyPage';
import LandingPage from '../features/landing/LandingPage';
import { AuthProvider } from '../features/auth/AuthProvider';
import SignInPage from '../features/auth/SignInPage';
import AuthCallbackPage from '../features/auth/AuthCallbackPage';
import ProtectedRoute from '../features/auth/ProtectedRoute';
import AppShell from './AppShell';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/tracker" element={<TrackerPage />} />
              {/* Wave H — unified Profile: the section-aware structured-résumé editor is the single
                  "who I am" surface. The former thin /profile and separate /resume are removed. */}
              <Route path="/profile" element={<ResumeReviewPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
