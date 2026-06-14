import React from 'react';

const ErrorMessage = ({ message, onRetry }) => {
  return (
    <div className="bg-error-muted border-l-4 border-error rounded-lg p-4 flex items-center justify-between mb-6">
      <div className="flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0 h-5 w-5 mr-3 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-sm font-medium text-text-primary">{message}</span>
      </div>
      {onRetry && (
        <button 
          className="ml-4 px-3 py-1 text-xs font-medium text-error rounded-lg hover:bg-error-muted transition-colors" 
          onClick={onRetry}
        >
          Try Again
        </button>
      )}
    </div>
  );
};

export default ErrorMessage;
