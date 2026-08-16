import { Link } from 'react-router-dom';

import Layout from '../components/Layout';
import { IconSearchOff } from '../components/icons';

export default function NotFoundPage() {
  return (
    <Layout>
      <div className="state">
        <IconSearchOff />
        <h1 className="state__title">الصفحة غير موجودة</h1>
        <p className="state__text">الرابط الذي فتحته غير صحيح أو لم يعد متاحاً.</p>
        <Link to="/" className="btn btn--primary">
          العودة إلى الفريق
        </Link>
      </div>
    </Layout>
  );
}
