import { navigationData } from "../../data/mockData";
import { useAuth } from "../../context/AuthContext";

export function useVisibleNav() {
  const { hasRole, hasPermission } = useAuth();

  return navigationData
    .map((group) => {
      const items = group.items.flatMap((item) => {
        if (item.allowedRoles && !hasRole(item.allowedRoles)) return [];
        if (item.children?.length) {
          const children = item.children.filter((child) => !child.permissionsNeeded || hasPermission(child.permissionsNeeded));
          return children.length ? [{ ...item, children }] : [];
        }
        if (item.permissionsNeeded && !hasPermission(item.permissionsNeeded)) return [];
        return [item];
      });
      return { ...group, items };
    })
    .filter((group) => group.items.length > 0);
}
