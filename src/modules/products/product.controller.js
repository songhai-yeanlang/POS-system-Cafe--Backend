const fs = require('fs');
const productService = require('./product.service');
const ApiError = require('../../utils/api-error');


const getAllCategories = async (req, res, next) => {
    try {
        const categories = await productService.getAllCategories(req.query);
        res.status(200).json({
            success: true,
            message: 'Categories retrieved successfully',
            data: categories
        });
    } catch (error) {
        next(error);
    }
};

const getCategoryById = async (req, res, next) => {
    try {
        const category = await productService.getCategoryById(req.params.id);
        res.status(200).json({
            success: true,
            message: 'Category retrieved successfully',
            data: category
        });
    } catch (error) {
        next(error);
    }
};

const createCategory = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const newCategory = await productService.createCategory({
            ...req.body,
            creatorId: req.user?.id,
            ipAddress
        });

        res.status(201).json({
            success: true,
            message: 'Category created successfully',
            data: newCategory
        });
    } catch (error) {
        next(error);
    }
};

const updateCategory = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const updatedCategory = await productService.updateCategory({
            id: req.params.id,
            updateData: req.body,
            updaterId: req.user?.id,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: 'Category updated successfully',
            data: updatedCategory
        });
    } catch (error) {
        next(error);
    }
};

const deleteCategory = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        await productService.deleteCategory({
            id: req.params.id,
            deleterId: req.user?.id,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: 'Category deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// PRODUCTS
// ==========================================

const getAllProducts = async (req, res, next) => {
    try {
        const result = await productService.getAllProducts(req.query);
        res.status(200).json({
            success: true,
            message: 'Products retrieved successfully',
            data: result.products,
            pagination: result.pagination
        });
    } catch (error) {
        next(error);
    }
};

const getProductById = async (req, res, next) => {
    try {
        const product = await productService.getProductById(req.params.id);
        res.status(200).json({
            success: true,
            message: 'Product retrieved successfully',
            data: product
        });
    } catch (error) {
        next(error);
    }
};

const createProduct = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const newProduct = await productService.createProduct({
            ...req.body,
            creatorId: req.user?.id,
            ipAddress
        });

        res.status(201).json({
            success: true,
            message: 'Product created successfully',
            data: newProduct
        });
    } catch (error) {
        next(error);
    }
};

const updateProduct = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const updatedProduct = await productService.updateProduct({
            id: req.params.id,
            updateData: req.body,
            updaterId: req.user?.id,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: 'Product updated successfully',
            data: updatedProduct
        });
    } catch (error) {
        next(error);
    }
};

const deleteProduct = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        await productService.deleteProduct({
            id: req.params.id,
            deleterId: req.user?.id,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: 'Product deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};

const uploadProductImage = async (req, res, next) => {
    try {
        if (!req.file) {
            throw ApiError.badRequest('Please attach a product image file (field name: "image")');
        }

        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const updatedProduct = await productService.updateProductImage({
            id: req.params.id,
            imageFilename: req.file.filename,
            updaterId: req.user?.id,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: 'Product image uploaded successfully',
            data: updatedProduct
        });
    } catch (error) {
        if (req.file?.path && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (_) {}
        }
        next(error);
    }
};

const deleteProductImage = async (req, res, next) => {
    try {
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const updatedProduct = await productService.deleteProductImage({
            id: req.params.id,
            deleterId: req.user?.id,
            ipAddress
        });

        res.status(200).json({
            success: true,
            message: 'Product image deleted successfully',
            data: updatedProduct
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getAllCategories,
    getCategoryById,
    createCategory,
    updateCategory,
    deleteCategory,
    getAllProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    uploadProductImage,
    deleteProductImage
};



