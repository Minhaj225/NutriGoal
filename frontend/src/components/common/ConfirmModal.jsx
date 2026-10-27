import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message }) => {
  const [isRendered, setIsRendered] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const cancelBtnRef = useRef(null);
  const confirmBtnRef = useRef(null);
  const previousFocusRef = useRef(null);
  const closeRef = useRef(onClose);
  const pendingRef = useRef(pending);
  closeRef.current = onClose;
  pendingRef.current = pending;

  useEffect(() => {
    if (!isOpen) return;
    const app = document.getElementById('root');
    const previous = app.inert;
    previousFocusRef.current = document.activeElement;
    app.inert = true;
    return () => { app.inert = previous; };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setError('');
      setIsRendered(true);
      let second;
      const timer = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => {
          setIsAnimating(true);
        });
      });
      return () => { cancelAnimationFrame(timer); cancelAnimationFrame(second); };
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => {
        setIsRendered(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && isRendered) {
      cancelBtnRef.current?.focus();

      const handleKeyDown = (e) => {
        if (e.key === 'Escape' && !pendingRef.current) {
          closeRef.current();
        }
        if (e.key === 'Tab') {
          const focusable = [cancelBtnRef.current, confirmBtnRef.current].filter(Boolean);
          if (focusable.length === 2) {
            const first = focusable[0];
            const last = focusable[1];
            if (e.shiftKey) {
              if (document.activeElement === first) {
                e.preventDefault();
                last.focus();
              }
            } else {
              if (document.activeElement === last) {
                e.preventDefault();
                first.focus();
              }
            }
          }
        }
      };

      document.addEventListener('keydown', handleKeyDown);

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        if (previousFocusRef.current) {
          previousFocusRef.current.focus();
        }
      };
    }
  }, [isOpen, isRendered]);

  const handleConfirm = async () => {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err.message || 'Action failed');
    } finally {
      setPending(false);
    }
  };

  if (!isRendered) return null;

  return createPortal(
    <div
      inert={!isOpen}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4 transition-opacity duration-200 ease-in-out motion-reduce:transition-none ${
        isAnimating ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={() => { if (!pending) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      aria-describedby="modal-desc"
    >
      <div
        className={`bg-surface rounded-2xl shadow-xl p-6 max-w-sm w-full transition-all duration-200 ease-out motion-reduce:transition-none ${
          isAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="modal-title" className="text-xl font-bold text-text-primary mb-2">
          {title}
        </h3>
        <p id="modal-desc" className="text-text-secondary text-sm mb-6">
          {message}
        </p>
        {error && <p role="alert" className="text-error text-sm mb-4">{error}</p>}
        <div className="flex justify-end gap-3">
          <button
            ref={cancelBtnRef}
            type="button"
            className="px-5 py-2 rounded-full font-medium bg-surface-alt text-text-primary hover:bg-border transition-all active:scale-[0.98]"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            className="px-5 py-2 rounded-full font-medium bg-error text-white hover:bg-red-600 transition-all active:scale-[0.98]"
            onClick={handleConfirm}
            disabled={pending}
          >
            {pending ? 'Working…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>, document.body
  );
};

export default ConfirmModal;
