import { useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { NotificationProvider } from './context/NotificationContext';
import AuthScreen from './components/auth/AuthScreen';
import ChatApp from './components/chat/ChatApp';
import ToastContainer from './components/ui/Toast';
import { installAudioUnlock } from './utils/audio';

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner" />
      </div>
    );
  }

  return user ? <ChatApp /> : <AuthScreen />;
}

export default function App() {
  useEffect(() => {
    installAudioUnlock();
  }, []);

  return (
    <AuthProvider>
      <ToastProvider>
        <NotificationProvider>
          <AppContent />
          <ToastContainer />
        </NotificationProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
