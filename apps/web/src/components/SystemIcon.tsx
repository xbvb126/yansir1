export function SystemIcon({ name }: { name: string }) {
  const common = { className: "system-icon", viewBox: "0 0 24 24", "aria-hidden": true } as const;
  if (name === "search") return <svg {...common}><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>;
  if (name === "check") return <svg {...common}><path d="m6 12 4 4 8-8" /></svg>;
  if (name === "database") return <svg {...common}><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v8c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 10c0 1.7 3.1 3 7 3s7-1.3 7-3" /></svg>;
  if (name === "target") return <svg {...common}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>;
  if (name === "clock") return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg>;
  if (name === "send") return <svg {...common}><path d="m21 3-8 18-3-8-8-3Z" /><path d="m21 3-11 10" /></svg>;
  if (name === "settings") return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" /></svg>;
  if (name === "message") return <svg {...common}><path d="M5 6h14v9H8l-3 3Z" /><path d="M8 9h8M8 12h5" /></svg>;
  if (name === "bell") return <svg {...common}><path d="M7 10a5 5 0 0 1 10 0v4l2 3H5l2-3Z" /><path d="M10 20h4" /></svg>;
  if (name === "filter") return <svg {...common}><path d="M4 6h16l-6 7v4l-4 2v-6Z" /></svg>;
  if (name === "shield") return <svg {...common}><path d="M12 3 19 6v5c0 4.5-2.8 7.6-7 10-4.2-2.4-7-5.5-7-10V6Z" /><path d="m9 12 2 2 4-5" /></svg>;
  if (name === "network") return <svg {...common}><circle cx="12" cy="5" r="2" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" /><path d="M11 7 7 16M13 7l4 9M8 18h8" /></svg>;
  if (name === "user") return <svg {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c2-5 12-5 14 0" /></svg>;
  if (name === "spark") return <svg {...common}><path d="M12 2 9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5Z" /></svg>;
  if (name === "star") return <svg {...common}><path d="m12 3 2.7 5.5 6.1.9-4.4 4.2 1 6-5.4-2.9-5.4 2.9 1-6-4.4-4.2 6.1-.9Z" /></svg>;
  if (name === "eye") return <svg {...common}><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="3" /></svg>;
  if (name === "x") return <svg {...common}><path d="M7 7l10 10M17 7 7 17" /></svg>;
  if (name === "chevronLeft") return <svg {...common}><path d="m15 6-6 6 6 6" /></svg>;
  return <svg {...common}><path d="m9 6 6 6-6 6" /></svg>;
}
