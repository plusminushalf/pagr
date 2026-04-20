import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import { App } from './App';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('No #root element in index.html');
createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
