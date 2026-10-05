import { Card, CardContent } from "../ui/Card";
import { cn } from "../../utils/cn";

export function StatCard({ title, value, icon: Icon, trend, trendValue }) {
  const isPositive = trend === "up";
  
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
            <Icon className="h-5 w-5 text-indigo-600" />
          </div>
        </div>
        <div className="mt-4">
          <h3 className="text-2xl font-semibold text-slate-900">{value}</h3>
          <div className="mt-1 flex items-center text-sm">
            <span
              className={cn(
                "font-medium",
                isPositive ? "text-indigo-600" : "text-red-600"
              )}
            >
              {isPositive ? "+" : "-"}{trendValue}
            </span>
            <span className="ml-2 text-slate-500">from last month</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
