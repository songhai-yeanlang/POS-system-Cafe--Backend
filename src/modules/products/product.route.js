const express = require('express');
const router = express.Router();
const productController = require('./product.controller');
const { 
    createCategorySchema, 
    getCategoryByIdSchema,
    updateCategorySchema, 
    deleteCategorySchema,
    getCategoriesQuerySchema,
    getProductsQuerySchema,
    getProductByIdSchema,
    deleteProductSchema,
    uploadProductImageSchema,
    deleteProductImageSchema,
    createProductSchema,
    updateProductSchema
} = require('./product.validation');
const { authenticate, authorize } = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');
const { uploadProductImage } = require('../../middlewares/upload');

// categories
router.get('/categories', authenticate, validate(getCategoriesQuerySchema), productController.getAllCategories);
router.get('/categories/:id', authenticate, validate(getCategoryByIdSchema), productController.getCategoryById);
router.post('/categories', authenticate, authorize('OWNER'), validate(createCategorySchema), productController.createCategory);
router.put('/categories/:id', authenticate, authorize('OWNER'), validate(updateCategorySchema), productController.updateCategory);
router.delete('/categories/:id', authenticate, authorize('OWNER'), validate(deleteCategorySchema), productController.deleteCategory);

// products
router.get('/products', authenticate, validate(getProductsQuerySchema), productController.getAllProducts);
router.get('/products/:id', authenticate, validate(getProductByIdSchema), productController.getProductById);
router.post('/products', authenticate, authorize('OWNER'), validate(createProductSchema), productController.createProduct);
router.put('/products/:id', authenticate, authorize('OWNER'), validate(updateProductSchema), productController.updateProduct);
router.delete('/products/:id', authenticate, authorize('OWNER'), validate(deleteProductSchema), productController.deleteProduct);
router.put('/products/:id/image', authenticate, authorize('OWNER'), validate(uploadProductImageSchema), uploadProductImage, productController.uploadProductImage);
router.delete('/products/:id/image', authenticate, authorize('OWNER'), validate(deleteProductImageSchema), productController.deleteProductImage);

module.exports = router;

