import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ThemeProvider } from '../shared/lib/theme';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* ThemeProvider wraps the whole tree so the toggle is reachable everywhere; it
        reads the <html>.dark class the no-flash script in index.html set first. */}
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
