import '@ideamap/ui/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { UiReference } from './UiReference';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <UiReference />
  </StrictMode>,
);
