"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { CHART_COLORS } from "@/lib/constants";

// ─── Chart Card Wrapper ─────────────────────────────────────

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function ChartCard({ title, subtitle, children }: ChartCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
        {subtitle && (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-500">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}

// ─── Bar Chart ──────────────────────────────────────────────

interface BarChartWidgetProps {
  data: { name: string; value: number }[];
  color?: string;
  height?: number;
}

export function BarChartWidget({ data, color = "#6366f1", height = 300 }: BarChartWidgetProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis
          dataKey="name"
          tick={{ fill: "#94a3b8", fontSize: 11 }}
          axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
          tickLine={false}
          angle={-35}
          textAnchor="end"
          height={80}
          interval={0}
        />
        <YAxis
          tick={{ fill: "#94a3b8", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1a1d2e",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
            color: "#fff",
            fontSize: "12px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}
          cursor={{ fill: "rgba(255,255,255,0.03)" }}
        />
        <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Donut / Pie Chart ──────────────────────────────────────

interface PieChartWidgetProps {
  data: { name: string; value: number }[];
  height?: number;
  colorMapping?: Record<string, string>;
}

export function PieChartWidget({ data, height = 300, colorMapping }: PieChartWidgetProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={3}
          dataKey="value"
          stroke="none"
        >
          {data.map((entry, index) => {
            const sliceColor = colorMapping && colorMapping[entry.name] 
              ? colorMapping[entry.name] 
              : CHART_COLORS[index % CHART_COLORS.length];
            return <Cell key={index} fill={sliceColor} />;
          })}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: "#1a1d2e",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
            color: "#fff",
            fontSize: "12px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}
        />
        <Legend
          verticalAlign="bottom"
          height={36}
          formatter={(value: string) => (
            <span className="text-[11px] text-slate-600 dark:text-slate-400">{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
