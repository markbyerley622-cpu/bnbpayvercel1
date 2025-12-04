import React from 'react';
import ReactDOM from 'react-dom/client';
import { CalendarPage } from './components/CalendarPage';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CalendarPage />
  </React.StrictMode>
);
