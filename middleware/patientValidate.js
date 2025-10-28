const { body, validationResult } = require('express-validator');

const validate = {};

validate.patientValidationRules = () => {
  return [
    body('name').notEmpty().withMessage('Name is required'),
    body('age').isInt({ min: 0 }).withMessage('Age must be a positive integer'),
    body('email').isEmail().withMessage('Email is not valid'),
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
