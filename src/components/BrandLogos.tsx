import React from 'react';

interface BrandMarkProps {
  className?: string;
  logoUrl?: string;
  brandName?: string;
}

export const BrandMark: React.FC<BrandMarkProps> = ({
  className = 'w-8 h-8',
  logoUrl,
  brandName = 'Brand Logo',
}) => {
  if (logoUrl && logoUrl.trim()) {
    return (
      <img
        src={logoUrl.trim()}
        alt={brandName}
        referrerPolicy="no-referrer"
        className={`${className} rounded-xl object-cover border border-amber-500/30 bg-slate-900 shrink-0`}
      />
    );
  }

  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#0F172A" />
      <rect x="2" y="2" width="60" height="60" rx="14" stroke="#D4AF37" strokeOpacity="0.45" strokeWidth="2" />
      <path d="M13 44V20H19.5L26 32.5L32.5 20H39V44H33.5V29L27.8 39.5H24.2L18.5 29V44H13Z" fill="#F59E0B" />
      <path d="M42 20H53V25H47.5V29.8H51.8V34.6H47.5V44H42V20Z" fill="#FDE68A" />
    </svg>
  );
};

export const VaultProMark = BrandMark;

export const BkashLogo: React.FC<{ className?: string }> = ({ className = 'h-7' }) => (
  <div className={`inline-flex items-center gap-2 ${className}`}>
    <svg viewBox="0 0 40 40" className="w-7 h-7 shrink-0" aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#E2136E" />
      <path d="M12 10L26 17L19 29L12 10Z" fill="#FFFFFF" />
      <path d="M20 14L29 19L23 27L20 14Z" fill="#FFD1E6" />
    </svg>
    <span className="font-bold tracking-tight text-white text-base">bKash</span>
  </div>
);

export const NagadLogo: React.FC<{ className?: string }> = ({ className = 'h-7' }) => (
  <div className={`inline-flex items-center gap-2 ${className}`}>
    <svg viewBox="0 0 40 40" className="w-7 h-7 shrink-0" aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#F7941D" />
      <circle cx="20" cy="20" r="11" fill="#ED1C24" />
      <path d="M15 20C15 16.5 18 14 22 14C24.5 14 26 15.2 26 17.5C26 21 21 23 17 26" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </svg>
    <span className="font-bold tracking-tight text-white text-base">Nagad</span>
  </div>
);
