import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowRight, UserPlus, LogIn, KeyRound, Eye, EyeOff,
  Mail, AlertCircle, Loader2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../services/api';
import BrandMark, { BrandIcon } from '../ui/BrandMark';

const GOOGLE_CLIENT_ID = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.1 26.8 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.3 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l.1.1 6.2 5.2C39.2 37.3 44 33 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}

function PasswordField({
  label, value, onChange, placeholder, show, onToggle, autoFocus = false,
}) {
  return (
    <div className="form-group">
      <label>{label}</label>
      <div className="password-input-wrap">
        <input
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required
          minLength={6}
          autoFocus={autoFocus}
        />
        <button
          type="button"
          className="password-toggle-btn"
          onClick={onToggle}
          aria-label={show ? 'Hide password' : 'Show password'}
          tabIndex={-1}
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}

export default function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [forgotSentEmail, setForgotSentEmail] = useState('');
  const [demoResetUrl, setDemoResetUrl] = useState(null);
  const [resetChecking, setResetChecking] = useState(false);
  const [resetTokenValid, setResetTokenValid] = useState(false);
  const [resetEmailHint, setResetEmailHint] = useState('');
  const [resetTokenError, setResetTokenError] = useState('');
  const { login, register, googleLogin } = useAuth();
  const { addToast } = useToast();
  const tokenClientRef = useRef(null);

  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    displayName: '',
    resetToken: '',
  });

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const validateResetLink = useCallback(async (token) => {
    setResetChecking(true);
    setResetTokenValid(false);
    setResetTokenError('');
    try {
      const data = await api.verifyResetToken(token);
      setResetTokenValid(true);
      setResetEmailHint(data.email || '');
    } catch (err) {
      setResetTokenValid(false);
      setResetTokenError(err.message || 'This reset link is invalid or has expired');
    } finally {
      setResetChecking(false);
    }
  }, []);

  // Open reset screen from email link: /?mode=reset&token=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlMode = params.get('mode');
    const token = params.get('token');
    if (urlMode === 'reset' && token) {
      setMode('reset');
      setForm((f) => ({ ...f, resetToken: token, password: '', confirmPassword: '' }));
      window.history.replaceState({}, '', window.location.pathname);
      validateResetLink(token);
    }
  }, [validateResetLink]);

  useEffect(() => {
    setShowPassword(false);
    setShowConfirmPassword(false);
  }, [mode]);

  const finishGoogle = useCallback(async (payload) => {
    try {
      setLoading(true);
      await googleLogin(payload);
      addToast('Signed in with Google', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [googleLogin, addToast]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return undefined;
    if (mode !== 'login' && mode !== 'register') return undefined;

    let cancelled = false;

    const setup = () => {
      if (cancelled || !window.google?.accounts?.oauth2) return;

      try {
        tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: 'openid email profile',
          callback: async (tokenResponse) => {
            if (tokenResponse.access_token) {
              await finishGoogle({ accessToken: tokenResponse.access_token });
            } else if (tokenResponse.error) {
              addToast(tokenResponse.error_description || 'Google sign-in failed', 'error');
            }
          },
        });
        setGoogleReady(true);
      } catch (err) {
        console.warn('Google setup failed:', err);
        addToast('Google Sign-In failed to initialize', 'error');
      }
    };

    if (window.google?.accounts?.oauth2) {
      setup();
      return () => { cancelled = true; };
    }

    const existing = document.querySelector('script[data-pulsechat-google]');
    if (existing) {
      if (window.google?.accounts) setup();
      else existing.addEventListener('load', setup);
      return () => {
        cancelled = true;
        existing.removeEventListener('load', setup);
      };
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.pulsechatGoogle = '1';
    script.onload = setup;
    script.onerror = () => addToast('Failed to load Google Sign-In script', 'error');
    document.head.appendChild(script);

    return () => { cancelled = true; };
  }, [mode, finishGoogle, addToast]);

  const handleGoogleClick = () => {
    if (!GOOGLE_CLIENT_ID) {
      addToast('Google Client ID is missing in frontend/.env', 'error');
      return;
    }
    if (tokenClientRef.current) {
      tokenClientRef.current.requestAccessToken({ prompt: 'consent' });
      return;
    }
    addToast('Google is still loading… try again in 1–2 seconds', 'info');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(form.username, form.password);
        addToast('Welcome back!', 'success');
      } else if (mode === 'register') {
        await register(form);
        addToast('Account created successfully!', 'success');
      } else if (mode === 'forgot') {
        const data = await api.forgotPassword(form.email);
        setForgotSentEmail(form.email);
        setDemoResetUrl(data.emailed ? null : (data.resetUrl || null));
        setMode('forgot-sent');
        if (data.emailed) {
          addToast('Reset link sent — check your email', 'success');
        }
      } else if (mode === 'reset') {
        if (!form.resetToken) {
          addToast('Reset link is missing. Request a new one from your email.', 'error');
          return;
        }
        if (form.password !== form.confirmPassword) {
          addToast('Passwords do not match', 'error');
          return;
        }
        await api.resetPassword({ token: form.resetToken, password: form.password });
        addToast('Password updated. Please sign in.', 'success');
        setMode('login');
        setForm((f) => ({
          ...f,
          password: '',
          confirmPassword: '',
          resetToken: '',
        }));
        setResetTokenValid(false);
        setResetEmailHint('');
      }
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const showGoogle = mode === 'login' || mode === 'register';
  const isAuthTab = mode === 'login' || mode === 'register';

  return (
    <div className="auth-screen">
      <div className="auth-bg">
        <div className="auth-orb auth-orb-1" />
        <div className="auth-orb auth-orb-2" />
        <div className="auth-orb auth-orb-3" />
      </div>

      <header className="auth-top-bar">
        <BrandMark size="md" />
        <div className="auth-top-actions">
          <button
            type="button"
            className={`auth-top-btn ${isAuthTab || mode === 'forgot' || mode === 'forgot-sent' || mode === 'reset' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setDemoResetUrl(null); }}
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
        <div className="auth-card professional">
          <div className="auth-logo">
            <div className="auth-logo-icon">
              <BrandIcon size={56} />
            </div>
            <h1>
              {mode === 'login' && 'Welcome back'}
              {mode === 'register' && 'Create your account'}
              {mode === 'forgot' && 'Forgot password'}
              {mode === 'forgot-sent' && 'Check your email'}
              {mode === 'reset' && 'Create new password'}
            </h1>
          </div>

          {mode === 'forgot-sent' && (
            <div className="auth-forgot-sent">
              <div className="auth-forgot-sent-icon">
                <Mail size={28} />
              </div>
              <p>
                If an account exists for <strong>{forgotSentEmail}</strong>, we sent a password reset link.
                The link expires in 1 hour.
              </p>
              <ul>
                <li>Check your inbox and spam folder</li>
                <li>Click <strong>Reset password</strong> in the email</li>
                <li>Choose a new password on the page that opens</li>
              </ul>
              {demoResetUrl && (
                <div className="auth-demo-link">
                  <p><strong>Demo mode:</strong> SMTP is not configured, so no email was sent. Use this link locally:</p>
                  <a href={demoResetUrl}>{demoResetUrl}</a>
                </div>
              )}
              <button type="button" className="auth-submit" onClick={() => setMode('login')}>
                Back to Sign In
              </button>
            </div>
          )}

          {mode === 'reset' && resetChecking && (
            <div className="auth-reset-status checking">
              <Loader2 size={22} className="spin-icon" />
              <span>Verifying your reset link…</span>
            </div>
          )}

          {mode === 'reset' && !resetChecking && !resetTokenValid && (
            <div className="auth-reset-status invalid">
              <AlertCircle size={22} />
              <p>{resetTokenError || 'This reset link is invalid or has expired.'}</p>
              <button type="button" className="auth-submit" onClick={() => setMode('forgot')}>
                Request a new reset link
              </button>
            </div>
          )}

          {mode !== 'forgot-sent' && !(mode === 'reset' && (resetChecking || !resetTokenValid)) && (
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
                    autoFocus={mode === 'login'}
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
                    autoFocus={mode === 'forgot'}
                  />
                </div>
              )}

              {(mode === 'login' || mode === 'register') && (
                <PasswordField
                  label="Password"
                  value={form.password}
                  onChange={update('password')}
                  placeholder={mode === 'login' ? 'Your password' : 'Min 6 characters'}
                  show={showPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                />
              )}

              {mode === 'reset' && resetTokenValid && (
                <>
                  <PasswordField
                    label="New password"
                    value={form.password}
                    onChange={update('password')}
                    placeholder="Min 6 characters"
                    show={showPassword}
                    onToggle={() => setShowPassword((v) => !v)}
                    autoFocus
                  />
                  <PasswordField
                    label="Confirm new password"
                    value={form.confirmPassword}
                    onChange={update('confirmPassword')}
                    placeholder="Re-enter your password"
                    show={showConfirmPassword}
                    onToggle={() => setShowConfirmPassword((v) => !v)}
                  />
                </>
              )}

              {mode === 'login' && (
                <button type="button" className="link-btn" onClick={() => setMode('forgot')}>
                  <KeyRound size={14} /> Forgot password?
                </button>
              )}

              {mode === 'forgot' && (
                <button type="button" className="link-btn" onClick={() => setMode('login')}>
                  Back to Sign In
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
          )}

          {showGoogle && (
            <div className="google-auth">
              <div className="auth-divider"><span>or</span></div>
              <button
                type="button"
                className="google-fallback-btn"
                onClick={handleGoogleClick}
                disabled={loading}
              >
                <GoogleIcon />
                {mode === 'register' ? 'Sign up with Google' : 'Continue with Google'}
                {!googleReady && <span className="google-loading-dot" />}
              </button>
              
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
