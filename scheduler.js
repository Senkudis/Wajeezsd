const cron = require('node-cron');
const Order = require('./models/Order');
const nodemailer = require('nodemailer');

// إعداد الإيميل
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        // يفضل دائماً استخدام المتغيرات البيئية process.env
        user: process.env.EMAIL_USER || 'wassili249@gmail.com', 
        pass: process.env.EMAIL_PASS || 'daha itln qkqp bqjr'
    }
});

const startScheduler = () => {
    console.log('⏰ نظام الجدولة (Scheduler) يعمل...');

    // تشغيل الفحص كل ساعة (عند الدقيقة 0)
    cron.schedule('0 * * * *', async () => {
        console.log('🔍 فحص الطلبات المعلقة القديمة...');
        
        try {
            // 1. تحديد الوقت قبل 6 ساعات (بدلاً من 12)
            const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

            // 2. البحث عن الطلبات المعلقة التي مر عليها أكثر من 6 ساعات
            // نستخدم populate لجلب إيميل العميل لإرسال الإشعار قبل الحذف
            const staleOrders = await Order.find({
                status: 'pending',
                createdAt: { $lt: sixHoursAgo }
            }).populate('client');

            if (staleOrders.length === 0) {
                console.log('✅ لا توجد طلبات قديمة تحتاج للحذف.');
                return;
            }

            console.log(`⚠️ تم العثور على ${staleOrders.length} طلب قديم سيتم حذفه.`);

            for (const order of staleOrders) {
                // 3. محاولة إرسال إيميل للعميل (إذا وجد)
                if (order.client && order.client.email) {
                    try {
                        await transporter.sendMail({
                            to: order.client.email,
                            subject: 'تم إلغاء طلبك لعدم توفر كابتن | وصل-لي',
                            html: `
                                <div style="text-align:right; direction:rtl; font-family: 'Cairo', sans-serif;">
                                    <h3>مرحباً ${order.client.name || 'عميلنا العزيز'} 👋</h3>
                                    <p>نأسف لإبلاغك بأنه قد مرت 6 ساعات على طلبك ولم يتم قبوله من قبل أي كابتن.</p>
                                    <p><b>لذلك تم إلغاء وحذف الطلب تلقائياً من النظام.</b></p>
                                    <p>يمكنك إعادة المحاولة ورفع السعر المقترح لجذب الكباتن.</p>
                                    <br>
                                    <p>شكراً لاستخدامك وصل-لي 🚴‍♂️</p>
                                </div>
                            `
                        });
                        console.log(`📧 تم إرسال إيميل تنبيه للعميل: ${order.client.email}`);
                    } catch (mailErr) {
                        console.error(`❌ فشل إرسال الإيميل للطلب ${order._id}:`, mailErr.message);
                        // نستمر في الحذف حتى لو فشل الإيميل
                    }
                }

                // 4. الحذف النهائي للطلب
                // استخدمنا findByIdAndDelete بدلاً من save لتجنب مشاكل الـ Validation في البيانات القديمة
                await Order.findByIdAndDelete(order._id);
                console.log(`🗑️ تم حذف الطلب رقم: ${order._id}`);
            }

        } catch (error) {
            console.error('❌ خطأ في نظام الجدولة:', error);
        }
    });
};

module.exports = startScheduler;