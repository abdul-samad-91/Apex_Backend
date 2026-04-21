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

const KYC_FRONT_IMAGE_FIELDS = [
    'frontImage',
    'idFrontImage',
    'idFront',
    'front',
    'front_image',
    'id_front_image'
];

const KYC_BACK_IMAGE_FIELDS = [
    'backImage',
    'idBackImage',
    'idBack',
    'back',
    'back_image',
    'id_back_image'
];

const KYC_UPLOAD_FIELDS = [
    ...KYC_FRONT_IMAGE_FIELDS,
    ...KYC_BACK_IMAGE_FIELDS
].map((name) => ({ name, maxCount: 1 }));

router.get('/myStatus', protect, getMyKycStatus);
router.post(
    '/submit',
    protect,
    upload.fields(KYC_UPLOAD_FIELDS),
    submitKyc
);

router.get('/admin/all', protect, isAdmin, getAllKycRequests);
router.put('/admin/:kycId/review', protect, isAdmin, reviewKycRequest);

module.exports = router;
