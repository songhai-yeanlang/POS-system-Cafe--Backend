const express = require('express');
const router = express.Router();

const userController = require('./user.controller');
const { 
    getUsersQuerySchema, 
    createUserSchema, 
    getUserByIdSchema, 
    updateUserSchema,
    deleteUserSchema 
} = require('./user.validation');
const { authenticate, authorize } = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');

router.get('/users', authenticate, authorize('OWNER'), validate(getUsersQuerySchema), userController.getAllUsers);
router.post('/users', authenticate, authorize('OWNER'), validate(createUserSchema), userController.createUser);
router.get('/users/:id', authenticate, authorize('OWNER'), validate(getUserByIdSchema), userController.getUserById);
router.put('/users/:id', authenticate, authorize('OWNER'), validate(updateUserSchema), userController.updateUser);
router.delete('/users/:id', authenticate, authorize('OWNER'), validate(deleteUserSchema), userController.deleteUser);

module.exports = router;