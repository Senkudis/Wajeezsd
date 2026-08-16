import { useEffect, useState } from 'react';

import { AVATAR_FALLBACK } from '../config';

/**
 * صورة عضو مع بديل مضمون.
 *
 * صور الكباتن مرفوعة من هواتفهم وقت التسجيل، وبعض الملفات تُفقد أو تُحذف من
 * القرص لاحقاً. الصورة المكسورة في بطاقة هوية تُفقدها مصداقيتها كلها، فأي فشل
 * تحميل يسقط فوراً إلى صورة رمزية محايدة.
 */
export default function Avatar({
  src,
  alt,
  className
}: {
  src: string;
  alt: string;
  className: string;
}) {
  const [failed, setFailed] = useState(false);

  // تغيّر العضو (تنقّل بين بطاقتين) يعيد المحاولة بدل توريث فشل السابق
  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <img
      className={className}
      src={!src || failed ? AVATAR_FALLBACK : src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
