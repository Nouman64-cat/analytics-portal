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
  LineChart,
  Line,
} from "recharts";
import { CHART_COLORS } from "@/lib/constants";

// Stable object references — inline literals cause infinite update loops with Recharts Tooltip
const TOOLTIP_STYLE = {
  backgroundColor: "#1a1d2e",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "12px",
  color: "#fff",
  fontSize: "12px",
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
} as const;

const BAR_CURSOR_STYLE = { fill: "rgba(255,255,255,0.03)" } as const;

const CANDIDATE_PALETTE = [
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#64748b", // slate
  "#ec4899", // pink
  "#10b981", // emerald
  "#3b82f6", // blue
  "#a3e635", // lime
];

// ─── Chart Card Wrapper ─────────────────────────────────────

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  headerAction?: React.ReactNode;
}

export function ChartCard({ title, subtitle, children, className, headerAction }: ChartCardProps) {
  return (
    <div className={`rounded-2xl border border-white/60 dark:border-white/[0.08] bg-white/35 dark:bg-white/[0.10] backdrop-blur-3xl shadow-[0_2px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_20px_rgba(0,0,0,0.25)] p-5 ${className ?? ""}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-500">{subtitle}</p>
          )}
        </div>
        {headerAction && <div className="shrink-0">{headerAction}</div>}
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
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={BAR_CURSOR_STYLE} />
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
        <Tooltip contentStyle={TOOLTIP_STYLE} />
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

// ─── Multi-Line Chart (one line per candidate) ──────────────

interface MultiLineChartWidgetProps {
  /** Each item has a period key plus one numeric key per series. */
  data: Array<Record<string, number | string>>;
  xKey: string;
  seriesKeys: string[];
  height?: number;
  tickFormatter?: (value: string) => string;
}

export function MultiLineChartWidget({
  data,
  xKey,
  seriesKeys,
  height = 320,
  tickFormatter,
}: MultiLineChartWidgetProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 16, left: -10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis
          dataKey={xKey}
          tick={{ fill: "#94a3b8", fontSize: 10 }}
          axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
          tickLine={false}
          angle={-35}
          textAnchor="end"
          height={80}
          interval={0}
          tickFormatter={tickFormatter}
        />
        <YAxis
          tick={{ fill: "#94a3b8", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend
          verticalAlign="top"
          height={36}
          formatter={(value: string) => (
            <span style={{ fontSize: 11, color: "#94a3b8" }}>{value}</span>
          )}
        />
        {seriesKeys.map((key, i) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={CANDIDATE_PALETTE[i % CANDIDATE_PALETTE.length]}
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 0 }}
            activeDot={{ r: 6, strokeWidth: 0 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
