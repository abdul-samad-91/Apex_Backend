const express = require('express');
const router = express.Router();
const { protect, isAdmin } = require('../Middleware/authorization.middleware');
const upload = require('../Middleware/upload.middleware');
const {
    getActiveBanner,
    getAllBanners,
    createBanner,
    updateBanner,
    deleteBanner,
    trackBannerClick,
} = require('../Controller/banner.controller');

// Public endpoint - Get active banner for mobile app
router.get('/active', getActiveBanner);

// Admin endpoints
router.get('/', protect, isAdmin, getAllBanners);
router.post('/', protect, isAdmin, upload.single('image'), createBanner);
router.put('/:id', protect, isAdmin, upload.single('image'), updateBanner);
router.delete('/:id', protect, isAdmin, deleteBanner);

// Analytics endpoint
router.post('/:id/click', trackBannerClick);

module.exports = router;
