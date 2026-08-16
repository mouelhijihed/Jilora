import { NavLink } from "react-router-dom";
import { FiActivity, FiBarChart2, FiBookOpen, FiBriefcase, FiCalendar, FiCheckSquare, FiCommand, FiGrid } from "react-icons/fi";
import "./Sidebar.css";

const links = [
    ["/dashboard", FiGrid, "Dashboard"],
    ["/planner", FiCalendar, "Planner"],
    ["/studies", FiBookOpen, "Studies"],
    ["/homework", FiCheckSquare, "Homework"],
    ["/internship", FiBriefcase, "Internship"],
    ["/gym", FiActivity, "Gym"],
    ["/analytics", FiBarChart2, "Analytics"],
] as const;

export function Sidebar() {
    return (
        <aside className="sidebar">
            <div className="sidebar-brand"><span className="brand-mark"><FiCommand aria-hidden="true" /></span><span>Personal Dashboard</span></div>
            <nav className="sidebar-nav" aria-label="Primary navigation">
                {links.map(([to, Icon, label]) => (
                    <NavLink key={to} to={to} className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
                        <span className="sidebar-mark" aria-hidden="true"><Icon /></span>
                        <span>{label}</span>
                    </NavLink>
                ))}
            </nav>
            <p className="sidebar-footer">Focus on what matters today.</p>
        </aside>
    );
}
