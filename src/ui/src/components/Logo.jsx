import React from 'react';

export function Logo({ className = "w-6 h-6" }) {
  return (
    <svg 
      className={className} 
      viewBox="0 0 512 512" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="grad_warm_ui" x1="-100" y1="-100" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FB923C" />
          <stop offset="100%" stopColor="#DB2777" />
        </linearGradient>
      </defs>

      <g transform="translate(256 256) scale(1.8)">
        {/* L 形底座 */}
        <path d="M-100 -100 H0 V0 H100 V100 H-100 Z" fill="url(#grad_warm_ui)"/>
        
        {/* 白色补块 */}
        <rect x="20" y="-100" width="80" height="80" fill="#FFFFFF"/>
        
        {/* 内部套一个橙色小方块 (核心) */}
        <rect x="45" y="-75" width="30" height="30" fill="#F97316"/>
      </g>
    </svg>
  );
}
