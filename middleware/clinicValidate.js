const { body, validationResult } = require("express-validator");

const validate = {}

validate.clinicValidateRules = () => {
    return [
        body("name").notEmpty().withMessage("Name is required"),
        body("phone")
        .notEmpty().withMessage("Phone is required")
        .isMobilePhone().withMessage("Phone is not valid"),
        body("address").notEmpty().withMessage("Address is required"),
    ]
}

validate.clinicValidate = (req, res, next) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }
    next()
}

module.exports = validate;
