import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import "./Auth.css";

export function Login() {
    const { user, login } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
    if (user) return <Navigate to={user.onboardingCompleted ? "/dashboard" : "/onboarding"} replace />;
    async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); setError(""); try { const next = await login(email, password); navigate(next.onboardingCompleted ? "/dashboard" : "/onboarding", { replace: true }); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not log in"); } finally { setSaving(false); } }
    return <main className="auth-page"><section className="auth-panel"><header className="auth-heading"><p className="eyebrow">Jilora</p><h1>Log in</h1><p>Continue with your saved workspace.</p></header><form className="auth-form" onSubmit={submit}><label><span className="field-label">Email</span><input className="text-input" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label><span className="field-label">Password</span><input className="text-input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="auth-actions"><Link className="auth-link" to="/register">Create an account</Link><button className="primary-button" disabled={saving} type="submit">{saving ? "Logging in..." : "Log in"}</button></div></form></section></main>;
}
