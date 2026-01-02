const { Paddle, Environment } = require('@paddle/paddle-node-sdk');
const Clinic = require('../models/Clinic');
const User = require('../models/User'); // Para obtener el email del admin
const {
    sendTrialStartedEmail,
    sendSubscriptionActiveEmail,
    sendSubscriptionCancelledEmail
} = require('../utils/emailService');

// Inicializar Paddle
// Nota: Environment.sandbox para pruebas, production para live. 
// Idealmente controlar esto con una variable de entorno NODE_ENV o PADDLE_ENV
const paddle = new Paddle(process.env.PADDLE_API_KEY, {
    environment: process.env.NODE_ENV === 'production' ? Environment.production : Environment.sandbox
});

// Map de Price IDs a Nombres de Plan (Para guardar en DB)
const getPlanNameFromPriceId = (priceId) => {
    const prices = {
        [process.env.PADDLE_PRICE_ID_PRO_TRIAL]: 'Clinic Pro',
        [process.env.PADDLE_PRICE_ID_PRO_INSTANT]: 'Clinic Pro',
        [process.env.PADDLE_PRICE_ID_PLUS_TRIAL]: 'Clinic Plus',
        [process.env.PADDLE_PRICE_ID_PLUS_INSTANT]: 'Clinic Plus'
    };
    return prices[priceId] || 'Unknown Plan';
};

// Map de Price IDs a slugs internos (opcional, para lógica de negocio)
const getPlanSlugFromPriceId = (priceId) => {
    if ([process.env.PADDLE_PRICE_ID_PRO_TRIAL, process.env.PADDLE_PRICE_ID_PRO_INSTANT].includes(priceId)) return 'clinic_pro';
    if ([process.env.PADDLE_PRICE_ID_PLUS_TRIAL, process.env.PADDLE_PRICE_ID_PLUS_INSTANT].includes(priceId)) return 'clinic_plus';
    return 'free';
};

exports.handleWebhook = async (req, res) => {
    const signature = req.headers['paddle-signature'];

    if (!signature) {
        return res.status(401).send('No signature provided');
    }

    try {
        const bodyToCheck = req.rawBody || req.body;

        const event = await paddle.webhooks.unmarshal(bodyToCheck, process.env.PADDLE_WEBHOOK_SECRET_KEY, signature);
        const eventData = event.data;

        console.log(`🔔 Webhook recibido: ${event.eventType}`);

        switch (event.eventType) {
            case 'subscription.created':
                await handleSubscriptionCreated(eventData);
                break;
            case 'subscription.updated':
                await handleSubscriptionUpdated(eventData);
                break;
            case 'subscription.canceled':
                await handleSubscriptionCanceled(eventData);
                break;
            case 'subscription.activated':
                await handleSubscriptionActivated(eventData); // Trial convertido a paid
                break;
            default:
                if (event.eventType.startsWith('transaction.') || event.eventType.startsWith('address.') || event.eventType.startsWith('customer.') || event.eventType.startsWith('business.')) {
                    //console.log(`Evento ${event.eventType} ignorado.`);
                } else {
                    console.log(`Evento ${event.eventType} no manejado explícitamente.`);
                }
        }

        res.status(200).send('Webhook processed');
    } catch (error) {
        console.error('❌ Error processing webhook:', error);
        res.status(500).send('Error processing webhook');
    }
};

async function handleSubscriptionCreated(sub) {
    // Buscar clínica por email del cliente (Paddle customer email)
    // O usar el `custom_data` si lo pasamos desde el frontend (recomendado).
    // Asumamos que el frontend pasa { clinicId: '...' } en custom_data.
    let clinicId = sub.customData?.clinicId;
    let userEmail = null;

    // Si no hay customData, intentamos buscar el usuario dueño por email
    if (!clinicId) {
        // Esto requiere una llamada a la API de Paddle para obtener el Customer completo si `sub` no tiene el email directo
        // `sub` tiene `customerId`.
        try {
            const customer = await paddle.customers.get(sub.customerId);
            userEmail = customer.email;
            const user = await User.findOne({ email: userEmail });
            if (user) clinicId = user.clinicId;
        } catch (e) {
            console.error("Error fetching customer", e);
        }
    }

    if (!clinicId) {
        console.error("⚠️ No se pudo vincular la suscripción a una clínica. Falta clinicId.");
        return;
    }

    const priceId = sub.items[0]?.price?.id; // Asumimos 1 item
    const planName = getPlanNameFromPriceId(priceId);
    const planSlug = getPlanSlugFromPriceId(priceId);

    // Buscar admin nombre para email
    if (!userEmail) {
        const clinic = await Clinic.findById(clinicId).populate('adminId');
        if (clinic && clinic.adminId) userEmail = clinic.adminId.email;
    }

    // Actualizar DB
    await Clinic.findByIdAndUpdate(clinicId, {
        paddleCustomerId: sub.customerId,
        paddleSubscriptionId: sub.id,
        subscriptionStatus: sub.status, // 'trialing' or 'active'
        plan: planSlug,
        subscriptionEndDate: sub.currentBillingPeriod?.endsAt || sub.nextBilledAt
    });

    // Enviar correos
    const user = await User.findOne({ email: userEmail });
    const userName = user ? user.name : 'Usuario';

    if (sub.status === 'trialing') {
        await sendTrialStartedEmail(userEmail, userName, planName);
    } else if (sub.status === 'active') {
        await sendSubscriptionActiveEmail(userEmail, userName, planName);
    }
}

async function handleSubscriptionUpdated(sub) {
    // Actualizar estado y fecha
    const priceId = sub.items[0]?.price?.id;
    const planSlug = getPlanSlugFromPriceId(priceId);

    await Clinic.updateOne(
        { paddleSubscriptionId: sub.id },
        {
            subscriptionStatus: sub.status,
            plan: planSlug,
            subscriptionEndDate: sub.currentBillingPeriod?.endsAt || sub.nextBilledAt
        }
    );
}

async function handleSubscriptionActivated(sub) {
    // Trial terminó y se cobró, o suscripción pausada se reactivó.
    const priceId = sub.items[0]?.price?.id;
    const planName = getPlanNameFromPriceId(priceId);

    // Actualizar DB
    const clinic = await Clinic.findOneAndUpdate(
        { paddleSubscriptionId: sub.id },
        {
            subscriptionStatus: 'active',
            subscriptionEndDate: sub.currentBillingPeriod?.endsAt || sub.nextBilledAt
        },
        { new: true }
    ).populate('adminId');

    if (clinic && clinic.adminId) {
        await sendSubscriptionActiveEmail(clinic.adminId.email, clinic.adminId.name, planName);
    }
}

async function handleSubscriptionCanceled(sub) {
    // Cuando se cancela una suscripción, marcamos el estado como 'canceled'
    // pero NO cambiamos el campo 'plan'. El usuario mantendrá acceso a las
    // funcionalidades de su plan hasta que expire subscriptionEndDate.
    // La función helper getActivePlan() determinará el plan efectivo.

    const clinic = await Clinic.findOneAndUpdate(
        { paddleSubscriptionId: sub.id },
        {
            subscriptionStatus: 'canceled',
            // Guardar la fecha hasta la cual el usuario tiene acceso pagado
            subscriptionEndDate: sub.scheduledChange?.effectiveAt || sub.currentBillingPeriod?.endsAt
        },
        { new: true }
    ).populate('adminId');

    if (clinic && clinic.adminId) {
        await sendSubscriptionCancelledEmail(clinic.adminId.email, clinic.adminId.name, clinic.subscriptionEndDate);
    }
}

// Generar sesión de portal de cliente
exports.createPortalSession = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);
        const clinic = await Clinic.findById(user.clinicId);

        if (!clinic || !clinic.paddleCustomerId) {
            return res.status(400).json({ error: "No hay una suscripción activa vinculada a Paddle." });
        }

        const session = await paddle.customerPortalSessions.create(clinic.paddleCustomerId, {
            customerIds: [clinic.paddleCustomerId],
            returnUrl: process.env.FRONTEND_URL
        });
        console.log(customerIds);

        // session.urls.general es la URL de acceso
        res.json({ url: session.urls.general });
        console.log(session.urls.general);

    } catch (error) {
        console.error("Error creando sesión de portal:", error);
        res.status(500).json({ error: "Error generando el enlace del portal." });
    }
};
