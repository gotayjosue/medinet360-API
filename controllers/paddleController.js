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
    // 1. Intentar get directo
    if (!fingerprint && sub.paymentMethodId) {
        try {
            const paymentMethod = await paddle.paymentMethods.get(sub.customerId, sub.paymentMethodId);
            if (paymentMethod.card) {
                fingerprint = paymentMethod.card.fingerprint;
            } else if (paymentMethod.type === 'card' && paymentMethod.fingerprint) {
                fingerprint = paymentMethod.fingerprint;
            }
            console.log(`🔍 Debug Fingerprint - Extraído tras API Get: ${fingerprint}`);
        } catch (e) {
            console.warn("⚠️ Error recuperando método de pago directo:", e.message);
        }
    }

    // 2. Fallback: Listar métodos del cliente si falló lo anterior
    if (!fingerprint) {
        console.log(`⚠️ Fingerprint no encontrado tras intento directo, listando métodos del cliente...`);
        fingerprint = await getFingerprintFromCustomer(sub.customerId);
        if (fingerprint) console.log(`✅ Fingerprint recuperado vía List: ${fingerprint}`);
    }

    // Si encontramos fingerprint, validamos y guardamos usando la lógica unificada
    if (fingerprint) {
        await checkAndSaveFingerprint(fingerprint, sub.id, sub.customData?.clinicId);
    } else {
        if (sub.status === 'trialing') {
            console.warn("⚠️ Suscripción de trial creada SIN fingerprint detectable tras todos los intentos.");
        }
    }

    // Verificar si checkAndSaveFingerprint canceló la sub
    const freshSub = await paddle.subscriptions.get(sub.id);
    if (freshSub.status === 'canceled') {
        console.log("🛑 Suscripción cancelada (posible fraude), deteniendo flujo de creación.");
        return;
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

    await sendSubscriptionCancelledEmail(clinic.adminId.email, clinic.adminId.name, clinic.subscriptionEndDate);
}

// Helper para buscar fingerprint en los métodos guardados del cliente
async function getFingerprintFromCustomer(customerId) {
    try {
        const paymentMethods = await paddle.paymentMethods.list(customerId);
        // Buscamos cualquier método que tenga tarjeta y fingerprint
        // Si hay varios, idealmente verificaríamos el último usado, pero para seguridad
        // cualquier fingerprint asociado al cliente actual nos sirve para validar.
        for (const pm of paymentMethods.data) {
            if (pm.card?.fingerprint) {
                return pm.card.fingerprint;
            }
        }
    } catch (e) {
        console.error(`❌ Error listando métodos de pago del cliente ${customerId}:`, e.message);
    }
    return null;
}

async function handleTransactionCompleted(txn) {
    if (!txn.subscriptionId) return;

    console.log(`💳 Procesando Transaction Completed: ${txn.id} para suscripción ${txn.subscriptionId}`);

    let fingerprint = null;

    // 1. Intentar obtener fingerprint directamente (casi nunca viene en webhook, pero por si acaso)
    const paymentAttempt = txn.payments?.find(p => p.methodDetails?.card?.fingerprint);
    if (paymentAttempt) {
        fingerprint = paymentAttempt.methodDetails.card.fingerprint;
        console.log(`✅ Fingerprint encontrado DIRECTAMENTE en transaction payments: ${fingerprint}`);
    }

    // 2. Fallback: Listar métodos de pago del cliente
    if (!fingerprint) {
        console.log(`⚠️ Fingerprint no visible en webhook, buscando en métodos guardados del cliente...`);
        fingerprint = await getFingerprintFromCustomer(txn.customerId);
        if (fingerprint) {
            console.log(`✅ Fingerprint recuperado listando métodos del cliente: ${fingerprint}`);
        }
    }

    if (fingerprint) {
        await checkAndSaveFingerprint(fingerprint, txn.subscriptionId, txn.customData?.clinicId);
    } else {
        console.warn(`⚠️ No se pudo obtener fingerprint para la transacción ${txn.id} ni listando métodos.`);
    }
}

// Lógica unificada de verificación y guardado
async function checkAndSaveFingerprint(fingerprint, subscriptionId, clinicIdArg) {
    // Verificar si ya existe el fingerprint
    const fingerprintExists = await TrialFingerprint.findOne({ cardFingerprint: fingerprint });

    // Verificamos si la suscripción actual es la misma que la registrada
    if (fingerprintExists && fingerprintExists.subscriptionId !== subscriptionId) {
        const sub = await paddle.subscriptions.get(subscriptionId);
        if (sub.status === 'trialing') {
            console.error(`🚨 FRAUDE DETECTADO: Tarjeta ${fingerprint} usada previamente. Cancelando sub ${subscriptionId}`);
            try {
                await paddle.subscriptions.cancel(subscriptionId, { effectiveFrom: 'immediately' });
            } catch (cancelErr) {
                await paddle.subscriptions.cancel(subscriptionId, { effectiveAt: 'immediately' }).catch(err => console.error('Error cancelando:', err));
            }
            return;
        }
    }

    // Guardar si es trial y no existe
    const sub = await paddle.subscriptions.get(subscriptionId);
    if (sub.status === 'trialing') {
        const clinicId = clinicIdArg || sub.customData?.clinicId;

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
        console.log(`💾 Fingerprint guardado/actualizado para trial: ${fingerprint}`);
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
