import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders a printable modal outside the app root. While mounted, printing shows only this
 * content (the page behind the modal is hidden), so letters and statements print cleanly.
 */
export const PrintPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    document.body.classList.add('has-print-portal');
    return () => document.body.classList.remove('has-print-portal');
  }, []);
  return createPortal(<div className="print-portal">{children}</div>, document.body);
};

export default PrintPortal;
