/**
 * Helper functions for subscription plan management
 */

/**
 * Determina el plan activo de una clínica considerando:
 * - Estado de suscripción (active, trialing, canceled)
 * - Fecha de expiración (subscriptionEndDate)
 * 
 * @param {Object} clinic - Documento de clínica de MongoDB
 * @returns {string} - 'free', 'clinic_pro', o 'clinic_plus'
 */
function getActivePlan(clinic) {
    if (!clinic) {
        return 'free';
    }

    const { subscriptionStatus, subscriptionEndDate, plan } = clinic;

    // Si el plan está activo o en período de prueba, retornar el plan actual
    if (subscriptionStatus === 'active' || subscriptionStatus === 'trialing') {
        return plan || 'free';
    }

    // Si el plan está cancelado, verificar si aún está dentro del período pagado
    if (subscriptionStatus === 'canceled') {
        // Si hay fecha de expiración y aún no ha pasado, mantener el plan actual
        if (subscriptionEndDate && new Date(subscriptionEndDate) > new Date()) {
            return plan || 'free';
        }
        // Si ya expiró, degradar a free
        return 'free';
    }

    // Para cualquier otro estado (past_due, paused, etc.), degradar a free
    return 'free';
}

module.exports = {
    getActivePlan
};
