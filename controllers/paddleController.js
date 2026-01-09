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
exports.updateSubscription = async (req, res) => {
    try {
        const { newPriceId } = req.body;
        const userId = req.user._id;

        if (!newPriceId) {
            return res.status(400).json({ error: "newPriceId es requerido." });
        }

        const user = await User.findById(userId);
        const clinic = await Clinic.findById(user.clinicId);

        if (!clinic || !clinic.paddleSubscriptionId || !clinic.paddleCustomerId) {
            return res.status(400).json({ error: "La clínica no tiene una suscripción activa para actualizar." });
        }

        console.log(`🔄 Iniciando actualización de sub para ${clinic.paddleSubscriptionId} a precio ${newPriceId}`);

        // 1. Obtener detalles de la suscripción actual
        const currentSub = await paddle.subscriptions.get(clinic.paddleSubscriptionId);
        const currentItem = currentSub.items[0]; // Asumimos 1 item principal

        if (!currentItem) {
            return res.status(400).json({ error: "No se encontraron items en la suscripción actual." });
        }

        // 2. Obtener precios para comparar (Upgrade vs Downgrade)
        // Necesitamos saber el precio actual y el nuevo para decidir el modo de prorrateo
        const currentPriceInfo = currentItem.price;
        const newPriceInfo = await paddle.prices.get(newPriceId);

        // Calcular costo total actual (unit_price * quantity) si fuera necesario, 
        // pero para determinar upgrade/downgrade suele bastar el precio unitario si la cantidad es 1.
        // Asumimos cantidad 1 por licencia base.
        const currentAmount = parseFloat(currentPriceInfo.unitPrice.amount);
        const newAmount = parseFloat(newPriceInfo.unitPrice.amount);

        let prorationMode = 'prorated_immediately'; // Default Upgrade

        if (newAmount < currentAmount) {
            console.log(`📉 Downgrade detectado (${currentAmount} -> ${newAmount}). Aplicando al siguiente ciclo.`);
            prorationMode = 'prorated_next_billing_period';
        } else {
            console.log(`📈 Upgrade detectado (${currentAmount} -> ${newAmount}). Cobro inmediato.`);
        }

        // 3. Crear Transaction (Checkout) para actualizar
        // Usamos paddle.checkouts.create para generar una URL donde el usuario confirma y paga la diferencia.
        // Al pasar subscription_id, Paddle sabe que es una actualización.
        const checkout = await paddle.checkouts.create({
            customerId: clinic.paddleCustomerId,
            items: [
                {
                    priceId: newPriceId,
                    quantity: currentItem.quantity // Mantenemos la cantidad actual (ej: número de doctores extra si aplica, o 1 base)
                }
            ],
            customData: {
                subscriptionId: clinic.paddleSubscriptionId, // Auxiliar para webhook si hiciera falta
                clinicId: clinic._id.toString()
            }
        });

        // Lamentablemente, checkouts.create estándar crea una NUEVA sub si no se vincula bien.
        // Para actualizar una existente vía Checkout, NO se usa 'checkouts.create' directamte con subscriptionId en el body body (API v1 style).
        // En Paddle Billing (v2), para actualizar con checkout, la documentación sugiere:
        // Opción A: Usar subscription.update directamente (backend-to-backend).
        // Opción B: Si se quiere que el user pague, transaction.create (preview/update).

        // CORRECCIÓN: Según requirements del usuario: "Crear una sesión de checkout... Paddle debe cobrar solo la diferencia".
        // La forma correcta en API v2 para generar un link de pago por diferencia es crear una transacción borrador 
        // basada en la actualización de la suscripción.

        const transaction = await paddle.transactions.create({
            customerId: clinic.paddleCustomerId,
            subscriptionId: clinic.paddleSubscriptionId, // VINCULACIÓN CLAVE
            items: [
                {
                    priceId: newPriceId,
                    quantity: currentItem.quantity
                }
            ],
            collectionMode: 'automatic', // Para checkout
            billingDetails: prorationMode === 'prorated_immediately'
                ? { prorationBillingMode: 'prorated_immediately' }
                : { prorationBillingMode: 'prorated_next_billing_period' }
        });

        // La transacción creada está en estado 'draft' o 'ready'. 
        // Obtenemos el checkout url (transaction.checkout.url no existe directo, es transaction.details.checkout.url o similar? No, es transaction.url está deprecated? No.)
        // En SDK node: transaction.checkout?.url

        // Si es downgrade diferido, el monto a pagar hoy podría ser 0.
        // Aun así, enviamos la URL para que el usuario confirme el cambio.

        console.log(`✅ Transacción de actualización creada: ${transaction.id}`);

        // Obtener URL. A veces transaction.details?.checkout?.url
        // Revisando SDK/Docs: transaction.checkout.url es la propiedad si collection_mode=automatic

        /* 
           NOTA CRÍTICA: Si es un downgrade diferido, Paddle puede que NO permita checkout inmediato si el monto es 0 o negativo(crédito).
           Pero el endpoint pide devolver URL.
           Si transaction.status es 'completed' (raro en update diferido) o 'ready'.
        */

        // Devolvemos la URL
        let checkoutUrl = null;
        if (transaction.checkout && transaction.checkout.url) {
            checkoutUrl = transaction.checkout.url;
        } else {
            // Si no hay URL (ej. cambio inmediato sin costo o algo raro), intentamos obtenerla o asumimos éxito?
            // Para upgrades con costo SIEMPRE hay URL.
            // Para downgrades diferidos, a veces no hay cobro. Paddle actualiza la sub a "Scheduled Change".
            // Si la transacción se cerró sola (ej coste 0), no hay checkout.

            // Verificamos status
            if (transaction.status === 'completed' || transaction.status === 'past_due') {
                // Ya se aplicó?
                return res.json({ message: "La actualización se ha procesado (posiblemente sin costo inmediato).", status: transaction.status });
            }
        }

        res.json({ url: checkoutUrl });

    } catch (error) {
        console.error("❌ Error actualizando suscripción:", error);
        res.status(500).json({ error: error.message || "Error al procesar la actualización." });
    }
};
