import { useState, useEffect } from 'react';
import { MessageCircle, Sparkles, ArrowRight, UserPlus, LogIn, KeyRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../services/api';

export default function AuthScreen() {
  const [mode, setMode] = useState('login'); // login | register | forgot | reset
  const [loading, setLoading] = useState(false);
  const { login, register, googleLogin } = useAuth();
  const { addToast } = useToast();

  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    displayName: '',
    resetToken: '',
  });

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId || mode !== 'login') return;

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      if (!window.google) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          try {
            setLoading(true);
            await googleLogin({ credential: response.credential });
            addToast('Signed in with Google', 'success');
          } catch (err) {
            addToast(err.message, 'error');
          } finally {
            setLoading(false);
          }
        },
      });
      const el = document.getElementById('google-btn');
      if (el) {
        window.google.accounts.id.renderButton(el, {
          theme: 'outline',
          size: 'large',
          width: 320,
          text: 'continue_with',
        });
      }
    };
    document.body.appendChild(script);
    return () => {
      script.remove();
    };
  }, [mode, googleLogin, addToast]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(form.username, form.password);
        addToast('Welcome back!', 'success');
      } else if (mode === 'register') {
        const data = await register(form);
        addToast('Account created successfully!', 'success');
        if (data?.emailVerificationToken) {
          addToast('Demo verify token logged to server console', 'info');
        }
      } else if (mode === 'forgot') {
        const data = await api.forgotPassword(form.email);
        addToast(data.message || 'Check your email for reset instructions', 'success');
        if (data.resetToken) {
          setForm((f) => ({ ...f, resetToken: data.resetToken }));
          setMode('reset');
          addToast('Demo mode: paste token prefilled — set a new password', 'info');
        }
      } else if (mode === 'reset') {
        await api.resetPassword({ token: form.resetToken, password: form.password });
        addToast('Password updated. Please sign in.', 'success');
        setMode('login');
      }
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-bg">
        <div className="auth-orb auth-orb-1" />
        <div className="auth-orb auth-orb-2" />
        <div className="auth-orb auth-orb-3" />
      </div>

      <header className="auth-top-bar">
        <div className="auth-top-brand">
          <MessageCircle size={22} />
          <span>PulseChat</span>
        </div>
        <div className="auth-top-actions">
          <button
            type="button"
            className={`auth-top-btn ${mode === 'login' ? 'active' : ''}`}
            onClick={() => setMode('login')}
          >
            <LogIn size={16} /> Sign In
          </button>
          <button
            type="button"
            className={`auth-top-btn ${mode === 'register' ? 'active' : ''}`}
            onClick={() => setMode('register')}
          >
            <UserPlus size={16} /> Sign Up
          </button>
        </div>
      </header>

      <div className="auth-center">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo-icon">
              <MessageCircle size={28} />
            </div>
            <h1>
              {mode === 'login' && 'Welcome back'}
              {mode === 'register' && 'Create account'}
              {mode === 'forgot' && 'Forgot password'}
              {mode === 'reset' && 'Reset password'}
            </h1>
            <p className="auth-tagline">
              <Sparkles size={14} />
              {mode === 'login' && 'Sign in to continue chatting'}
              {mode === 'register' && 'Join PulseChat today'}
              {mode === 'forgot' && 'We will send a reset token'}
              {mode === 'reset' && 'Choose a new password'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            {mode === 'register' && (
              <div className="form-group">
                <label>Display Name</label>
                <input
                  type="text"
                  placeholder="How others see you"
                  value={form.displayName}
                  onChange={update('displayName')}
                  maxLength={30}
                />
              </div>
            )}

            {(mode === 'login' || mode === 'register') && (
              <div className="form-group">
                <label>Username</label>
                <input
                  type="text"
                  placeholder="your_username"
                  value={form.username}
                  onChange={update('username')}
                  required
                  autoFocus
                  maxLength={20}
                />
              </div>
            )}

            {(mode === 'register' || mode === 'forgot') && (
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={update('email')}
                  required
                />
              </div>
            )}

            {mode === 'reset' && (
              <div className="form-group">
                <label>Reset token</label>
                <input
                  type="text"
                  value={form.resetToken}
                  onChange={update('resetToken')}
                  required
                />
              </div>
            )}

            {(mode === 'login' || mode === 'register' || mode === 'reset') && (
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  placeholder={mode === 'login' ? 'Your password' : 'Min 6 characters'}
                  value={form.password}
                  onChange={update('password')}
                  required
                  minLength={6}
                />
              </div>
            )}

            {mode === 'login' && (
              <button type="button" className="link-btn" onClick={() => setMode('forgot')}>
                <KeyRound size={14} /> Forgot password?
              </button>
            )}

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? 'Please wait...' : (
                mode === 'login' ? 'Sign In'
                  : mode === 'register' ? 'Create Account'
                    : mode === 'forgot' ? 'Send reset link'
                      : 'Update password'
              )}
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>

          {mode === 'login' && import.meta.env.VITE_GOOGLE_CLIENT_ID && (
            <div className="google-auth">
              <div className="auth-divider"><span>or</span></div>
              <div id="google-btn" />
            </div>
          )}

          {mode === 'login' && !import.meta.env.VITE_GOOGLE_CLIENT_ID && (
            <p className="form-hint center">
              Set <code>VITE_GOOGLE_CLIENT_ID</code> to enable Google Login
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
