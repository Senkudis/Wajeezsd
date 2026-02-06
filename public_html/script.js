let isArabic = true;

const content = {
    ar: {
        title: "خدمة توصيل داخل مدينة أم درمان",
        desc: "وَصِّلِي منصة توصيل تعتمد على الدراجات الهوائية والكهربائية لتقديم خدمة سريعة وآمنة من نقطة إلى نقطة.",
        howTitle: "كيف تعمل الخدمة؟",
        howList: [
            "تحديد موقع الاستلام والتسليم",
            "احتساب تكلفة التوصيل",
            "تنفيذ الطلب عبر كابتن معتمد",
            "الدفع نقداً عند الاستلام"
        ],
        btn: "EN",
        dir: "rtl"
    },
    en: {
        title: "Bike-based delivery service in Omdurman",
        desc: "Wassili is a bike-based delivery platform offering fast and reliable point-to-point delivery.",
        howTitle: "How it works?",
        howList: [
            "Select pickup and drop-off locations",
            "Delivery cost is calculated",
            "Verified courier completes delivery",
            "Cash payment upon delivery"
        ],
        btn: "AR",
        dir: "ltr"
    }
};

document.getElementById("langBtn").onclick = () => {
    isArabic = !isArabic;
    const lang = isArabic ? "ar" : "en";

    document.body.dir = content[lang].dir;
    document.getElementById("title").innerText = content[lang].title;
    document.getElementById("desc").innerText = content[lang].desc;
    document.getElementById("howTitle").innerText = content[lang].howTitle;

    const list = document.getElementById("howList");
    list.innerHTML = "";
    content[lang].howList.forEach(item => {
        const li = document.createElement("li");
        li.innerText = item;
        list.appendChild(li);
    });

    document.getElementById("langBtn").innerText = content[lang].btn;
};
