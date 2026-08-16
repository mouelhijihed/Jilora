import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { PlannerProvider } from "./hooks/usePlanner";
import { ProductivityProvider } from "./hooks/useProductivity";
import { SessionsProvider } from "./hooks/useSessions";

const Dashboard = lazy(() => import("./pages/Dashboard").then((module) => ({ default: module.Dashboard })));
const Planner = lazy(() => import("./pages/Planner").then((module) => ({ default: module.Planner })));
const Studies = lazy(() => import("./pages/Studies").then((module) => ({ default: module.Studies })));
const Homework = lazy(() => import("./pages/Homework").then((module) => ({ default: module.Homework })));
const Internship = lazy(() => import("./pages/Internship").then((module) => ({ default: module.Internship })));
const Gym = lazy(() => import("./pages/Gym").then((module) => ({ default: module.Gym })));
const Analytics = lazy(() => import("./pages/Analytics").then((module) => ({ default: module.Analytics })));

export function App() {
    return (
        <BrowserRouter>
            <PlannerProvider>
                <SessionsProvider>
                    <ProductivityProvider>
                        <Sidebar />
                        <Suspense fallback={<div className="page-loading">Loading page...</div>}>
                            <Routes>
                                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                                <Route path="/dashboard" element={<Dashboard />} />
                                <Route path="/planner" element={<Planner />} />
                                <Route path="/studies" element={<Studies />} />
                                <Route path="/homework" element={<Homework />} />
                                <Route path="/internship" element={<Internship />} />
                                <Route path="/gym" element={<Gym />} />
                                <Route path="/analytics" element={<Analytics />} />
                                <Route path="*" element={<Navigate to="/dashboard" replace />} />
                            </Routes>
                        </Suspense>
                    </ProductivityProvider>
                </SessionsProvider>
            </PlannerProvider>
        </BrowserRouter>
    );
}
