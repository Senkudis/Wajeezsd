import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { BRAND_NAME, MAIN_SITE_URL, SUPPORT_PHONE, SUPPORT_WHATSAPP } from '../config';
import { IconArrowRight, IconPhone, IconWhatsapp } from './icons';

/**
 * الغلاف المشترك: شريط علوي لاصق + محتوى + تذييل تواصل.
 *
 * التذييل موجود في كل صفحة عمداً — من يمسح بطاقةً وجدها في الشارع يحتاج طريقاً
 * واضحاً للدعم، وهو الغرض العملي الأول من هذه البطاقات.
 */
export default function Layout({
  children,
  showBackLink = false
}: {
  children: ReactNode;
  showBackLink?: boolean;
}) {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="container topbar__inner">
          <Link to="/" className="topbar__brand">
            <img src="/logo-full.png" alt={BRAND_NAME} className="topbar__logo" />
            <span className="topbar__label">الفريق</span>
          </Link>

          {showBackLink && (
            <Link to="/" className="topbar__link">
              <IconArrowRight />
              كل الفريق
            </Link>
          )}
        </div>
      </header>

      {children}

      <footer className="footer">
        <p className="footer__text">
          وجدت هذه البطاقة أو تريد التحقق من أحد أعضاء الفريق؟ تواصل مع الدعم مباشرةً.
        </p>
        <div className="footer__links">
          <a
            className="footer__link"
            href={`https://wa.me/${SUPPORT_WHATSAPP}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <IconWhatsapp />
            واتساب الدعم
          </a>
          <a className="footer__link" href={`tel:${SUPPORT_PHONE}`}>
            <IconPhone />
            {SUPPORT_PHONE}
          </a>
          <a className="footer__link" href={MAIN_SITE_URL} target="_blank" rel="noopener noreferrer">
            موقع {BRAND_NAME}
          </a>
        </div>
        <p className="footer__copy">
          © {new Date().getFullYear()} {BRAND_NAME} — جميع الحقوق محفوظة
        </p>
      </footer>
    </div>
  );
}
