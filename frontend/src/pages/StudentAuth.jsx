import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { systemAPI } from '../services/api';
import { saveSession } from '../services/session';

export default function StudentAuth() {
  const [registering, setRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = registering
        ? await systemAPI.registerStudent(email.trim(), password)
        : await systemAPI.login(email.trim(), password);
      if (response.role !== 'student') throw new Error('Student account required');
      saveSession(response);
      navigate('/profile');
    } catch (err) {
      setError(err.response?.data?.error === 'profile_claim_required'
        ? 'This email has an older profile. Ask an administrator to verify and link it before signing up.'
        : err.response?.data?.error || err.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  }

  return <main className="min-h-screen flex items-center justify-center bg-background px-4 text-text-primary">
    <section className="w-full max-w-md rounded-2xl border border-border bg-surface p-8">
      <h1 className="text-2xl font-bold">{registering ? 'Create student account' : 'Student sign in'}</h1>
      <p className="mt-2 text-sm text-text-secondary">Your account keeps your profile and recommendations private.</p>
      {error && <p role="alert" className="mt-5 rounded-lg bg-error-muted p-3 text-sm text-error">{error}</p>}
      <form onSubmit={submit} className="mt-7 space-y-5">
        <div>
          <label htmlFor="student-email" className="block text-sm font-medium mb-2">Email</label>
          <input id="student-email" type="email" autoComplete="email" required maxLength={254}
            value={email} onChange={event => setEmail(event.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-4 py-3" />
        </div>
        <div>
          <label htmlFor="student-password" className="block text-sm font-medium mb-2">Password</label>
          <input id="student-password" type="password" autoComplete={registering ? 'new-password' : 'current-password'}
            required minLength={registering ? 12 : undefined} value={password} onChange={event => setPassword(event.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-4 py-3" />
        </div>
        <button type="submit" disabled={loading} className="w-full rounded-full bg-primary py-3 font-medium text-white disabled:opacity-50">
          {loading ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}
        </button>
      </form>
      <button type="button" onClick={() => { setRegistering(!registering); setError(''); }}
        className="mt-6 text-sm font-medium text-primary">
        {registering ? 'Already have an account? Sign in' : 'New student? Create an account'}
      </button>
      <p className="mt-6 text-sm"><Link to="/" className="text-primary">← Back to Home</Link></p>
    </section>
  </main>;
}
