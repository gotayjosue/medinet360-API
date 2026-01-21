const { body, validationResult } = require('express-validator');

const validate = {};

validate.patientValidationRules = () => {
  return [
    body('name').notEmpty().withMessage('dashboard.patients.messages.errors.no_name'),
    body('lastName').notEmpty().withMessage('dashboard.patients.messages.errors.no_lastName'),
    body('email')
    .optional({ checkFalsy: true })
    .isEmail().withMessage('dashboard.patients.messages.errors.invalid_email'),
    body('phone').notEmpty().withMessage('dashboard.patients.messages.errors.no_phone'),
    body('birthday')
    .notEmpty().withMessage('dashboard.patients.messages.errors.no_birthday')
    .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('dashboard.patients.messages.errors.invalid_birthday'),
    body('gender')
    .notEmpty().withMessage('dashboard.patients.messages.errors.no_gender')
    .trim()
    .toLowerCase()
    .isIn(['male', 'female']).withMessage('dashboard.patients.messages.errors.invalid_gender'),
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
