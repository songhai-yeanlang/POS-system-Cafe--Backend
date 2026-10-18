const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const validate = require('../../middlewares/validate');
const { loginSchema } = require('./auth.validation');

router.post('/login', validate(loginSchema), authController.login);

module.exports = router;