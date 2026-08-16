import { Navigate, Route, Routes } from 'react-router-dom';

import TeamListPage from './pages/TeamListPage';
import MemberCardPage from './pages/MemberCardPage';
import NotFoundPage from './pages/NotFoundPage';

/**
 * جدول المسارات:
 *  - `/`            قائمة الفريق
 *  - `/m/:publicId` بطاقة عضو (هذا هو الرابط المطبوع في رمز QR)
 *
 * `/team/:id` و`/captain/:id` مساران قديمان من موقع التحقق المنفصل السابق؛
 * يُحوَّلان إلى القائمة بدل إظهار 404 لأن معرّفاتهما القديمة لم تعد صالحة.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<TeamListPage />} />
      <Route path="/m/:publicId" element={<MemberCardPage />} />
      <Route path="/team/:id" element={<Navigate to="/" replace />} />
      <Route path="/captain/:id" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
