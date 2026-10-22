const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const ApiError = require('../utils/api-error');

/**
 * Process, resize, and compress image buffer to WebP with sRGB color profile
 */
const processImage = async (file, { folder, maxWidth, maxHeight, quality = 80 }) => {
    const uploadDir = path.join(__dirname, `../../uploads/${folder}`);
    await fs.promises.mkdir(uploadDir, { recursive: true });

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const filename = `${folder}-${uniqueSuffix}.webp`;
    const filePath = path.join(uploadDir, filename);

    try {
        await sharp(file.buffer)
            .rotate() // Auto-orient based on smartphone camera EXIF tags
            .toColorspace('srgb') // Fix CMYK / wide-gamut color shift to standard sRGB
            .resize({
                width: maxWidth,
                height: maxHeight,
                fit: 'inside',
                withoutEnlargement: true
            })
            .webp({
                quality,
                effort: 4
            })
            .toFile(filePath);

        const stat = await fs.promises.stat(filePath);

        // Update file metadata for controllers and services
        file.filename = filename;
        file.path = filePath;
        file.mimetype = 'image/webp';
        file.size = stat.size;

        // Free memory buffer immediately for GC
        file.buffer = null;
        delete file.buffer;

        return file;
    } catch (err) {
        // Clean up partial file on failure
        if (fs.existsSync(filePath)) {
            try {
                await fs.promises.unlink(filePath);
            } catch (_) {}
        }
        throw err;
    }
};

/**
 * Creates a secure Multer upload middleware with automated image compression
 */
const createUploader = ({
    folder = 'products',
    fieldName = 'image',
    allowedMimePattern = /^image\/(jpeg|png|webp)$/,
    allowedExtPattern = /\.(jpe?g|png|webp)$/i,
    maxFileSizeMb = 5,
    maxWidth = 800,
    maxHeight = 800,
    quality = 80
}) => {
    const storage = multer.memoryStorage();

    const fileFilter = (req, file, cb) => {
        const isMimeValid = allowedMimePattern.test(file.mimetype);
        const isExtValid = allowedExtPattern.test(path.extname(file.originalname));

        // Strict validation: BOTH mimetype AND extension must match valid image types
        if (isMimeValid && isExtValid) {
            cb(null, true);
        } else {
            cb(
                ApiError.badRequest(
                    'Invalid file type. Only JPEG (.jpg, .jpeg), PNG (.png), and WEBP (.webp) images are allowed!'
                ),
                false
            );
        }
    };

    const upload = multer({
        storage,
        limits: { fileSize: maxFileSizeMb * 1024 * 1024 },
        fileFilter
    }).single(fieldName);

    return (req, res, next) => {
        upload(req, res, async (err) => {
            if (err) return next(err);
            if (!req.file) return next();

            try {
                await processImage(req.file, { folder, maxWidth, maxHeight, quality });
                next();
            } catch (processError) {
                next(ApiError.badRequest(`Failed to process and compress image: ${processError.message}`));
            }
        });
    };
};

// Store Logo uploader (max 3MB input, resized to max 500x500 WebP, quality 85)
const uploadLogo = createUploader({
    folder: 'logo',
    fieldName: 'logo',
    maxFileSizeMb: 3,
    maxWidth: 500,
    maxHeight: 500,
    quality: 85
});

// Product Image uploader (max 5MB input, resized to max 800x800 WebP, quality 80)
const uploadProductImage = createUploader({
    folder: 'products',
    fieldName: 'image',
    maxFileSizeMb: 5,
    maxWidth: 800,
    maxHeight: 800,
    quality: 80
});

module.exports = {
    createUploader,
    uploadLogo,
    uploadProductImage
};
