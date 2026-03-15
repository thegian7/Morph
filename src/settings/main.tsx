import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { applyTheme, getResolvedTheme } from '../shared/hooks/useTheme';

const osDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
applyTheme(getResolvedTheme('system', osDark));

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
