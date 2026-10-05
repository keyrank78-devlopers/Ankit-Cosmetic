import { Bell, Menu, LogOut, ChevronDown, UserRound, PanelLeft, PanelTop } from "lucide-react";
import { Button } from "../ui/Button";
import { cn } from "../../utils/cn";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { TopNav } from "./TopNav";

export function Header({ setMobileMenuOpen, isMobile, navLayout = "sidebar", onToggleLayout }) {
  const { user, logout, token } = useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      if (token) {
        await axios.post(
          `${import.meta.env.VITE_API_URL}auth/logout`,
          {},
          {
            headers: { Authorization: `Bearer ${token}` },
            withCredentials: true,
          }
        );
      }
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      logout();
      navigate("/");
    }
  };
  
  const navbar = navLayout === "navbar" && !isMobile;

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-x-3 border-b border-slate-200 bg-white/80 px-4 shadow-sm backdrop-blur-md sm:gap-x-4 sm:px-6 lg:px-8">
      {isMobile && (
        <button
          type="button"
          className="-m-2.5 p-2.5 text-slate-700 lg:hidden"
          onClick={() => setMobileMenuOpen(true)}
        >
          <span className="sr-only">Open sidebar</span>
          <Menu className="h-6 w-6" aria-hidden="true" />
        </button>
      )}

      {isMobile && <div className="h-6 w-px bg-slate-200 lg:hidden" aria-hidden="true" />}

      {navbar && <span className="shrink-0 text-lg font-bold text-slate-900">AK Techs</span>}
      {navbar && <TopNav />}

      <div className={cn("flex items-center gap-x-4 self-stretch lg:gap-x-6", navbar ? "shrink-0" : "flex-1 justify-end")}>
        <div className="flex items-center gap-x-2 lg:gap-x-4">
          {!isMobile && (
            <button
              type="button"
              onClick={onToggleLayout}
              title={navbar ? "Switch to sidebar" : "Switch to top menu"}
              aria-label={navbar ? "Switch to sidebar" : "Switch to top menu"}
              className="rounded-md p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              {navbar ? <PanelLeft className="h-5 w-5" /> : <PanelTop className="h-5 w-5" />}
            </button>
          )}
          <Button variant="ghost" size="icon" className="text-slate-500 rounded-full">
            <span className="sr-only">View notifications</span>
            <Bell className="h-5 w-5" aria-hidden="true" />
          </Button>

          {/* Separator */}
          <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-slate-200" aria-hidden="true" />

          {/* Profile dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              className="-m-1.5 flex items-center p-1.5 hover:bg-slate-50 rounded-md transition-colors"
              id="user-menu-button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              <span className="sr-only">Open user menu</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 font-bold text-white shadow-sm">
                {user?.name?.charAt(0).toUpperCase() || "U"}
              </div>
              <span className="hidden lg:flex lg:flex-col lg:items-start lg:ml-4">
                <span className="text-sm font-semibold leading-6 text-slate-900" aria-hidden="true">
                  {user?.name || "User"}
                </span>
                <span className="text-xs leading-4 text-slate-500" aria-hidden="true">
                  {user?.role || user?.userType || "Guest"}
                </span>
              </span>
              <ChevronDown className="ml-2 h-4 w-4 text-slate-400 hidden lg:block" />
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 z-10 mt-2.5 w-64 origin-top-right rounded-md bg-white py-2 shadow-lg ring-1 ring-slate-900/5 focus:outline-none">
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="text-sm font-medium text-slate-900 truncate">{user?.name}</p>
                  <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                </div>
                
                <div className="px-4 py-2 text-xs text-slate-700 border-b border-slate-100">
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Role:</span>
                    <span className="font-medium text-right">{user?.role || user?.userType}</span>
                  </div>
                  {user?.department?.name && (
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Department:</span>
                      <span className="font-medium text-right">{user.department.name}</span>
                    </div>
                  )}
                  {user?.designation?.name && (
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Designation:</span>
                      <span className="font-medium text-right">{user.designation.name}</span>
                    </div>
                  )}
                </div>

                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      navigate("/dashboard/profile");
                    }}
                    className="flex w-full items-center px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <UserRound className="mr-2 h-4 w-4" />
                    My profile
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
