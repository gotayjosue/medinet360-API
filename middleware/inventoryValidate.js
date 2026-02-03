const { body, validationResult } = require('express-validator');

const validate = {};

validate.inventoryValidationRules = () => {
    return [
        body('name').notEmpty().withMessage('inventory.messages.errors.no_name'),
        body('quantity').optional().isNumeric().withMessage('inventory.messages.errors.invalid_quantity'),
        body('minStock').optional().isNumeric().withMessage('inventory.messages.errors.invalid_minStock'),
        body('price').optional().isNumeric().withMessage('inventory.messages.errors.invalid_price'),
        body('category').optional().isString().trim(),
        body('unit').optional().isString().trim(),
        body('sku').optional().isString().trim(),
        body('expirationDate').optional({ checkFalsy: true }).isISO8601().withMessage('inventory.messages.errors.invalid_expiration_date'),
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
