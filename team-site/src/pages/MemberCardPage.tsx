import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Api, ApiError, type TeamMember } from '../api';
import Avatar from '../components/Avatar';
import Layout from '../components/Layout';
import { BRAND_NAME, SUPPORT_PHONE, SUPPORT_WHATSAPP } from '../config';
import { IconAlert, IconPhone, IconSearchOff, IconShieldCheck, IconWhatsapp } from '../components/icons';

type Status = 'loading' | 'ready' | 'missing' | 'error';

/**
 * بطاقة العضو — الوجهة التي يفتحها رمز QR المطبوع.
 *
 * لا رقم هاتف للعضو هنا بأي حال: البطاقة تُفقَد وتُمسَح من غرباء، ونشر رقم
 * الكابتن الشخصي عليها يحوّل كل بطاقة ضائعة إلى تسريب بيانات. التواصل كله
 * يمرّ عبر دعم وجيز الموحّد.
 */
export default function MemberCardPage() {
  const { publicId } = useParams<{ publicId: string }>();
  const [status, setStatus] = useState<Status>('loading');
  const [member, setMember] = useState<TeamMember | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!publicId) {
      setStatus('missing');
      return;
    }

    let cancelled = false;
    setStatus('loading');

    Api.getMember(publicId)
      .then((result) => {
        if (cancelled) return;
        setMember(result);
        setStatus('ready');
        document.title = `${result.name} — فريق ${BRAND_NAME}`;
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // 404/400 = بطاقة غير معروفة (أو صاحبها لم يعد في الفريق)، وما عداهما عطل مؤقت
        const notFound = err instanceof ApiError && (err.status === 404 || err.status === 400);
        setStatus(notFound ? 'missing' : 'error');
      });

    return () => {
      cancelled = true;
    };
  }, [publicId, attempt]);

  return (
    <Layout showBackLink>
      {status === 'loading' && (
        <div className="state">
          <div className="spinner" />
          <p className="state__text">جارٍ التحقق من البطاقة…</p>
        </div>
      )}

      {status === 'missing' && (
        <div className="state">
          <IconSearchOff />
          <h1 className="state__title">هذه البطاقة غير معتمدة</h1>
          <p className="state__text">
            لا يوجد عضو مطابق لهذا الرمز. إن كان أحدهم يستخدمها للتعريف بنفسه، أبلغ الدعم فوراً.
          </p>
          <a className="btn btn--primary" href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noopener noreferrer">
            <IconWhatsapp />
            إبلاغ الدعم
          </a>
          <Link to="/" className="btn btn--ghost">
            تصفّح الفريق
          </Link>
        </div>
      )}

      {status === 'error' && (
        <div className="state">
          <IconAlert />
          <h1 className="state__title">تعذّر تحميل البطاقة</h1>
          <p className="state__text">تحقّق من اتصالك بالإنترنت ثم أعد المحاولة.</p>
          <button type="button" className="btn btn--primary" onClick={() => setAttempt((n) => n + 1)}>
            إعادة المحاولة
          </button>
        </div>
      )}

      {status === 'ready' && member && (
        <div className="card-wrap">
          <article className="card">
            <div className="card__banner" />
            <div className="card__body">
              <div className="card__avatar-wrap">
                {/* حلقتان بتأخير مختلف تُنتجان موجتين متتاليتين لا نبضة واحدة */}
                <span className="card__avatar-ring" aria-hidden="true" />
                <span className="card__avatar-ring" style={{ animationDelay: '1.1s' }} aria-hidden="true" />
                <Avatar src={member.imageUrl} alt={member.name} className="card__avatar" />
              </div>

              <h1 className="card__name">{member.name}</h1>

              {member.jobTitles.length > 0 && (
                <div className="card__titles">
                  {member.jobTitles.map((title, index) => (
                    <p
                      key={title}
                      className={index === 0 ? 'card__title' : 'card__title card__title--secondary'}
                      style={{ '--i': index } as CSSProperties}
                    >
                      {title}
                    </p>
                  ))}
                </div>
              )}

              {member.department && <span className="card__dept">{member.department}</span>}

              <div className="card__verified">
                <IconShieldCheck />
                عضو معتمد في {BRAND_NAME}
              </div>

              <div className="actions">
                <a
                  className="btn btn--primary"
                  href={`https://wa.me/${SUPPORT_WHATSAPP}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <IconWhatsapp />
                  تواصل مع الدعم
                </a>
                <a className="btn btn--ghost" href={`tel:${SUPPORT_PHONE}`}>
                  <IconPhone />
                  اتصال بالدعم
                </a>
              </div>

              <p className="card__note">
                لحمايتك ولحماية أعضاء الفريق، لا تُعرض أرقام هواتفهم الشخصية هنا. أي طلب أو شكوى
                يمرّ عبر الدعم الرسمي فقط.
              </p>
            </div>
          </article>
        </div>
      )}
    </Layout>
  );
}
