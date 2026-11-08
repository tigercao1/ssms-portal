import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SignApp } from '@/sign/SignApp';
import '@/styles/tokens.css';
import '@/styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SignApp />
  </StrictMode>,
);
