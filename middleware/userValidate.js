const { body, validationResult } = require('express-validator');

const validate = {};

validate.userValidationRules = () => {
  return [
    body('name').notEmpty().withMessage('Name is required'),
    body('name').matches(/^[a-zA-ZÀ-ÿ\s]+$/).withMessage('Name must contain only letters and spaces'),
    body('lastName').notEmpty().withMessage('Last name is required'),
    body('lastName').matches(/^[a-zA-ZÀ-ÿ\s]+$/).withMessage('Last name must contain only letters and spaces'),
    body('email').isEmail().withMessage('Email is not valid'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
    body('password').matches(/[@$!%*?&]/).withMessage('Password must contain at least one special character'),
    body('password').matches(/[0-9]/).withMessage('Password must contain at least one number'),
    body('password').matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter'),
    body('role').isIn(['doctor', 'assistant']).withMessage('Invalid role'),
  ];
};

validate.check = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

module.exports = validate;
