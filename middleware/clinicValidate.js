const { body, validationResult } = require("express-validator");

const validate = {}

validate.clinicValidateRules = () => {
  return [
    // NOMBRE DE LA CLÍNICA
    body("name")
      .trim()
      .notEmpty().withMessage("Clinic name is required")
      .isLength({ min: 3, max: 100 })
        .withMessage("Clinic name must be between 3 and 100 characters")
      .matches(/^[a-zA-ZÀ-ÿ0-9\s.&'-]+$/)
        .withMessage("Clinic name contains invalid characters"),

    // TELÉFONO
    body("phone")
      .trim()
      .notEmpty().withMessage("Clinic phone is required")
      .isNumeric().withMessage("Clinic phone must contain only numbers")
      .isLength({ min: 8, max: 15 })
        .withMessage("Clinic phone must be between 8 and 15 digits"),

    // DIRECCIÓN
    body("address")
      .trim()
      .notEmpty().withMessage("Clinic address is required")
      .isLength({ min: 5, max: 200 })
        .withMessage("Clinic address must be between 5 and 200 characters")
      .matches(/^[a-zA-ZÀ-ÿ0-9\s.,#-]+$/)
        .withMessage("Clinic address contains invalid characters"),
  ];
};

validate.check = (req, res, next) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }
    next()
}

module.exports = validate;
