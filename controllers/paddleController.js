//This module is live now
const { Paddle, Environment } = require('@paddle/paddle-node-sdk');
const Clinic = require('../models/Clinic');
const User = require('../models/User'); // Para obtener el email del admin
const {
    sendSubscriptionActiveEmail,
    sendSubscriptionCancelledEmail
} = require('../utils/emailService');

// Inicializar Paddle
// Nota: Environment.sandbox para pruebas, production para live. 
// Idealmente controlar esto con una variable de entorno NODE_ENV o PADDLE_ENV
const isPaddleProd = process.env.PADDLE_ENV === 'production';

const paddle = new Paddle(process.env.PADDLE_API_KEY, {
    environment: isPaddleProd
        ? Environment.production
        : Environment.sandbox
})

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
        console.warn('⚠️ Webhook recibido sin firma');
        return res.status(401).send('No signature provided');
    }

    try {
        // IMPORTANTE: Paddle requiere el body RAW (string) para verificar la firma
        const bodyToCheck = req.rawBody;

        if (!bodyToCheck) {
            console.error('❌ Error: no se encontró req.rawBody. Revisa la configuración de express.json en server.js');
            // Intentar con JSON.stringify como fallback desesperado, pero probablemente fallará la firma
            const fallbackBody = JSON.stringify(req.body);
            await paddle.webhooks.unmarshal(fallbackBody, process.env.PADDLE_WEBHOOK_SECRET_KEY, signature);
        }

        const event = await paddle.webhooks.unmarshal(bodyToCheck, process.env.PADDLE_WEBHOOK_SECRET_KEY, signature);
        const eventData = event.data;

        console.log(`🔔 Webhook verificado: ${event.eventType}`);

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
                await handleSubscriptionActivated(eventData);
                break;
            default:
                console.log(`ℹ️ Evento ${event.eventType} no manejado explícitamente.`);
                break;
        }

        res.status(200).send('Webhook processed');
    } catch (error) {
        console.error('❌ Error verificando firma de Paddle:', error.message);
        // Si falló la firma, es posible que el body haya sido modificado por un middleware
        res.status(400).send('Signature verification failed');
    }
};

async function handleSubscriptionCreated(sub) {
    console.log(`🚀 Procesando handleSubscriptionCreated para: ${sub.id} (Status: ${sub.status})`);

    // ---------------------------------------------------------
    // LÓGICA DE VINCULACIÓN DE CLÍNICA
    // ---------------------------------------------------------
    let clinicId = sub.customData?.clinicId;
    let userEmail = null;

    if (!clinicId) {
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

    const priceId = sub.items[0]?.price?.id;
    const planName = getPlanNameFromPriceId(priceId);
    const planSlug = getPlanSlugFromPriceId(priceId);

    if (!userEmail) {
        const clinic = await Clinic.findById(clinicId).populate('adminId');
        if (clinic && clinic.adminId) userEmail = clinic.adminId.email;
    }

    // Actualizar DB de la clínica
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

    if (sub.status === 'active') {
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
    // Calcular la fecha de fin
    const endDate = sub.scheduledChange?.effectiveAt || sub.currentBillingPeriod?.endsAt;

    // Verificar si ya expiró (o si no tiene fecha, lo cual indica cancelación inmediata)
    const isExpired = !endDate || new Date(endDate) <= new Date();

    const updateData = {
        subscriptionStatus: isExpired ? 'active' : 'canceled',
        subscriptionEndDate: endDate
    };

    // Si ya expiró, cambiamos el plan a 'free' en la base de datos de una vez
    if (isExpired) {
        updateData.plan = 'free';
    }

    const clinic = await Clinic.findOneAndUpdate(
        { paddleSubscriptionId: sub.id },
        updateData,
        { new: true }
    ).populate('adminId');

    await sendSubscriptionCancelledEmail(clinic.adminId.email, clinic.adminId.name, clinic.subscriptionEndDate);
}

// Generar sesión de portal de cliente
exports.createPortalSession = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);
        const clinic = await Clinic.findById(user.clinicId);

        console.log('🔍 Datos de la clínica:', {
            clinicId: clinic?._id,
            paddleCustomerId: clinic?.paddleCustomerId,
            paddleSubscriptionId: clinic?.paddleSubscriptionId
        });

        if (!clinic || !clinic.paddleCustomerId) {
            return res.status(400).json({ error: "No hay una suscripción activa vinculada a Paddle." });
        }

        // Crear sesión del portal del cliente
        const session = await paddle.customerPortalSessions.create(clinic.paddleCustomerId);

        const portalUrl = session.urls?.general?.overview;

        console.log('✅ Sesión del portal creada:', {
            customerId: clinic.paddleCustomerId,
            portalUrl: portalUrl
        });

        res.json({ url: portalUrl });

    } catch (error) {
        console.error("❌ Error creando sesión de portal:", error);
        res.status(500).json({ error: "Error generando el enlace del portal." });
    }
};

// Actualizar suscripción (Upgrade/Downgrade)
// Actualizar suscripción (Upgrade/Downgrade)
exports.updateSubscription = async (req, res) => {
    try {
        const { newPriceId } = req.body;
        const user = await User.findById(req.user._id);
        const clinic = await Clinic.findById(user.clinicId);

        if (!newPriceId) {
            return res.status(400).json({ error: "newPriceId es requerido." });
        }

        if (!clinic?.paddleSubscriptionId) {
            return res.status(400).json({ error: 'No active subscription' });
        }

        // Si el cliente quiere "Free", eso significa CANCELAR la suscripción de pago.
        // El frontend debe enviar 'free' o un identificador, pero si envía priceId vacío, ya lo catcheamos arriba.
        // Si tienes un priceId específico para free en Paddle, úsalo. Si no, asumimos que "downgrade a free" es cancelar.
        if (newPriceId === 'free') {
            console.log(`📉 Downgrade a FREE solicitado para ${clinic.paddleSubscriptionId}. Cancelando al final del período.`);
            await paddle.subscriptions.cancel(clinic.paddleSubscriptionId, { effectiveFrom: 'next_billing_period' });
            return res.json({
                success: true,
                message: "Tu plan cambiará a Free al finalizar el ciclo de facturación actual.",
                url: null
            });
        }

        const currentSub = await paddle.subscriptions.get(clinic.paddleSubscriptionId);
        const currentItem = currentSub.items[0];

        const currentPrice = currentItem.price.unitPrice.amount;
        // Obtenemos precio nuevo para log y decisión (aunque transactions lo maneja)
        const newPriceData = await paddle.prices.get(newPriceId);
        const newPrice = newPriceData.unitPrice.amount;

        const isUpgrade = Number(newPrice) > Number(currentPrice);

        console.log(
            `${isUpgrade ? '📈 Upgrade' : '📉 Downgrade'} detectado: ${currentPrice} → ${newPrice}.`
        );

        if (isUpgrade) {
            // UPGRADE: Requiere pago inmediato de la diferencia. Creamos Checkout.
            // Para upgrades, el default de Paddle suele ser prorrateo inmediato.
            // No enviamos billingDetails porque causa error si no es para Invoice.
            const transaction = await paddle.transactions.create({
                customerId: clinic.paddleCustomerId,
                subscriptionId: clinic.paddleSubscriptionId,
                items: [
                    {
                        priceId: newPriceId,
                        quantity: currentItem.quantity
                    }
                ],
                collectionMode: 'automatic' // Habilita checkout
            });

            // Obtener URL de checkout
            let checkoutUrl = null;
            if (transaction.checkout && transaction.checkout.url) {
                checkoutUrl = transaction.checkout.url;
            } else if (transaction.details?.checkout?.url) {
                checkoutUrl = transaction.details.checkout.url;
            }

            if (checkoutUrl) {
                return res.json({ url: checkoutUrl });
            } else {
                console.warn("Transacción de upgrade creada sin URL:", transaction.id);
                return res.json({ transactionId: transaction.id });
            }
        } else {
            // DOWNGRADE: Aplicar al siguiente ciclo. No requiere pago inmediato.
            // Usamos update directo para agendar el cambio.
            await paddle.subscriptions.update(clinic.paddleSubscriptionId, {
                items: [
                    {
                        priceId: newPriceId,
                        quantity: currentItem.quantity
                    }
                ],
                prorationBillingMode: 'prorated_next_billing_period'
            });

            return res.json({
                success: true,
                message: "Plan actualizado. El cambio se aplicará al finalizar el ciclo de facturación actual.",
                url: null
            });
        }


    } catch (err) {
        console.error('❌ Error generando checkout de actualización:', err);
        res.status(500).json({ error: err.message });
    }
};

