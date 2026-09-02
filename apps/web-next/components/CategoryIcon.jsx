const ICONS = {
  auto: (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 28l3-10c1-3 3-4 6-4h18c3 0 5 1 6 4l3 10" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="4" y="28" width="40" height="10" rx="2" />
      <circle cx="13" cy="38" r="3.5" />
      <circle cx="35" cy="38" r="3.5" />
      <path d="M9 21h30" strokeLinecap="round" />
    </svg>
  ),
  propiedades: (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 22L24 8l18 14" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 19v19h28V19" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="20" y="26" width="8" height="12" />
    </svg>
  ),
  salud: (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        d="M24 40C12 32 5 25 5 16.5 5 10.5 9.5 6 15.5 6c3.4 0 6.6 1.7 8.5 4.5C25.9 7.7 29.1 6 32.5 6 38.5 6 43 10.5 43 16.5c0 8.5-7 15.5-19 23.5z"
        strokeLinejoin="round"
      />
      <path d="M17 22h6l2-5 3 10 2-5h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  "obras-civiles": (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 40h36" strokeLinecap="round" />
      <path d="M10 40V22l14-10 14 10v18" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 40V28h8v12" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 22l18-12 18 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

export default function CategoryIcon({ id, className }) {
  return <div className={className}>{ICONS[id] || ICONS.auto}</div>;
}
