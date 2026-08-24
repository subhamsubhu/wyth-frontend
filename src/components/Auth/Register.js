import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Alert, AlertDescription } from '../ui/alert';
import './luxury-auth.css';

const Register = ({ onSwitchToLogin }) => {
  const { register, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const id = 'wyth-lux-fonts';
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href =
        'https://fonts.googleapis.com/css2?family=Fraunces:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    if (password !== confirmPassword) return setLocalError('Passwords do not match');
    if (password.length < 6) return setLocalError('Password must be at least 6 characters');
    setLoading(true);
    const result = await register(email, password, displayName);
    if (!result.success) setLocalError(result.error || 'Failed to register');
    setLoading(false);
  };

  return (
    <div className="wyth-auth" data-testid="register-page">
      <div className="wyth-aurora wyth-aurora-1" aria-hidden="true" />
      <div className="wyth-aurora wyth-aurora-2" aria-hidden="true" />
      <div className="wyth-aurora wyth-aurora-3" aria-hidden="true" />
      <div className="wyth-grid" aria-hidden="true" />
      <div className="wyth-stars" aria-hidden="true" />

      <div className="wyth-shell">
        <div className="wyth-brand">
          <div className="wyth-logo">
            <span className="wyth-logo-w">W</span>
            <span className="wyth-logo-ring" aria-hidden="true" />
          </div>
          <h1 className="wyth-wordmark">WYTH</h1>
          <p className="wyth-tagline">Never Watch Alone</p>
        </div>

        <div className="wyth-card" data-testid="register-card">
          <div className="wyth-card-glow" aria-hidden="true" />
          <div className="wyth-card-inner">
            <div className="wyth-card-header">
              <p className="wyth-eyebrow">Create Account</p>
              <h2 className="wyth-title">
                Join <span className="wyth-title-accent">WYTH</span>
              </h2>
              <p className="wyth-subtitle">Join the WYTH experience — Never Watch Alone.</p>
            </div>

            <form onSubmit={handleSubmit} className="wyth-form">
              {(localError || error) && (
                <Alert variant="destructive" className="wyth-alert">
                  <AlertDescription>{localError || error}</AlertDescription>
                </Alert>
              )}

              <div className="wyth-field">
                <Label htmlFor="displayName" className="wyth-label">Display Name</Label>
                <div className="wyth-input-wrap">
                  <Input
                    id="displayName"
                    type="text"
                    placeholder="John Doe"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="wyth-input"
                    data-testid="register-name-input"
                    autoComplete="nickname"
                  />
                </div>
              </div>

              <div className="wyth-field">
                <Label htmlFor="email" className="wyth-label">Email</Label>
                <div className="wyth-input-wrap">
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="wyth-input"
                    data-testid="register-email-input"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="wyth-row">
                <div className="wyth-field">
                  <Label htmlFor="password" className="wyth-label">Password</Label>
                  <div className="wyth-input-wrap">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="wyth-input wyth-input-with-action"
                      data-testid="register-password-input"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="wyth-input-action"
                      onClick={() => setShowPassword((s) => !s)}
                      data-testid="register-toggle-password"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <div className="wyth-field">
                  <Label htmlFor="confirmPassword" className="wyth-label">Confirm</Label>
                  <div className="wyth-input-wrap">
                    <Input
                      id="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className="wyth-input"
                      data-testid="register-confirm-password-input"
                      autoComplete="new-password"
                    />
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="wyth-button"
                data-testid="register-submit-button"
              >
                <span className="wyth-button-shine" aria-hidden="true" />
                <span className="wyth-button-label">
                  {loading ? 'Creating account…' : 'Sign Up'}
                </span>
                
              </Button>
            </form>

            <div className="wyth-divider" aria-hidden="true"><span>◆</span></div>

            <div className="wyth-switch">
              Already have an account?{' '}
              <button
                type="button"
                onClick={onSwitchToLogin}
                className="wyth-link"
                data-testid="switch-to-login-button"
              >
                Sign in
              </button>
            </div>
          </div>
        </div>

        <p className="wyth-footnote">End-to-end encrypted • Invitation cinema</p>
      </div>
    </div>
  );
};

export default Register;
