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
    .notEmpty().withMessage('Birthday is required')
    .isISO8601().withMessage('Birthday must be a valid date'),
    body('gender')
    .notEmpty().withMessage('Gender is required')
    .trim()
    .toLowerCase()
    .isIn(['male', 'female']).withMessage('Gender must be "male" or "female"'),
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
