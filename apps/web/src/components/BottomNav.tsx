import type { ReactNode } from "react";

export type ViewName = "data" | "claw" | "radar" | "signal" | "account" | "login" | "register" | "admin" | "plans" | "team" | "kline-lab";

const items: Array<{ label: string; view: Extract<ViewName, "data" | "claw" | "radar" | "signal" | "account"> }> = [
  { label: "数据", view: "data" },
  { label: "ValueClaw", view: "claw" },
  { label: "信号", view: "radar" },
  { label: "告警", view: "signal" },
  { label: "我的", view: "account" }
];

function NavGlyph({ view }: { view: ViewName }): ReactNode {
  if (view === "data") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="6" y="6" width="20" height="20" rx="6" />
        <path d="M11 21v-5M16 21v-9M21 21v-6.5" />
        <path d="M10.5 22.5h11" />
      </svg>
    );
  }

  if (view === "claw") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M16 5.8 24.5 10.8v10.4L16 26.2 7.5 21.2V10.8Z" />
        <circle cx="16" cy="16" r="3.4" />
        <path d="M16 12.6V8.8M13.1 17.8 10 19.7M18.9 17.8 22 19.7" />
      </svg>
    );
  }

  if (view === "radar") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="17" r="3.2" />
        <path d="M16 20.2v5.2M10.2 25.4h11.6" />
        <path d="M9.2 17a6.8 6.8 0 0 1 13.6 0" />
        <path d="M5.5 17a10.5 10.5 0 0 1 21 0" />
      </svg>
    );
  }

  if (view === "signal") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M9 15.2c0-5.4 2.9-8.2 7-8.2s7 2.8 7 8.2v3.9l2.5 4.2h-19L9 19.1Z" />
        <path d="M13.3 26c1.5 1.4 3.9 1.4 5.4 0" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="11.5" r="4.8" />
      <path d="M7.5 25.6c2.4-6.8 14.6-6.8 17 0" />
    </svg>
  );
}

export function BottomNav({ activeView, onChange }: { activeView: ViewName; onChange: (view: ViewName) => void }) {
  return (
    <nav className="bottom-nav" aria-label="底部导航">
      {items.map((item) => (
        <button key={item.view} data-view={item.view} className={activeView === item.view ? "active" : ""} type="button" onClick={() => onChange(item.view)}>
          <span className="nav-icon"><NavGlyph view={item.view} /></span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
