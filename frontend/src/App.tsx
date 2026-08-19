import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { PlannerProvider } from "./hooks/usePlanner";
import { PomodoroAudioProvider } from "./hooks/usePomodoroAudio";
import { ProductivityProvider } from "./hooks/useProductivity";
import { SessionsProvider } from "./hooks/useSessions";
import { RealtimeProvider } from "./hooks/useRealtime";
import { ThemeProvider } from "./hooks/useTheme";
import type { UserPreferences } from "./types/auth";

const Dashboard=lazy(()=>import("./pages/Dashboard").then((module)=>({default:module.Dashboard})));
const Planner=lazy(()=>import("./pages/Planner").then((module)=>({default:module.Planner})));
const Studies=lazy(()=>import("./pages/Studies").then((module)=>({default:module.Studies})));
const Homework=lazy(()=>import("./pages/Homework").then((module)=>({default:module.Homework})));
const Job=lazy(()=>import("./pages/Job").then((module)=>({default:module.Job})));
const Gym=lazy(()=>import("./pages/Gym").then((module)=>({default:module.Gym})));
const Analytics=lazy(()=>import("./pages/Analytics").then((module)=>({default:module.Analytics})));
const Login=lazy(()=>import("./pages/Login").then((module)=>({default:module.Login})));
const Register=lazy(()=>import("./pages/Register").then((module)=>({default:module.Register})));
const Onboarding=lazy(()=>import("./pages/Onboarding").then((module)=>({default:module.Onboarding})));
const Profile=lazy(()=>import("./pages/Profile").then((module)=>({default:module.Profile})));
const Partner=lazy(()=>import("./pages/Partner").then((module)=>({default:module.Partner})));

function Loading(){return <div className="page-loading auth-loading">Loading...</div>;}
function RequireAuthentication({children,onboarding=false}:{children:ReactNode;onboarding?:boolean}){const{user,loading}=useAuth();if(loading)return <Loading/>;if(!user)return <Navigate to="/login" replace/>;if(!onboarding&&!user.onboardingCompleted)return <Navigate to="/onboarding" replace/>;return children;}
function FeatureRoute({feature,children}:{feature:keyof UserPreferences;children:ReactNode}){const{user}=useAuth();return user?.preferences[feature]?children:<Navigate to="/dashboard" replace/>;}
function ApplicationLayout(){return <PlannerProvider><SessionsProvider><ProductivityProvider><PomodoroAudioProvider><Sidebar/><Suspense fallback={<Loading/>}><Outlet/></Suspense></PomodoroAudioProvider></ProductivityProvider></SessionsProvider></PlannerProvider>;}

export function App(){return <ThemeProvider><AuthProvider><RealtimeProvider><BrowserRouter><Suspense fallback={<Loading/>}><Routes><Route path="/login" element={<Login/>}/><Route path="/register" element={<Register/>}/><Route path="/onboarding" element={<RequireAuthentication onboarding><Onboarding/></RequireAuthentication>}/><Route element={<RequireAuthentication><ApplicationLayout/></RequireAuthentication>}><Route index element={<Navigate to="/dashboard" replace/>}/><Route path="/dashboard" element={<Dashboard/>}/><Route path="/planner" element={<Planner/>}/><Route path="/studies" element={<FeatureRoute feature="student"><Studies/></FeatureRoute>}/><Route path="/homework" element={<FeatureRoute feature="student"><Homework/></FeatureRoute>}/><Route path="/job" element={<FeatureRoute feature="partTimeJob"><Job/></FeatureRoute>}/><Route path="/gym" element={<FeatureRoute feature="gym"><Gym/></FeatureRoute>}/><Route path="/partner" element={<Partner/>}/><Route path="/analytics" element={<Analytics/>}/><Route path="/profile" element={<Profile/>}/></Route><Route path="*" element={<Navigate to="/dashboard" replace/>}/></Routes></Suspense></BrowserRouter></RealtimeProvider></AuthProvider></ThemeProvider>;}
