import '@ideamap/ui/styles.css';
import './udl/udl.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { UdlReference } from './UdlReference';
import { applyDisplay, loadDisplay } from './udl';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

applyDisplay(loadDisplay());
createRoot(root).render(
  <StrictMode>
    <UdlReference />
  </StrictMode>,
);
