const Clinic = require('../models/Clinic');
const Patient = require('../models/Patient');
const Appointment = require('../models/Appointment');
const PDFDocument = require('pdfkit');
const { createObjectCsvWriter } = require('csv-writer');
const fs = require('fs');
const path = require('path');

// Helper: Check if user's clinic has Clinic Plus plan
async function checkClinicPlusPlan(userId) {
    const User = require('../models/User');
    const user = await User.findById(userId);
    if (!user || !user.clinicId) {
        throw new Error('Usuario o clínica no encontrados');
    }

    const clinic = await Clinic.findById(user.clinicId);
    if (!clinic) {
        throw new Error('Clínica no encontrada');
    }

    // Check if plan is 'clinic_plus'
    if (clinic.plan !== 'clinic_plus') {
        const error = new Error('Esta función requiere el plan Clinic Plus');
        error.statusCode = 403;
        throw error;
    }

    return { user, clinic };
}

// Helper: Format date
function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-ES');
}

// Helper: Calculate age from birthday
function getAgeFromDOB(birthday) {
    if (!birthday) return 'N/A';
    const birthDate = new Date(birthday);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}

// Export Patients List as CSV
exports.exportPatientsCSV = async (req, res) => {
    try {
        const { user } = await checkClinicPlusPlan(req.user._id);
        const { startDate, endDate } = req.query;

        // Fetch patients for this clinic
        let query = { clinicId: user.clinicId };

        // Apply date filter if provided
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.createdAt.$lte = end;
            }
        }

        const patients = await Patient.find(query).sort({ createdAt: -1 });

        // Generate CSV
        const csvPath = path.join(__dirname, `../temp/patients_${Date.now()}.csv`);

        // Ensure temp directory exists
        const tempDir = path.join(__dirname, '../temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir);
        }

        const csvWriter = createObjectCsvWriter({
            path: csvPath,
            header: [
                { id: 'name', title: 'Nombre' },
                { id: 'lastName', title: 'Apellido' },
                { id: 'age', title: 'Edad' },
                { id: 'birthday', title: 'Fecha Nacimiento' },
                { id: 'phone', title: 'Teléfono' },
                { id: 'email', title: 'Email' },
                { id: 'createdAt', title: 'Fecha Registro' }
            ]
        });

        const records = patients.map(p => ({
            name: p.name,
            lastName: p.lastName,
            age: getAgeFromDOB(p.birthday),
            birthday: formatDate(p.birthday),
            phone: p.phone || '',
            email: p.email || '',
            createdAt: formatDate(p.createdAt)
        }));

        await csvWriter.writeRecords(records);

        // Send file
        res.download(csvPath, `reporte_pacientes_${new Date().toISOString().split('T')[0]}.csv`, (err) => {
            // Delete temp file after sending
            if (fs.existsSync(csvPath)) {
                fs.unlinkSync(csvPath);
            }
        });

    } catch (error) {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message });
    }
};

// Export Patients List as PDF
exports.exportPatientsPDF = async (req, res) => {
    try {
        const { user } = await checkClinicPlusPlan(req.user._id);
        const { startDate, endDate } = req.query;

        let query = { clinicId: user.clinicId };

        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.createdAt.$lte = end;
            }
        }

        const patients = await Patient.find(query).sort({ createdAt: -1 });

        // Create PDF
        const doc = new PDFDocument({ margin: 50 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=reporte_pacientes_${new Date().toISOString().split('T')[0]}.pdf`);

        doc.pipe(res);

        // Title
        doc.fontSize(18).text('Reporte de Pacientes Nuevos', { align: 'center' });
        doc.moveDown();
        doc.fontSize(11).text(`Generado el: ${new Date().toLocaleDateString('es-ES')}`, { align: 'center' });
        doc.moveDown(2);

        // Table headers
        const tableTop = 150;
        const col1 = 50;
        const col2 = 180;
        const col3 = 250;
        const col4 = 320;
        const col5 = 420;

        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Nombre', col1, tableTop);
        doc.text('Edad', col2, tableTop);
        doc.text('F. Nac', col3, tableTop);
        doc.text('Teléfono', col4, tableTop);
        doc.text('Registro', col5, tableTop);

        doc.moveTo(col1, tableTop + 15).lineTo(550, tableTop + 15).stroke();

        // Table rows
        let y = tableTop + 25;
        doc.font('Helvetica').fontSize(9);

        patients.forEach((p, i) => {
            if (y > 700) {
                doc.addPage();
                y = 50;
            }

            doc.text(`${p.name} ${p.lastName}`, col1, y, { width: 120, ellipsis: true });
            doc.text(getAgeFromDOB(p.birthday).toString(), col2, y);
            doc.text(formatDate(p.birthday), col3, y);
            doc.text(p.phone || '-', col4, y, { width: 90, ellipsis: true });
            doc.text(formatDate(p.createdAt), col5, y);

            y += 20;
        });

        doc.end();

    } catch (error) {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message });
    }
};

// Generate Clinical PDF for a specific patient
exports.generateClinicalPDF = async (req, res) => {
    try {
        const { user } = await checkClinicPlusPlan(req.user._id);
        const { patientId } = req.params;

        const patient = await Patient.findOne({ _id: patientId, clinicId: user.clinicId });
        if (!patient) {
            return res.status(404).json({ error: 'Paciente no encontrado' });
        }

        const doc = new PDFDocument({ margin: 50 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Ficha_${patient.name}_${patient.lastName}.pdf`);

        doc.pipe(res);

        // Title
        doc.fontSize(22).text('Ficha Clínica', { align: 'center' });
        doc.moveDown();
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(2);

        // Personal Information
        doc.fontSize(14).fillColor('#4F46E5').text('Información Personal');
        doc.moveDown(0.5);
        doc.fontSize(10).fillColor('#000000');

        doc.font('Helvetica-Bold').text('Nombre: ', { continued: true })
            .font('Helvetica').text(`${patient.name} ${patient.lastName}`);
        doc.moveDown(0.3);

        doc.font('Helvetica-Bold').text('F. Nac: ', { continued: true })
            .font('Helvetica').text(`${formatDate(patient.birthday)} (${getAgeFromDOB(patient.birthday)} años)`);
        doc.moveDown(0.3);

        doc.font('Helvetica-Bold').text('Tel: ', { continued: true })
            .font('Helvetica').text(patient.phone || 'N/A');
        doc.moveDown(0.3);

        doc.font('Helvetica-Bold').text('Email: ', { continued: true })
            .font('Helvetica').text(patient.email || 'N/A');
        doc.moveDown(2);

        // Clinical Notes
        doc.fontSize(14).fillColor('#4F46E5').text('Notas Clínicas');
        doc.moveDown(0.5);
        doc.fontSize(10).fillColor('#000000').font('Helvetica');
        doc.text(patient.notes || 'Sin notas.', { align: 'justify' });
        doc.moveDown(2);

        // Custom Fields
        if (patient.customFields && Array.isArray(patient.customFields) && patient.customFields.length > 0) {
            doc.fontSize(14).fillColor('#4F46E5').text('Datos Adicionales');
            doc.moveDown(0.5);
            doc.fontSize(10).fillColor('#000000');

            patient.customFields.forEach(field => {
                doc.font('Helvetica-Bold').text(`${field.fieldName}: `, { continued: true })
                    .font('Helvetica').text(field.value || '-');
                doc.moveDown(0.3);
            });
        }

        doc.end();

    } catch (error) {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message });
    }
};

// Generate History PDF for a patient
exports.generateHistoryPDF = async (req, res) => {
    try {
        const { user } = await checkClinicPlusPlan(req.user._id);
        const { patientId } = req.params;

        const patient = await Patient.findOne({ _id: patientId, clinicId: user.clinicId });
        if (!patient) {
            return res.status(404).json({ error: 'Paciente no encontrado' });
        }

        const appointments = await Appointment.find({
            patientId: patient._id,
            clinicId: user.clinicId
        }).sort({ date: -1 });

        const doc = new PDFDocument({ margin: 50 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Historial_Citas_${patient.name}.pdf`);

        doc.pipe(res);

        // Title
        doc.fontSize(20).text('Historial de Citas', { align: 'center' });
        doc.moveDown(2);

        doc.fontSize(12).text(`Paciente: ${patient.name} ${patient.lastName}`);
        doc.moveDown(0.5);

        const total = appointments.length;
        const completed = appointments.filter(a => a.status === 'completed').length;
        doc.fontSize(10).text(`Total Citas: ${total}   Completadas: ${completed}`);
        doc.moveDown(2);

        // Table headers
        const tableTop = doc.y;
        const col1 = 50;
        const col2 = 130;
        const col3 = 200;
        const col4 = 280;
        const col5 = 360;

        doc.fontSize(9).font('Helvetica-Bold');
        doc.text('Fecha', col1, tableTop);
        doc.text('Hora', col2, tableTop);
        doc.text('Duración', col3, tableTop);
        doc.text('Estado', col4, tableTop);
        doc.text('Nota', col5, tableTop);

        doc.moveTo(col1, tableTop + 15).lineTo(550, tableTop + 15).stroke();

        // Table rows
        let y = tableTop + 25;
        doc.font('Helvetica').fontSize(8);

        const statusLabels = {
            scheduled: 'Agendada',
            pending: 'Pendiente',
            completed: 'Completada',
            canceled: 'Cancelada'
        };

        appointments.forEach((apt) => {
            if (y > 700) {
                doc.addPage();
                y = 50;
            }

            doc.text(formatDate(apt.date), col1, y);
            doc.text(apt.hour, col2, y);
            doc.text(`${apt.duration} min`, col3, y);
            doc.text(statusLabels[apt.status] || apt.status, col4, y);
            doc.text(apt.description || '-', col5, y, { width: 180, ellipsis: true });

            y += 20;
        });

        doc.end();

    } catch (error) {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message });
    }
};
