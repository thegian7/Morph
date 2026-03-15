import React from 'react';
import ReactDOM from 'react-dom/client';
import { TrayApp } from './App';
import { applyTheme, getResolvedTheme } from '../shared/hooks/useTheme';
import './styles.css';

const osDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
applyTheme(getResolvedTheme('system', osDark));

ReactDOM.createRoot(document.getElementById('root')!).render(<TrayApp />);
