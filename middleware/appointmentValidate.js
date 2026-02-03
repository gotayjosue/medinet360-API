const { body, validationResult } = require('express-validator');

const validate = {};

validate.appointmentValidationRules = () => {
  return [
    body('patientId')
    .notEmpty().withMessage('dashboard.appointments.messages.errors.no_patient'),
    body('date')
    .notEmpty().withMessage('dashboard.appointments.messages.errors.no_date')
    .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('dashboard.appointments.messages.errors.invalid_date'),
    body('hour')
    .notEmpty().withMessage('dashboard.appointments.messages.errors.no_time'),
    body('duration')
    .notEmpty().withMessage('dashboard.appointments.messages.errors.no_duration')
    .isNumeric().withMessage('dashboard.appointments.messages.errors.invalid_duration'),
    body('status')
    .trim()
    .toLowerCase()
    .isIn(['scheduled', 'pending', 'completed', 'canceled']).withMessage('dashboard.appointments.messages.errors.invalid_status'),
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