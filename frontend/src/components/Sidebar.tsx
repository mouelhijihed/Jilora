import { NavLink, useNavigate } from "react-router-dom";
import { FiActivity, FiBarChart2, FiBookOpen, FiBriefcase, FiCalendar, FiCheckSquare, FiCommand, FiGrid, FiLogOut, FiUser, FiUsers } from "react-icons/fi";
import { useAuth } from "../hooks/useAuth";
import "./Sidebar.css";

export function Sidebar(){
    const{user,logout}=useAuth();const navigate=useNavigate();if(!user)return null;
    const links=[{to:"/dashboard",Icon:FiGrid,label:"Dashboard",show:true},{to:"/planner",Icon:FiCalendar,label:"Planner",show:true},{to:"/studies",Icon:FiBookOpen,label:"Studies",show:user.preferences.student},{to:"/homework",Icon:FiCheckSquare,label:"Homework",show:user.preferences.student},{to:"/job",Icon:FiBriefcase,label:"Part-Time Job",show:user.preferences.partTimeJob},{to:"/gym",Icon:FiActivity,label:"Workouts",show:user.preferences.gym},{to:"/partner",Icon:FiUsers,label:"Partner",show:true},{to:"/analytics",Icon:FiBarChart2,label:"Analytics",show:true},{to:"/profile",Icon:FiUser,label:"Profile",show:true}];
    async function signOut(){await logout();navigate("/login",{replace:true});}
    return <aside className="sidebar"><div className="sidebar-brand"><span className="brand-mark"><FiCommand aria-hidden="true"/></span><span>Jilora</span></div><nav className="sidebar-nav" aria-label="Primary navigation">{links.filter((link)=>link.show).map(({to,Icon,label})=><NavLink key={to} to={to} className={({isActive})=>`sidebar-link ${isActive?"active":""}`}><span className="sidebar-mark" aria-hidden="true"><Icon/></span><span>{label}</span></NavLink>)}</nav><div className="sidebar-account"><strong>{user.firstName} {user.lastName}</strong><span>{user.email}</span><button className="sidebar-logout" type="button" onClick={()=>void signOut()} title="Log out"><FiLogOut aria-hidden="true"/><span>Log out</span></button></div></aside>;
}
