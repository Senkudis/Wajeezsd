/**
 * 🧹 تنظيف Settings المكررة في قاعدة البيانات
 * يحتفظ بأحدث وثيقة ويحذف الباقي
 * شغّل بـ: node scripts/cleanup-settings.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const col = mongoose.connection.db.collection('settings');
    const all = await col.find({}).sort({ updatedAt: -1 }).toArray();

    console.log(`📄 Found ${all.length} Settings documents:`);
    all.forEach((doc, i) => {
        console.log(`  [${i}] _id: ${doc._id} | defaultCreditLimit: ${doc.defaultCreditLimit} | bankName: ${doc.bankName} | updatedAt: ${doc.updatedAt}`);
    });

    if (all.length <= 1) {
        console.log('\n✅ Only one Settings doc exists — nothing to clean.');
        await mongoose.disconnect();
        return;
    }

    // Keep the newest (index 0 after sort by updatedAt desc), delete the rest
    const keepId  = all[0]._id;
    const deleteIds = all.slice(1).map(d => d._id);

    const result = await col.deleteMany({ _id: { $in: deleteIds } });
    console.log(`\n🗑️  Deleted ${result.deletedCount} duplicate Settings docs.`);
    console.log(`✅ Kept: _id=${keepId} | creditLimit=${all[0].defaultCreditLimit} | bankName=${all[0].bankName}`);

    // Show captains and their current credit_limit
    const captains = await mongoose.connection.db
        .collection('users')
        .find({ role: 'captain' })
        .project({ name: 1, credit_limit: 1, wallet_balance: 1 })
        .toArray();

    console.log(`\n👤 Captains (${captains.length}):`);
    captains.forEach(c => console.log(`  ${c.name} | credit_limit: ${c.credit_limit} | wallet: ${c.wallet_balance}`));

    await mongoose.disconnect();
    console.log('\n✅ Done. Restart the server for changes to take effect.');
})().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });
