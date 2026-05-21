"use client";

import { useEffect, useState } from "react";
import { ConfigProvider, DatePicker, theme as antTheme } from "antd";
import type { RangePickerProps } from "antd/es/date-picker";
import dayjs, { Dayjs } from "dayjs";
import { getAccentHex } from "@/lib/accent";

const { RangePicker } = DatePicker;

interface DateRangeFilterProps {
  from: string;   // ISO "YYYY-MM-DD" or ""
  to: string;     // ISO "YYYY-MM-DD" or ""
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onClear: () => void;
  className?: string;
}

export default function DateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
  onClear,
  className = "",
}: DateRangeFilterProps) {
  const [isDark, setIsDark] = useState(false);
  const [accentHex, setAccentHex] = useState("#6366f1");

  useEffect(() => {
    const checkDark = () => setIsDark(document.documentElement.classList.contains("dark"));
    const checkAccent = () => setAccentHex(getAccentHex());
    checkDark();
    checkAccent();
    const observer = new MutationObserver(() => { checkDark(); checkAccent(); });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-accent"] });
    const onAccentChange = () => checkAccent();
    window.addEventListener("accent-changed", onAccentChange);
    return () => { observer.disconnect(); window.removeEventListener("accent-changed", onAccentChange); };
  }, []);

  const value: RangePickerProps["value"] = [
    from ? dayjs(from) : null,
    to   ? dayjs(to)   : null,
  ];

  const handleChange: RangePickerProps["onChange"] = (dates) => {
    if (!dates) {
      onClear();
      return;
    }
    const [start, end] = dates as [Dayjs | null, Dayjs | null];
    onFromChange(start ? start.format("YYYY-MM-DD") : "");
    onToChange(end   ? end.format("YYYY-MM-DD")   : "");
  };

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
        token: {
          colorPrimary: accentHex,
          colorBgContainer: isDark ? "#12141c" : "#ffffff",
          colorBorder: isDark ? "rgba(255,255,255,0.08)" : "#e2e8f0",
          colorBorderSecondary: isDark ? "rgba(255,255,255,0.06)" : "#e2e8f0",
          borderRadius: 12,
          fontSize: 12,
          fontFamily: "inherit",
        },
        components: {
          DatePicker: {
            colorBgContainer: isDark ? "#12141c" : "#ffffff",
            colorBgElevated: isDark ? "#1a1d2e" : "#ffffff",
            colorText: isDark ? "#cbd5e1" : "#334155",
            colorTextPlaceholder: isDark ? "#475569" : "#94a3b8",
            colorBorder: isDark ? "rgba(255,255,255,0.08)" : "#e2e8f0",
            activeBorderColor: accentHex,
            hoverBorderColor: isDark ? "rgba(255,255,255,0.14)" : "#cbd5e1",
          },
        },
      }}
    >
      <RangePicker
        value={value}
        onChange={handleChange}
        format="MMM D, YYYY"
        placeholder={["From date", "To date"]}
        allowClear
        className={className}
        style={{ borderRadius: 10, height: 36 }}
        popupStyle={{ zIndex: 9999 }}
      />
    </ConfigProvider>
  );
}
