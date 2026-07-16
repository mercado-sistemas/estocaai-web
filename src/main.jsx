import React from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from './shared';
import './theme.css';
import App from './App.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
