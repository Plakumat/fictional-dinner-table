import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { AppProviders } from './app/AppContext';
import { chatStore, clock, queryClient } from './app/services';
import './ui/styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppProviders store={chatStore} clock={clock}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppProviders>
    </QueryClientProvider>
  </StrictMode>,
);
