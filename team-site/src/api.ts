/**
 * عميل الـ API لموقع بطاقات الفريق.
 *
 * لا يحمل توكناً ولا يقرأ تخزيناً محلياً: كل مسارات هذا الموقع عامة بالكامل،
 * والإدارة تتم من لوحة وجيز الرسمية لا من هنا.
 */

/** عضو فريق كما يخرج من `GET /api/team` — بلا هاتف ولا معرّف داخلي. */
export interface TeamMember {
  publicId: string;
  name: string;
  jobTitles: string[];
  jobTitle: string;
  department: string;
  imageUrl: string;
}

export interface TeamListResponse {
  items: TeamMember[];
  page: number;
  limit: number;
  total: number;
  departments: string[];
}

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** مهلة صلبة: شبكة الهاتف في السودان تتوقف دون أن تُغلق الاتصال. */
const TIMEOUT_MS = 12_000;

async function request<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(path, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
  } catch {
    throw new ApiError(0, 'تعذّر الاتصال بالخادم');
  } finally {
    window.clearTimeout(timer);
  }

  if (!response.ok) {
    let message = 'حدث خطأ غير متوقع';
    try {
      const body = await response.json();
      if (body && typeof body.message === 'string') message = body.message;
    } catch {
      /* جسم غير JSON — الرسالة الافتراضية كافية */
    }
    throw new ApiError(response.status, message);
  }

  return (await response.json()) as T;
}

export const Api = {
  listTeam(params: { page?: number; limit?: number; department?: string } = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.department) query.set('department', params.department);
    const qs = query.toString();
    return request<TeamListResponse>(`/api/team${qs ? `?${qs}` : ''}`);
  },

  getMember(publicId: string) {
    return request<TeamMember>(`/api/team/${encodeURIComponent(publicId)}`);
  }
};
