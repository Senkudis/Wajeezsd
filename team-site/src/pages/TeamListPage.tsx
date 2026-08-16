import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';

import { Api, type TeamMember } from '../api';
import Avatar from '../components/Avatar';
import Layout from '../components/Layout';
import { IconAlert, IconUsers } from '../components/icons';

const PAGE_LIMIT = 24;

type Status = 'loading' | 'ready' | 'error';

export default function TeamListPage() {
  const [status, setStatus] = useState<Status>('loading');
  const [items, setItems] = useState<TeamMember[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [department, setDepartment] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    Api.listTeam({ page, limit: PAGE_LIMIT, department: department || undefined })
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
        // قائمة الأقسام تأتي من الخادم كاملةً غير مفلترة، فلا تختفي الأزرار
        // الأخرى بمجرّد اختيار قسم واحد.
        setDepartments(result.departments);
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [page, department, attempt]);

  const selectDepartment = useCallback((next: string) => {
    setDepartment(next);
    setPage(1);
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  return (
    <Layout>
      <main className="container">
        <div className="hero">
          <h1 className="hero__title">فريق وجيز</h1>
          <div className="hero__rule" />
          <p className="hero__subtitle">
            الأعضاء المعتمدون رسمياً — امسح رمز البطاقة للتحقق من أي عضو
          </p>
          {status === 'ready' && total > 0 && (
            <span className="hero__count">
              <span className="hero__dot" />
              <IconUsers />
              {total} عضو معتمد
            </span>
          )}
        </div>

        {departments.length > 1 && (
          <nav className="filters" aria-label="أقسام الفريق">
            <button
              type="button"
              className={department === '' ? 'chip chip--active' : 'chip'}
              style={{ '--i': 0 } as CSSProperties}
              onClick={() => selectDepartment('')}
            >
              الكل
            </button>
            {departments.map((dept, index) => (
              <button
                key={dept}
                type="button"
                className={department === dept ? 'chip chip--active' : 'chip'}
                style={{ '--i': index + 1 } as CSSProperties}
                onClick={() => selectDepartment(dept)}
              >
                {dept}
              </button>
            ))}
          </nav>
        )}

        {status === 'loading' && (
          <div className="grid" aria-busy="true" aria-label="جارٍ التحميل">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ animationDelay: `${i * 90}ms` } as CSSProperties} />
            ))}
          </div>
        )}

        {status === 'error' && (
          <div className="state">
            <IconAlert />
            <h2 className="state__title">تعذّر تحميل القائمة</h2>
            <p className="state__text">تحقّق من اتصالك بالإنترنت ثم أعد المحاولة.</p>
            <button type="button" className="btn btn--primary" onClick={() => setAttempt((n) => n + 1)}>
              إعادة المحاولة
            </button>
          </div>
        )}

        {status === 'ready' && items.length === 0 && (
          <div className="state">
            <h2 className="state__title">لا يوجد أعضاء لعرضهم</h2>
            <p className="state__text">
              {department ? 'لا يوجد أعضاء في هذا القسم حالياً.' : 'لم تُضَف بيانات الفريق بعد.'}
            </p>
          </div>
        )}

        {status === 'ready' && items.length > 0 && (
          <>
            <div className="grid">
              {items.map((member, index) => (
                <Link
                  key={member.publicId}
                  to={`/m/${member.publicId}`}
                  className="member"
                  style={{ '--i': index } as CSSProperties}
                >
                  <Avatar src={member.imageUrl} alt={member.name} className="member__avatar" />
                  <h2 className="member__name">{member.name}</h2>
                  {member.jobTitle && <p className="member__title">{member.jobTitle}</p>}
                  {member.department && <span className="member__dept">{member.department}</span>}
                </Link>
              ))}
            </div>

            {total > PAGE_LIMIT && (
              <div className="pager">
                <button
                  type="button"
                  className="pager__btn"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  السابق
                </button>
                <span className="pager__info">
                  صفحة {page} من {totalPages}
                </span>
                <button
                  type="button"
                  className="pager__btn"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  التالي
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </Layout>
  );
}
