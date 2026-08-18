import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../hooks/useTheme";
import type { UserPreferences } from "../types/auth";
import "./Auth.css";
import "./Tracking.css";

export function Profile(){
    const{user,updateProfile}=useAuth();
    const { theme, setTheme } = useTheme();
    const[firstName,setFirstName]=useState(user?.firstName||"");const[lastName,setLastName]=useState(user?.lastName||"");const[prefs,setPrefs]=useState<UserPreferences>(user?.preferences||{student:false,gym:false,partTimeJob:false});const[error,setError]=useState("");const[saved,setSaved]=useState(false);const[saving,setSaving]=useState(false);
    if(!user)return null;
    async function submit(event:FormEvent){event.preventDefault();setError("");setSaved(false);if(!prefs.student&&!prefs.gym&&!prefs.partTimeJob){setError("Keep at least one dashboard feature enabled");return;}setSaving(true);try{await updateProfile(firstName,lastName,prefs);setSaved(true);}catch(requestError){setError(requestError instanceof Error?requestError.message:"Could not update profile");}finally{setSaving(false);}}
    return <main className="page-shell"><header className="tracking-header"><div><p className="eyebrow">Account</p><h1>Profile</h1><p>{user.email}</p></div></header><form className="tracking-card auth-form" onSubmit={submit}><div className="auth-grid"><label><span className="field-label">First name</span><input className="text-input" value={firstName} onChange={(event)=>setFirstName(event.target.value)} required/></label><label><span className="field-label">Last name</span><input className="text-input" value={lastName} onChange={(event)=>setLastName(event.target.value)} required/></label></div><div><span className="field-label">Dashboard features</span><div className="feature-options">{([["student","Studies"],["gym","Workouts"],["partTimeJob","Part-Time Job"]] as const).map(([key,label])=><label className={`feature-option ${prefs[key]?"selected":""}`} key={key}><input type="checkbox" checked={prefs[key]} onChange={()=>setPrefs((current)=>({...current,[key]:!current[key]}))}/><strong>{label}</strong></label>)}</div></div>{saved&&<div className="notice">Profile updated.</div>}{error&&<div className="notice notice-error">{error}</div>}<div><button className="primary-button" disabled={saving} type="submit">{saving?"Saving...":"Save profile"}</button></div></form><section className="tracking-card settings-section"><div className="section-header"><div><p className="eyebrow">Appearance</p><h2>Theme</h2></div></div><label><span className="field-label">Color mode</span><select className="select-input" value={theme} onChange={(event)=>setTheme(event.target.value as typeof theme)}><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></label></section></main>;
}
