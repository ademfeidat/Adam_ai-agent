import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AuthProvider } from './core/auth/AuthContext';
import './index.css';
import './theme.css';
import './features/features.css';
import 'leaflet/dist/leaflet.css';

// Graceful global guard for headless or non-accelerated WebGL environments (EGL/drivers)
if (typeof window !== 'undefined') {
  const _origError = console.error;
  console.error = (...args: any[]) => {
    const msg = typeof args[0] === 'string' ? args[0] : '';
    if (
      msg.includes('THREE.WebGLRenderer') ||
      msg.includes('FEATURE_FAILURE_EGL_NO_CONFIG') ||
      msg.includes('FEATURE_FAILURE_WEBGL_EXHAUSTED_DRIVERS') ||
      msg.includes('Error creating WebGL context')
    ) {
      console.warn('[ADEM WebGL Sentinel] Gracefully handled headless GL environment:', ...args);
      return;
    }
    _origError.apply(console, args);
  };
}

const root = document.getElementById('root');
if (!root) throw new Error('Adam root element is missing');
createRoot(root).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);
