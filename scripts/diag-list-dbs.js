// يسرد كل قواعد البيانات على الـ cluster وعدد المستخدمين/الأدمن في كل منها
require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
    await mongoose.connect(process.env.MONGO_URI);
    const admin = mongoose.connection.db.admin();
    const { databases } = await admin.listDatabases();

    console.log('📚 Databases on this cluster:\n');
    for (const d of databases) {
        if (['admin', 'local', 'config'].includes(d.name)) continue;
        try {
            const db = mongoose.connection.client.db(d.name);
            const cols = await db.listCollections().toArray();
            const hasUsers = cols.some(c => c.name === 'users');
            let usersCount = 0, adminsCount = 0, sampleAdmin = null;
            if (hasUsers) {
                usersCount = await db.collection('users').countDocuments();
                adminsCount = await db.collection('users').countDocuments({ role: 'admin' });
                sampleAdmin = await db.collection('users').findOne({ role: 'admin' }, { projection: { email: 1, adminRole: 1 } });
            }
            console.log(`🗄️  ${d.name}  | collections: ${cols.length} | users: ${usersCount} | admins: ${adminsCount}${sampleAdmin ? ' | e.g. ' + sampleAdmin.email : ''}`);
        } catch (e) {
            console.log(`🗄️  ${d.name}  | (could not inspect: ${e.message})`);
        }
    }

    await mongoose.disconnect();
    process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
