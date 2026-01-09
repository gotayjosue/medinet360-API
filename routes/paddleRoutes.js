const express = require('express');
const router = express.Router();
const paddleController = require('../controllers/paddleController');
const { requireAuth } = require('../middleware/requireAuth'); // Corregido ubicación

// Webhook endpoint
// Nota: En server.js debe asegurarse que el body llegue correctamente para firmar.
router.post('/webhook', paddleController.handleWebhook);

// Portal Session (Protegido)
router.post('/create-portal-session', requireAuth, paddleController.createPortalSession);

// Update Subscription (Upgrade/Downgrade)
router.post('/update-subscription', requireAuth, paddleController.updateSubscription);

module.exports = router;
