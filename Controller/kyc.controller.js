const { Op } = require('sequelize');
const { sequelize } = require('../Config/DB');
const KycRequest = require('../Models/kycRequest.model');
const User = require('../Models/user.model');
const uploadToCloudinary = require('../utils/uploadToCloudinary');

const ALLOWED_ADMIN_STATUSES = ['verified', 'rejected'];
const ALLOWED_FILTER_STATUSES = ['under_review', 'verified', 'rejected'];
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

const getFirstUploadedFile = (files, fieldNames) => {
    for (const fieldName of fieldNames) {
        const candidate = files?.[fieldName];
        if (Array.isArray(candidate) && candidate.length > 0) {
            return candidate[0];
        }
    }

    return null;
};

const formatKyc = (kyc) => ({
    id: kyc.id,
    userId: kyc.user_id,
    fullName: kyc.full_name,
    idPassportNumber: kyc.id_passport_number,
    idFrontImageUrl: kyc.id_front_image_url,
    idBackImageUrl: kyc.id_back_image_url,
    status: kyc.status,
    rejectionReason: kyc.rejection_reason,
    submittedAt: kyc.submitted_at,
    reviewedAt: kyc.reviewed_at,
    reviewedBy: kyc.reviewed_by,
    createdAt: kyc.createdAt,
    updatedAt: kyc.updatedAt,
    user: kyc.user
        ? {
            id: kyc.user.id,
            fullName: kyc.user.full_name,
            email: kyc.user.email,
            phoneNumber: kyc.user.phone_number,
            isKycVerified: !!kyc.user.is_kyc_verified
        }
        : null,
    reviewedByUser: kyc.reviewedByUser
        ? {
            id: kyc.reviewedByUser.id,
            fullName: kyc.reviewedByUser.full_name,
            email: kyc.reviewedByUser.email
        }
        : null
});

const getMyKycStatus = async (req, res) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        const user = await User.findByPk(userId, {
            attributes: ['id', 'is_kyc_verified']
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const kyc = await KycRequest.findOne({
            where: { user_id: userId }
        });

        if (!kyc) {
            return res.status(200).json({
                message: 'KYC status fetched successfully',
                data: {
                    status: 'pending',
                    hasSubmitted: false,
                    isKycVerified: false,
                    rejectionReason: null,
                    submittedAt: null,
                    reviewedAt: null
                }
            });
        }

        return res.status(200).json({
            message: 'KYC status fetched successfully',
            data: {
                status: kyc.status,
                hasSubmitted: true,
                isKycVerified: !!user.is_kyc_verified,
                rejectionReason: kyc.rejection_reason,
                submittedAt: kyc.submitted_at,
                reviewedAt: kyc.reviewed_at,
                idFrontImageUrl: kyc.id_front_image_url,
                idBackImageUrl: kyc.id_back_image_url
            }
        });
    } catch (error) {
        console.error('Error fetching my KYC status:', error);
        return res.status(500).json({ message: 'Error fetching KYC status', error: error.message });
    }
};

const submitKyc = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const userId = req.user?.id;
        const fullName = req.body?.fullName ?? req.body?.full_name;
        const idPassportNumber =
            req.body?.idPassportNumber ??
            req.body?.id_passport_number ??
            req.body?.idNumber ??
            req.body?.id_number;
        const frontImage = getFirstUploadedFile(req.files, KYC_FRONT_IMAGE_FIELDS);
        const backImage = getFirstUploadedFile(req.files, KYC_BACK_IMAGE_FIELDS);

        if (!userId) {
            await transaction.rollback();
            return res.status(401).json({ message: 'User not authenticated' });
        }

        if (!fullName || !idPassportNumber) {
            await transaction.rollback();
            return res.status(400).json({
                message: 'Full legal name and ID/Passport number are required'
            });
        }

        if (!frontImage || !backImage) {
            await transaction.rollback();
            return res.status(400).json({
                message: 'Both front and back ID images are required'
            });
        }

        const sanitizedFullName = String(fullName).trim();
        const sanitizedIdPassportNumber = String(idPassportNumber).trim();

        if (sanitizedFullName.length < 3 || sanitizedFullName.length > 150) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Full legal name must be between 3 and 150 characters' });
        }

        if (sanitizedIdPassportNumber.length < 3 || sanitizedIdPassportNumber.length > 120) {
            await transaction.rollback();
            return res.status(400).json({ message: 'ID/Passport number must be between 3 and 120 characters' });
        }

        const user = await User.findByPk(userId, { transaction });
        if (!user) {
            await transaction.rollback();
            return res.status(404).json({ message: 'User not found' });
        }

        const existingKyc = await KycRequest.findOne({
            where: { user_id: userId },
            transaction
        });

        if (existingKyc?.status === 'under_review') {
            await transaction.rollback();
            return res.status(409).json({
                message: 'KYC is already under review'
            });
        }

        if (existingKyc?.status === 'verified') {
            await transaction.rollback();
            return res.status(409).json({
                message: 'KYC is already verified'
            });
        }

        const [frontUpload, backUpload] = await Promise.all([
            uploadToCloudinary(frontImage.buffer, 'kyc/front'),
            uploadToCloudinary(backImage.buffer, 'kyc/back')
        ]);

        const commonPayload = {
            full_name: sanitizedFullName,
            id_passport_number: sanitizedIdPassportNumber,
            id_front_image_url: frontUpload.secure_url,
            id_back_image_url: backUpload.secure_url,
            status: 'under_review',
            rejection_reason: null,
            submitted_at: new Date(),
            reviewed_at: null,
            reviewed_by: null
        };

        let kycRequest;
        if (existingKyc) {
            await existingKyc.update(commonPayload, { transaction });
            kycRequest = existingKyc;
        } else {
            kycRequest = await KycRequest.create(
                {
                    user_id: userId,
                    ...commonPayload
                },
                { transaction }
            );
        }

        user.is_kyc_verified = false;
        await user.save({ transaction });

        await transaction.commit();

        return res.status(201).json({
            message: 'KYC submitted successfully and is now under review',
            data: {
                id: kycRequest.id,
                status: 'under_review',
                submittedAt: kycRequest.submitted_at
            }
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error submitting KYC:', error);
        return res.status(500).json({ message: 'Error submitting KYC', error: error.message });
    }
};

const getAllKycRequests = async (req, res) => {
    try {
        const { status, search = '', page = 1, limit = 20 } = req.query;
        const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
        const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
        const offset = (parsedPage - 1) * parsedLimit;

        const where = {};
        if (status && ALLOWED_FILTER_STATUSES.includes(status)) {
            where.status = status;
        }

        if (search) {
            where[Op.or] = [
                { full_name: { [Op.like]: `%${search}%` } },
                { id_passport_number: { [Op.like]: `%${search}%` } },
                { '$user.full_name$': { [Op.like]: `%${search}%` } },
                { '$user.email$': { [Op.like]: `%${search}%` } },
                { '$user.phone_number$': { [Op.like]: `%${search}%` } }
            ];
        }

        const { count, rows } = await KycRequest.findAndCountAll({
            where,
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'full_name', 'email', 'phone_number', 'is_kyc_verified'],
                    required: false
                },
                {
                    model: User,
                    as: 'reviewedByUser',
                    attributes: ['id', 'full_name', 'email'],
                    required: false
                }
            ],
            order: [
                ['status', 'ASC'],
                ['submitted_at', 'DESC']
            ],
            offset,
            limit: parsedLimit,
            distinct: true
        });

        const statsResults = await KycRequest.findAll({
            attributes: [
                'status',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            group: ['status'],
            raw: true
        });

        const stats = {
            underReview: 0,
            verified: 0,
            rejected: 0,
            total: count
        };

        statsResults.forEach((row) => {
            if (row.status === 'under_review') stats.underReview = parseInt(row.count, 10) || 0;
            if (row.status === 'verified') stats.verified = parseInt(row.count, 10) || 0;
            if (row.status === 'rejected') stats.rejected = parseInt(row.count, 10) || 0;
        });

        return res.status(200).json({
            message: 'KYC requests fetched successfully',
            data: {
                requests: rows.map(formatKyc),
                stats,
                pagination: {
                    currentPage: parsedPage,
                    totalPages: Math.ceil(count / parsedLimit),
                    totalItems: count,
                    itemsPerPage: parsedLimit
                }
            }
        });
    } catch (error) {
        console.error('Error fetching KYC requests:', error);
        return res.status(500).json({ message: 'Error fetching KYC requests', error: error.message });
    }
};

const reviewKycRequest = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const adminId = req.user?.id;
        const { kycId } = req.params;
        const { status, rejectionReason } = req.body;

        if (!adminId) {
            await transaction.rollback();
            return res.status(401).json({ message: 'Admin not authenticated' });
        }

        if (!status || !ALLOWED_ADMIN_STATUSES.includes(status)) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Invalid status. Use verified or rejected' });
        }

        if (status === 'rejected' && !String(rejectionReason || '').trim()) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Rejection reason is required when rejecting KYC' });
        }

        const kyc = await KycRequest.findByPk(kycId, {
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'full_name', 'email', 'phone_number', 'is_kyc_verified']
                }
            ],
            transaction
        });

        if (!kyc) {
            await transaction.rollback();
            return res.status(404).json({ message: 'KYC request not found' });
        }

        const user = await User.findByPk(kyc.user_id, { transaction });
        if (!user) {
            await transaction.rollback();
            return res.status(404).json({ message: 'KYC request user not found' });
        }

        kyc.status = status;
        kyc.rejection_reason = status === 'rejected' ? String(rejectionReason).trim() : null;
        kyc.reviewed_at = new Date();
        kyc.reviewed_by = adminId;
        await kyc.save({ transaction });

        user.is_kyc_verified = status === 'verified';
        await user.save({ transaction });

        await transaction.commit();

        const updatedKyc = await KycRequest.findByPk(kyc.id, {
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'full_name', 'email', 'phone_number', 'is_kyc_verified']
                },
                {
                    model: User,
                    as: 'reviewedByUser',
                    attributes: ['id', 'full_name', 'email'],
                    required: false
                }
            ]
        });

        return res.status(200).json({
            message: status === 'verified' ? 'KYC verified successfully' : 'KYC rejected successfully',
            data: updatedKyc ? formatKyc(updatedKyc) : null
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error reviewing KYC request:', error);
        return res.status(500).json({ message: 'Error reviewing KYC request', error: error.message });
    }
};

module.exports = {
    getMyKycStatus,
    submitKyc,
    getAllKycRequests,
    reviewKycRequest
};
