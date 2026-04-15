const express = require('express');
const router = express.Router();
const upload = require('../Middleware/upload.middleware');
const { protect, isAdmin } = require('../Middleware/authorization.middleware');
const {
    getMyKycStatus,
    submitKyc,
    getAllKycRequests,
    reviewKycRequest
} = require('../Controller/kyc.controller');

router.get('/myStatus', protect, getMyKycStatus);
router.post(
    '/submit',
    protect,
    upload.fields([
        { name: 'frontImage', maxCount: 1 },
        { name: 'backImage', maxCount: 1 }
    ]),
    submitKyc
);

router.get('/admin/all', protect, isAdmin, getAllKycRequests);
router.put('/admin/:kycId/review', protect, isAdmin, reviewKycRequest);

module.exports = router;
