// هوية الإعلان وقواعد الشاشة — مصدرٌ واحد لكل المشاهد.
import { Easing } from "remotion";

export const FPS = 30;
export const W = 1080;
export const H = 1920;

export const C = {
  cream: "#F5F2EA",
  paper: "#FBF8F1",
  green: "#0A8754",
  brand: "#04553A",
  deep: "#08392A",
  gold: "#E3A33B",
  goldD: "#C98A2A",
  ink: "#0B1F17",
  gray: "#6B7A72",
  line: "#E6E0D2",
  orange: "#F39C12",
  white: "#FFFFFF",
};

export const F = {
  head: "Alarabiya",
  sup: "ArabicModern",
  lat: "IntroBlack",
  latB: "IntroBold",
};

// المنطقة الآمنة (9:16): أزرار تيك توك/ريلز يميناً، والوصف وزرّ الإعلان تحت.
// كل نصٍّ وشعارٍ داخلها؛ الصور والخلفيات وحدها تمتدّ للأطراف.
export const SAFE = { left: 120, right: 170, top: 290, bottom: 600 };
export const SAFE_W = W - SAFE.left - SAFE.right; // 790
export const SAFE_H = H - SAFE.top - SAFE.bottom; // 1030
export const HEADLINE_BASELINE = 420; // خطّ أساس العنوان — ثابتٌ في كل المشاهد

// منحنيات الحركة
export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_INOUT = Easing.bezier(0.65, 0, 0.35, 1);
export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// تلوينٌ موحّد لصور المتاجر — تبدو من جلسة تصويرٍ واحدة
export const PHOTO_GRADE = "saturate(1.08) contrast(1.05) sepia(0.06) brightness(1.02)";

// المتاجر — من صفحاتها في وجيز (الأسماء والأسعار كما في التطبيق)
export const STORES = {
  qashtouta: { name: "قشطوطة و بسبوسة", short: "قشطوطة", logo: "shops/qashtouta_0.jpg", cat: "حلويات" },
  limomix: { name: "ليمومكس", short: "ليمومكس", logo: "shops/limomix_0.jpg", cat: "تجميل" },
  ocean: { name: "هـدايــا أوشــين", short: "هدايا أوشين", logo: null, cat: "هدايا" },
  beanora: { name: "بن بينور", short: "بن بينور", logo: null, cat: "قهوة" },
} as const;
