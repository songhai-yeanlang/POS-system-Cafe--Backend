const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ApiError = require('../utils/api-error');

const createUploader = ({ folder = 'logo', allowedTypes = /jpeg|jpg|png|webp|svg\+xml/, maxFileSizeMb = 2 }) => {
    const uploadDir = path.join(__dirname, `../../uploads/${folder}`);
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, uploadDir);
        },
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
            cb(null, `${folder}-${uniqueSuffix}${ext}`);
        }
    });

    const fileFilter = (req, file, cb) => {
        const isMimeValid = allowedTypes.test(file.mimetype);
        const isExtValid = /\.(jpe?g|png|webp|svg)$/i.test(path.extname(file.originalname));

        if (isMimeValid || isExtValid) {
            cb(null, true);
        } else {
            cb(ApiError.badRequest('Invalid file type. Only JPEG, PNG, WEBP, and SVG images are allowed!'), false);
        }
    };

    return multer({
        storage,
        limits: { fileSize: maxFileSizeMb * 1024 * 1024 },
        fileFilter
    });
};

const uploadLogo = createUploader({ folder: 'logo', maxFileSizeMb: 2 }).single('logo');
const uploadProductImage = createUploader({ folder: 'products', maxFileSizeMb: 5 }).single('image');

module.exports = {
    createUploader,
    uploadLogo,
    uploadProductImage
};

