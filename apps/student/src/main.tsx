import '@ideamap/ui/styles.css';
import './udl/udl.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyDisplay, loadDisplay } from './udl';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// The student's text size and motion choices (S5), before the first paint.
applyDisplay(loadDisplay());
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
