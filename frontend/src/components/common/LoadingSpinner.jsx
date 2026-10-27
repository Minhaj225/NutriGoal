import React from 'react';

const LoadingSpinner = ({ size = 'md', message = 'Loading...' }) => {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-2',
    lg: 'w-12 h-12 border-4'
  };

  return (
    <div role="status" aria-busy="true" className="flex flex-col items-center justify-center p-4">
      <div className={`animate-spin rounded-full border-t-primary border-r-transparent border-b-primary border-l-transparent ${sizeClasses[size]}`}></div>
      {message && <p className="mt-4 text-sm text-text-secondary">{message}</p>}
    </div>
  );
};

export default LoadingSpinner;
