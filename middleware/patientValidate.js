const { body, validationResult } = require('express-validator');

const validate = {};

validate.patientValidationRules = () => {
  return [
    body('name').notEmpty().withMessage('Name is required'),
    body('lastName').notEmpty().withMessage('Last name is required'),
    body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Email is not valid'),
    body('phone').notEmpty().withMessage('Phone number is required'),
    body('birthday')
    .notEmpty('Birthday is required')
    .isDate('Birthday must be a valid date'),
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
