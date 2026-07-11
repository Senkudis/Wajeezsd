/**
 * تشخيص: اقرأ Settings و كباتن من قاعدة البيانات مباشرة
 * شغّل بـ: node scripts/diagnose-settings.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // ── 1. كل وثائق Settings ─────────────────────────
    const settingsDocs = await mongoose.connection.db
        .collection('settings')
        .find({})
        .toArray();

    console.log(`📄 Settings documents in DB: ${settingsDocs.length}`);
    settingsDocs.forEach((doc, i) => {
        console.log(`\n  [${i}] _id: ${doc._id}`);
        console.log(`       defaultCreditLimit : ${doc.defaultCreditLimit}`);
        console.log(`       bankName           : ${doc.bankName}`);
        console.log(`       bankAccountName    : ${doc.bankAccountName}`);
        console.log(`       bankAccountNumber  : ${doc.bankAccountNumber}`);
        console.log(`       commissionRate     : ${doc.commissionRate}`);
        console.log(`       updatedAt          : ${doc.updatedAt}`);
    });

    // ── 2. كل الكباتن وحدودهم ────────────────────────
    const captains = await mongoose.connection.db
        .collection('users')
        .find({ role: 'captain' })
        .project({ name: 1, phone: 1, credit_limit: 1, wallet_balance: 1, role: 1 })
        .toArray();

    console.log(`\n👤 Captains (role: 'captain') in DB: ${captains.length}`);
    captains.forEach(c => {
        console.log(`  ${c.name} | credit_limit: ${c.credit_limit} | wallet_balance: ${c.wallet_balance}`);
    });

    // ── 3. أي مستخدم بـ isCaptain أو role driver ────
    const drivers = await mongoose.connection.db
        .collection('users')
        .find({ $or: [{ role: 'driver' }, { isCaptain: true }] })
        .project({ name: 1, phone: 1, role: 1, credit_limit: 1 })
        .toArray();

    if (drivers.length > 0) {
        console.log(`\n⚠️  Users with role='driver' or isCaptain=true: ${drivers.length}`);
        drivers.forEach(d => console.log(`  ${d.name} | role: ${d.role} | credit_limit: ${d.credit_limit}`));
    }

    await mongoose.disconnect();
    console.log('\n✅ Done.');
})().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });
