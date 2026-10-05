import React, { createContext, useContext, useState, useEffect } from "react";
import Cookies from "js-cookie";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize auth state from cookies on mount
  useEffect(() => {
    const initializeAuth = async () => {
      const savedToken = Cookies.get("token");
      
      if (savedToken && savedToken !== "undefined" && savedToken !== "null") {
        setToken(savedToken);
        try {
          // Fetch fresh user data from API to get populated fields (department, designation)
          const response = await fetch(`${import.meta.env.VITE_API_URL}auth/me`, {
            headers: { Authorization: `Bearer ${savedToken}` },
          });
          
          if (response.ok) {
            const data = await response.json();
            setUser(data.data);
            Cookies.set("user", JSON.stringify(data.data), { expires: 1 });
          } else {
            // If token is invalid, clear it
            logout();
          }
        } catch (e) {
          console.error("Failed to fetch user profile", e);
          // Fallback to cookie if API fails (e.g., network error)
          const savedUser = Cookies.get("user");
          if (savedUser) setUser(JSON.parse(savedUser));
        }
      }
      setIsLoading(false);
    };

    initializeAuth();
  }, []);

  const login = (userData, authToken) => {
    setUser(userData);
    setToken(authToken);
    Cookies.set("token", authToken, { expires: 1 });
    Cookies.set("user", JSON.stringify(userData), { expires: 1 });
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    Cookies.remove("token");
    Cookies.remove("user");
  };

  const hasRole = (roles) => {
    if (!user) return false;
    if (!roles || roles.length === 0) return true;
    return roles.includes(user.userType) || (user.role && roles.includes(user.role));
  };

  const hasPermission = (permissions) => {
    if (!user) return false;
    if (user.userType === "ADMIN") return true;
    if (!permissions || permissions.length === 0) return true;
    const permList = Array.isArray(permissions) ? permissions : [permissions];
    const granted = user.permissions || [];
    if (granted.length > 0) return permList.some((p) => granted.includes(p));
    const roleKey = String(user.role || "").toUpperCase().replace(/[\s_-]+/g, "");
    const customerPerms = ["VIEW_CUSTOMERS", "CREATE_CUSTOMERS", "EDIT_CUSTOMERS", "DELETE_CUSTOMERS", "PLACE_ORDERS", "VIEW_ORDERS", "VIEW_REVENUE", "FOLLOW_UP_LEADS"];
    if (roleKey === "FIELDEXECUTIVE" && permList.every((p) => customerPerms.includes(p))) return true;
    if (!user.permissions) return false;
    return permList.some((p) => user.permissions.includes(p));
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, hasRole, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
