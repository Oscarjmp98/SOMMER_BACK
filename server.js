import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { router as chatRoutes } from './routes/chatRoutes.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import axios from 'axios';
import Conversation from './models/Conversation.js';

// Cargar variables de entorno
dotenv.config();

// Obtener el directorio actual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Verificar configuración de OpenAI
if (!process.env.OPENAI_API_KEY) {
  console.warn('\x1b[33m%s\x1b[0m', '⚠️  ADVERTENCIA: No se encontró la variable OPENAI_API_KEY');
}

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Conexión a MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-gpt-app';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB conectado'))
  .catch(err => console.error('❌ Error de conexión a MongoDB:', err));

// Rutas
app.use('/api/chat', chatRoutes);

// Ruta raíz
app.get('/', (req, res) => {
  res.json({
    message: 'API de ChatGPT funcionando correctamente',
    status: 'OpenAI configurado'
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});

/* ---------------- INACTIVIDAD Y ENVÍO DE CORREO ---------------- */

// Mapa global de actividad
export const userActivityMap = new Map();

export function updateUserActivity(userId) {
  userActivityMap.set(userId, Date.now());
}

// Transportador SMTP para Zoho Mail
const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: parseInt(process.env.MAIL_PORT || '465'),
  secure: process.env.MAIL_SECURE === 'true',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

// Verificación SMTP de Sommer una vez al inicio
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Error de configuración SMTP:', error);
  } else {
    console.log('✅ Conexión SMTP con Zoho lista para enviar correos');
  }
});

// Revisión de inactividad cada 1 minuto
setInterval(async () => {
  const now = Date.now();

  for (const [userId, lastActivity] of userActivityMap.entries()) {
    if (now - lastActivity > 1 * 60 * 1000) {
      console.log(`⏳ Inactividad detectada para usuario ${userId}. Enviando resumen...`);
      userActivityMap.delete(userId);

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const conversations = await Conversation.find({
        userId,
        createdAt: { $gte: startOfDay, $lte: endOfDay }
      });

      const resumen = conversations.map(conv =>
        `🗨️ ${conv.prompt}\n💬 ${conv.response}`
      ).join('\n\n') || 'No hubo conversación registrada hoy.';

      try {
        const { data: users } = await axios.get(`http://localhost:${PORT}/api/chat/usuarios`);
        const user = users.find(u =>
          u._id === userId || u._id?.toString() === userId || u.correo === userId
        );

        if (user && user.correo) {
          await sendSummaryEmail(user.correo, resumen);
        } else {
          console.warn(`⚠️ No se encontró el correo para el usuario ${userId}`);
        }
      } catch (error) {
        console.error('❌ Error obteniendo usuarios o enviando correo:', error);
      }
    }
  }
}, 60 * 1000); // cada minuto

// Función para enviar el resumen por correo
async function sendSummaryEmail(to, resumen) {
  await transporter.sendMail({
    from: `"Asistente Sommer" <${process.env.MAIL_USER}>`,
    to,
    subject: 'Resumen de tu conversación con Sommer',
    text: resumen
  });

  console.log(`📧 Resumen enviado a ${to}`);
}
