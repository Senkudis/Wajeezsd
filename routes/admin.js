const express = require('express');
const router = express.Router();

// admin.js مقسّم إلى وحدات حسب المجال تحت routes/admin/.
// تُركّب كلها على نفس المسار '/'، فيحاول Express كل وحدة بترتيب التركيب.
router.use(require('./admin/auth'));
router.use(require('./admin/dashboard'));
router.use(require('./admin/users'));
router.use(require('./admin/orders'));
router.use(require('./admin/complaints'));
router.use(require('./admin/finance'));
router.use(require('./admin/settings'));
router.use(require('./admin/notifications'));
router.use(require('./admin/subadmins'));
router.use(require('./admin/ratings'));
router.use(require('./admin/chats'));

module.exports = router;
