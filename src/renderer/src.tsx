import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { installFilteredSystemAudio } from './filtered-system-audio';
import { installWindowControls } from './window-controls';
import './styles.css';
import './call-layout-fixes.css';

installWindowControls();
installFilteredSystemAudio();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
