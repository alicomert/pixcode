// OpenCode brand mark. Uses an inline SVG so a missing icon asset doesn't
// leave a broken image in the provider picker — matches Claude/Cursor/Codex
// which also ship as inline SVGs here. When a proper brand asset lands in
// `public/opencode.svg` we can swap this for an <img> tag like QwenLogo.
const OpencodeLogo = ({ className = 'w-5 h-5' }) => {
  return (
    <svg
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="OpenCode"
    >
      {/* Outer ring (brand teal) + inline chevrons — neutral enough to
       *  read on both light and dark backgrounds without a separate
       *  white variant. */}
      <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M10 11 L6 16 L10 21 M22 11 L26 16 L22 21 M18 9 L14 23"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default OpencodeLogo;
