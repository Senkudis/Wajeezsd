import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import './styles.css';

/**
 * نفس البناء يُخدَم من مكانين: جذر team.wajeezsd.com و wajeezsd.com/team.
 * نستنتج الجذر من المسار الحالي بدل تثبيته وقت البناء، فنسخة واحدة تكفي
 * للنطاقين ولا يوجد بناءان يمكن أن يفترقا.
 */
const basename = window.location.pathname.startsWith('/team') ? '/team' : '/';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>
);
