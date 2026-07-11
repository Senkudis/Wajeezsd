// تشخيص: إلى أي قاعدة بيانات يتصل التطبيق؟ وهل يوجد حساب الأدمن؟
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const EMAIL = (process.argv[2] || 'diaakardmash@gmail.com').toLowerCase().trim();

(async () => {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('🗄️  Database name:', mongoose.connection.name);
    console.log('🌐 Host:', mongoose.connection.host);

    const counts = {
        total: await User.countDocuments(),
        admins: await User.countDocuments({ role: 'admin' }),
    };
    console.log('👥 Users total:', counts.total, '| admins:', counts.admins);

    // ابحث بالضبط كما يفعل مسار تسجيل الدخول
    const exact = await User.findOne({ email: EMAIL, role: 'admin' }).select('name email role adminRole isActive password');
    console.log(`\n🔎 Exact match (email='${EMAIL}', role='admin'):`, exact ? 'FOUND' : 'NOT FOUND');

    // ابحث بالإيميل فقط (أي دور) لمعرفة السبب الحقيقي
    const anyRole = await User.findOne({ email: EMAIL }).select('name email role adminRole isActive');
    if (anyRole) {
        console.log('ℹ️  Email exists with:', { role: anyRole.role, adminRole: anyRole.adminRole, isActive: anyRole.isActive, name: anyRole.name });
    } else {
        console.log('ℹ️  No user at all has this email in THIS database.');
    }

    // اعرض كل حسابات الأدمن الموجودة (إيميلاتها) للمقارنة
    const allAdmins = await User.find({ role: 'admin' }).select('email adminRole isActive').limit(20);
    console.log('\n📋 All admin accounts in this DB:');
    allAdmins.forEach(a => console.log('   -', a.email, '| adminRole:', a.adminRole, '| active:', a.isActive));

    await mongoose.disconnect();
    process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
