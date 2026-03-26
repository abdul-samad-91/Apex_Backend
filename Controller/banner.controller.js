const Banner = require('../Models/banner.model');
const User = require('../Models/user.model');
const uploadToCloudinary = require('../utils/uploadToCloudinary');
const { Op } = require('sequelize');

// Get active banner(s) for mobile app - PUBLIC ENDPOINT
const getActiveBanner = async (req, res) => {
    try {
        const currentDate = new Date();

        // Get all active banners within date range, ordered by priority
        const activeBanners = await Banner.findAll({
            where: {
                is_active: true,
                start_date: {
                    [Op.lte]: currentDate,
                },
                end_date: {
                    [Op.gte]: currentDate,
                },
            },
            order: [['priority', 'DESC']],
            limit: 1,
        });

        if (!activeBanners || activeBanners.length === 0) {
            return res.status(200).json({
                success: false,
                message: 'No active banner at the moment',
                data: null,
            });
        }

        const banner = activeBanners[0];

        // Increment impression count
        await banner.increment('impression_count');

        // Format response for mobile app
        res.status(200).json({
            success: true,
            data: {
                id: banner.id,
                title: banner.title,
                description: banner.description,
                image: banner.image_url,
                actionLink: banner.action_link,
                actionType: banner.action_type,
                duration: banner.duration_seconds,
            },
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

// Get all banners - ADMIN ONLY
const getAllBanners = async (req, res) => {
    try {
        const banners = await Banner.findAll({
            order: [['start_date', 'DESC']],
        });

        res.status(200).json({
            success: true,
            data: banners.map((banner) => ({
                id: banner.id,
                title: banner.title,
                description: banner.description,
                imageUrl: banner.image_url,
                actionLink: banner.action_link,
                actionType: banner.action_type,
                startDate: banner.start_date,
                endDate: banner.end_date,
                isActive: banner.is_active,
                priority: banner.priority,
                durationSeconds: banner.duration_seconds,
                clickCount: banner.click_count,
                impressionCount: banner.impression_count,
                createdBy: banner.created_by,
                createdAt: banner.created_at,
                updatedAt: banner.updated_at,
            })),
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

// Create banner - ADMIN ONLY
const createBanner = async (req, res) => {
    try {
        const {
            title,
            description,
            actionLink,
            actionType = 'none',
            startDate,
            endDate,
            isActive = true,
            priority = 1,
            durationSeconds = 3,
        } = req.body;

        // Validation
        if (!title || !startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'Title, startDate, and endDate are required',
            });
        }

        // Validate dates
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (start >= end) {
            return res.status(400).json({
                success: false,
                message: 'End date must be after start date',
            });
        }

        // Upload image if provided
        let imageUrl = null;

        if (req.file) {
            try {
                const cloudinaryResult = await uploadToCloudinary(
                    req.file.buffer
                );
                imageUrl = cloudinaryResult.secure_url;
            } catch (uploadError) {
                return res.status(400).json({
                    success: false,
                    message: 'Image upload failed: ' + uploadError.message,
                });
            }
        } else {
            return res.status(400).json({
                success: false,
                message: 'Banner image is required',
            });
        }

        // Create banner
        const banner = await Banner.create({
            title,
            description,
            image_url: imageUrl,
            action_link: actionLink,
            action_type: actionType,
            start_date: start,
            end_date: end,
            is_active: isActive,
            priority: parseInt(priority),
            duration_seconds: parseInt(durationSeconds),
            created_by: req.user.id,
        });

        res.status(201).json({
            success: true,
            message: 'Banner created successfully',
            data: {
                id: banner.id,
                title: banner.title,
                description: banner.description,
                imageUrl: banner.image_url,
                actionLink: banner.action_link,
                actionType: banner.action_type,
                startDate: banner.start_date,
                endDate: banner.end_date,
                isActive: banner.is_active,
                priority: banner.priority,
                durationSeconds: banner.duration_seconds,
                createdAt: banner.created_at,
            },
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

// Update banner - ADMIN ONLY
const updateBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title,
            description,
            actionLink,
            actionType,
            startDate,
            endDate,
            isActive,
            priority,
            durationSeconds,
        } = req.body;

        // Find banner
        const banner = await Banner.findByPk(id);

        if (!banner) {
            return res.status(404).json({
                success: false,
                message: 'Banner not found',
            });
        }

        // Handle image update if new one provided
        if (req.file) {
            try {
                const cloudinaryResult = await uploadToCloudinary(
                    req.file.buffer
                );
                banner.image_url = cloudinaryResult.secure_url;
            } catch (uploadError) {
                return res.status(400).json({
                    success: false,
                    message: 'Image upload failed: ' + uploadError.message,
                });
            }
        }

        // Update fields
        if (title) banner.title = title;
        if (description) banner.description = description;
        if (actionLink) banner.action_link = actionLink;
        if (actionType) banner.action_type = actionType;
        if (startDate) banner.start_date = new Date(startDate);
        if (endDate) banner.end_date = new Date(endDate);
        if (isActive !== undefined) banner.is_active = isActive;
        if (priority !== undefined) banner.priority = parseInt(priority);
        if (durationSeconds !== undefined) banner.duration_seconds = parseInt(durationSeconds);

        // Validate dates
        if (banner.start_date >= banner.end_date) {
            return res.status(400).json({
                success: false,
                message: 'End date must be after start date',
            });
        }

        await banner.save();

        res.status(200).json({
            success: true,
            message: 'Banner updated successfully',
            data: {
                id: banner.id,
                title: banner.title,
                description: banner.description,
                imageUrl: banner.image_url,
                actionLink: banner.action_link,
                actionType: banner.action_type,
                startDate: banner.start_date,
                endDate: banner.end_date,
                isActive: banner.is_active,
                priority: banner.priority,
                durationSeconds: banner.duration_seconds,
                updatedAt: banner.updated_at,
            },
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

// Delete banner - ADMIN ONLY
const deleteBanner = async (req, res) => {
    try {
        const { id } = req.params;

        const banner = await Banner.findByPk(id);

        if (!banner) {
            return res.status(404).json({
                success: false,
                message: 'Banner not found',
            });
        }

        await banner.destroy();

        res.status(200).json({
            success: true,
            message: 'Banner deleted successfully',
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

// Track banner click - OPTIONAL ANALYTICS
const trackBannerClick = async (req, res) => {
    try {
        const { id } = req.params;

        const banner = await Banner.findByPk(id);

        if (!banner) {
            return res.status(404).json({
                success: false,
                message: 'Banner not found',
            });
        }

        await banner.increment('click_count');

        res.status(200).json({
            success: true,
            message: 'Click tracked',
            data: {
                clickCount: banner.click_count + 1,
            },
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

module.exports = {
    getActiveBanner,
    getAllBanners,
    createBanner,
    updateBanner,
    deleteBanner,
    trackBannerClick,
};
