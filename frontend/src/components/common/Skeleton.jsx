import React from 'react';

const Skeleton = ({ variant = 'card', className = '' }) => {
  const baseClass = 'animate-pulse bg-surface-alt rounded-2xl';

  if (variant === 'card') {
    return (
      <div className={`flex flex-col gap-4 p-4 bg-surface border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] rounded-2xl ${className}`}>
        <div className={`${baseClass} h-48 w-full`}></div>
        <div className={`${baseClass} h-6 w-3/4`}></div>
        <div className={`${baseClass} h-4 w-1/2`}></div>
        <div className="flex gap-2 mt-2">
          <div className={`${baseClass} h-8 w-16 rounded-full`}></div>
          <div className={`${baseClass} h-8 w-16 rounded-full`}></div>
        </div>
      </div>
    );
  }

  if (variant === 'form') {
    return (
      <div className={`space-y-6 w-full ${className}`}>
        <div className="space-y-2">
          <div className={`${baseClass} h-5 w-1/4`}></div>
          <div className={`${baseClass} h-12 w-full`}></div>
        </div>
        <div className="space-y-2">
          <div className={`${baseClass} h-5 w-1/4`}></div>
          <div className={`${baseClass} h-12 w-full`}></div>
        </div>
        <div className={`${baseClass} h-12 w-full mt-8`}></div>
      </div>
    );
  }

  // Default block
  return <div className={`${baseClass} h-full w-full ${className}`}></div>;
};

export default Skeleton;
