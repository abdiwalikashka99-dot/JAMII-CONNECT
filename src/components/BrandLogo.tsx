import React, { useState } from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md';
  showWordmark?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  showWordmark = true,
}) => {
  const [imgError, setImgError] = useState(false);

  const boxClass =
    size === 'sm'
      ? 'w-9 h-7 rounded-md'
      : 'w-11 h-9 rounded-lg';

  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0">
      <span
        className={`${boxClass} relative overflow-hidden bg-white border border-slate-200 shrink-0 block`}
      >
        {!imgError ? (
          <img
            src="/assets/aistudio/Jamii_Connect_Community_App_Banner_44f968ed.png"
            alt="JAMII CONNECT logo"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-[410%] max-w-none -translate-x-[3%] -translate-y-[7%] block"
          />
        ) : (
          <span className="w-full h-full bg-navy-900 text-white font-display font-bold text-xs flex items-center justify-center">
            JC
          </span>
        )}
      </span>
      {showWordmark && (
        <span
          className={`font-display font-extrabold tracking-tight text-navy-900 ${
            size === 'sm' ? 'text-sm' : 'text-lg'
          }`}
        >
          JAMII CONNECT
        </span>
      )}
    </span>
  );
};
