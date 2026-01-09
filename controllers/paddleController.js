//This module is live now
const { Paddle, Environment } = require('@paddle/paddle-node-sdk');
const Clinic = require('../models/Clinic');
const User = require('../models/User'); // Para obtener el email del admin
const TrialFingerprint = require('../models/TrialFingerprint');
const {
    sendTrialStartedEmail,
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
            case 'transaction.completed':
                await handleTransactionCompleted(eventData);
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
    // 🛡️ SEGURIDAD: PREVENCIÓN DE FRAUDE EN TRIALS (1 por tarjeta)
    // ---------------------------------------------------------
    let fingerprint = sub.paymentMethod?.card?.fingerprint;

    // Log para depuración
    console.log(`🔍 Debug Fingerprint - Inicio: paymentMethodId=${sub.paymentMethodId}, fingerprint=${fingerprint}`);

    // Si no viene en el webhook, intentamos obtener el método de pago desde la API
    if (!fingerprint && sub.paymentMethodId) {
        try {
            console.log('DEBUG: Fetching payment method with ID:', sub.paymentMethodId);
            const paymentMethod = await paddle.paymentMethods.get(sub.customerId, sub.paymentMethodId);
            console.log('DEBUG: Fetched paymentMethod result structure:', Object.keys(paymentMethod));

            if (paymentMethod.card) {
                fingerprint = paymentMethod.card.fingerprint;
            } else {
                console.log('DEBUG: Payment method is not a standard card object:', JSON.stringify(paymentMethod, null, 2));
                // Fallback o revisión de otros tipos
            }

            console.log(`🔍 Debug Fingerprint - Extraído tras API: ${fingerprint}`);
        } catch (e) {
            console.error("❌ Error recuperando método de pago para fingerprint:", e.message);
        }
    }

    // Si es un Trial, validamos que la tarjeta no haya sido usada antes
    if (sub.status === 'trialing') {
        if (!fingerprint) {
            console.warn("⚠️ Suscripción de trial sin fingerprint detectable. Procediendo con cautela...");
            console.warn("Dato completo de sub (limitado):", JSON.stringify({ id: sub.id, paymentMethodId: sub.paymentMethodId }, null, 2));
        } else {
            const fingerprintExists = await TrialFingerprint.findOne({ cardFingerprint: fingerprint });
            if (fingerprintExists) {
                console.error(`🚨 INTENTO DE FRAUDE: Tarjeta ${fingerprint} ya usó un trial. Cancelando suscripción ${sub.id}`);

                try {
                    await paddle.subscriptions.cancel(sub.id, { effectiveFrom: 'immediately' });
                } catch (err) {
                    console.error("Error al cancelar (effectiveFrom), intentando legacy:", err.message);
                    // Fallback just in case
                    await paddle.subscriptions.cancel(sub.id, { effectiveAt: 'immediately' }).catch(e => console.error("Final cancel fail:", e.message));
                }

                // No actualizamos la clínica ni mandamos email de bienvenida
                return;
            }
        }
    }

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

    // 🧠 Guardar registro del fingerprint para esta clínica (si existe)
    if (fingerprint) {
        await TrialFingerprint.findOneAndUpdate(
            { cardFingerprint: fingerprint },
            {
                cardFingerprint: fingerprint,
                clinicId: clinicId,
                subscriptionId: sub.id,
                firstUsedAt: new Date()
            },
            { upsert: true, new: true }
        );
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

    if (clinic && clinic.adminId) {
        await sendSubscriptionCancelledEmail(clinic.adminId.email, clinic.adminId.name, clinic.subscriptionEndDate);
    }
}

async function handleTransactionCompleted(txn) {
    if (!txn.subscriptionId) return; // Solo nos importa si está ligada a una suscripción

    console.log(`💳 Procesando Transaction Completed: ${txn.id} para suscripción ${txn.subscriptionId}`);

    // Buscar paymentMethodId en los pagos de la transacción
    let paymentMethodId = txn.payments?.find(p => p.paymentMethodId)?.paymentMethodId;

    // Si no está en payments, intentar buscar en el objeto principal (dependiendo de la versión de API)
    if (!paymentMethodId && txn.paymentMethodId) {
        paymentMethodId = txn.paymentMethodId;
    }

    if (!paymentMethodId) {
        console.warn(`⚠️ Transacción ${txn.id} sin paymentMethodId visible.`);
        return;
    }

    try {
        const paymentMethod = await paddle.paymentMethods.get(txn.customerId, paymentMethodId);
        let fingerprint = paymentMethod.card?.fingerprint;

        if (fingerprint) {
            console.log(`🔍 Fingerprint detectado en transacción: ${fingerprint}`);

            // Verificar si ya existe el fingerprint
            const fingerprintExists = await TrialFingerprint.findOne({ cardFingerprint: fingerprint });

            // Verificamos si la suscripción actual es la misma que la registrada (para evitar falso positivo en la misma sub)
            if (fingerprintExists && fingerprintExists.subscriptionId !== txn.subscriptionId) {
                // Check if it's a trial subscription. transaction.created/completed might not carry status 'trialing' directly?
                // But usually we assume if we found a fingerprint collision on a NEW subscription, it's bad.
                // However, we should be careful. 
                // If the user upgraded from Free to Pro, it's fine.
                // We only care if they are STARTING a TRIAL.
                // How do we know if this transaction is for a TRIAL?
                // Usually trials have $0 transaction or is just 'trialing' status of subscription.
                // Fetch subscription to check status.

                const sub = await paddle.subscriptions.get(txn.subscriptionId);
                if (sub.status === 'trialing') {
                    console.error(`🚨 FRAUDE DETECTADO (vía Transaction): Tarjeta ${fingerprint} usada previamente. Cancelando sub ${txn.subscriptionId}`);
                    await paddle.subscriptions.cancel(txn.subscriptionId, { effectiveFrom: 'immediately' });
                    return;
                }
            }

            // Si no existe, y es una suscripción de trial, deberíamos guardarlo si handleSubscriptionCreated falló?
            // Sí, es un buen backup.
            const sub = await paddle.subscriptions.get(txn.subscriptionId);
            if (sub.status === 'trialing') {
                // Intentar guardar si no existe
                await TrialFingerprint.findOneAndUpdate(
                    { cardFingerprint: fingerprint },
                    {
                        cardFingerprint: fingerprint,
                        clinicId: sub.customData?.clinicId, // Podría no estar populated si no cuidamos customData
                        subscriptionId: sub.id,
                        firstUsedAt: new Date()
                    },
                    { upsert: true, new: true }
                );
            }

        }
    } catch (e) {
        console.error("❌ Error verificando fraude en transacción:", e.message);
    }
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
