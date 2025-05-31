import OpenAI from 'openai';
import Usuarios from '../models/Usuarios.js';
import Conversation from '../models/Conversation.js';
import nodemailer from 'nodemailer';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Mapa de actividad global (se mantendrá entre invocaciones en Vercel)
const userActivityMap = new Map();

export function updateUserActivity(userId) {
  userActivityMap.set(userId, Date.now());
}


/*Login*/

export const loginUser = async (req, res) => {
  const { correo, contrasena } = req.body;

  try {
      const validateUser = await Usuarios.findOne({ correo, contrasena });

      if (validateUser) {
          console.log("Login exitoso para:", correo);
          return res.json({
              success: true,
              message: 'Inicio de Sesion Exitoso!',
              user: {
                  _id: validateUser._id,  //Se agrega User _id.  
                  correo: validateUser.correo,
                  nombre: validateUser.nombre,
                  rol: validateUser.rol,
              },
          });
      } else {
          return res.status(400).json({ success: false, message: 'El usuario o contraseña no son correctos' });
      }
  } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ success: false, message: 'Error en el servidor' });
  }
};

/*Crear usuario y admin*/
export const createUser = async (req, res) => {
  try {
    const { nombre, correo, contrasena, rol } = req.body; 

    const nuevoUsuario = new Usuarios({ 
      nombre, 
      correo, 
      contrasena, 
      rol
    });

    await nuevoUsuario.save();

    res.status(201).json({ success: true, message: 'Usuario creado exitosamente', usuario: nuevoUsuario });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor' });
  }
};

/*Obtener Datos del Usuario */                                                //MODIFICADO

export const getUsuario = async (req, res) => {
  try {
    const usuarios = await Usuarios.find(); // ⬅ nombre en minúsculas
    res.json(usuarios); // ✅ así sí devuelve un arreglo directamente
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener los usuarios' });
  }
};


////////////////////////////////////////

// Configurar OpenAI con manejo de errores mejorado
let openai;
try {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('La variable de entorno OPENAI_API_KEY no está definida');
  }
  openai = new OpenAI({ apiKey });
  console.log('✅ OpenAI configurado correctamente');
} catch (error) {
  console.error('Error al inicializar OpenAI:', error);
}

// Generar respuesta de ChatGPT con contexto del historial de conversaciones
export const generateChatResponse = async (req, res) => {
  try {
    const { prompt, userId } = req.body;
    updateUserActivity(userId);

    if (!prompt) return res.status(400).json({ error: 'El prompt es requerido' });
    
    const conversations = await Conversation.find().sort({ createdAt: -1 }).limit(10);
    const conversationContext = conversations.flatMap(conv => ([
      { role: "user", content: conv.prompt },
      { role: "assistant", content: conv.response }
    ]));

    // Llamada a la API de OpenAI con historial de conversaciones como contexto
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { 
          role: "system", 
          content: "Eres una asistente de rumbas llamada “Sommer”, de 32 años de edad. Eres servicial, alegre, espontánea, carismática con un acento caleño y lenguaje juvenil. Los usuarios te preguntaran que hacer un viernes o los fines de semana en la noche en Cali. Quieren planes para salir con amigos. Sugerir 3 planes divertidos de rumba con amigos cuando te pregunten. Responder brevemente y directo, entusiasmada, informalidad moderada, sin groserías, segura de si y con tranquilidad. No puedes hablar mal de otros lugares, no puedes buscar comida, cosas para comprar, temas de estudio, bíblicos, terroristas,  no des concejos médicos ni opiniones personales. "
        },
        ...conversationContext, // Agregar historial de conversaciones
        { role: "user", content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.7,
    });
    
    const response = completion.choices[0].message.content;
    
    // Guardar la conversación en la base de datos
    const newConversation = new Conversation({ prompt, response,userId });
    await newConversation.save();
    
    res.json({ response });
  } catch (error) {
    console.error('Error al generar la respuesta:', error);
    res.status(500).json({ 
      error: 'Error al procesar la solicitud',
      details: error.message 
    });
  }
};

export const getConversationHistory = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      console.error("Error: userId no fue proporcionado en la solicitud");
      return res.status(400).json({ error: "El userId es requerido" });
    }

    // Obtener las últimas 10 conversaciones
    const conversations = await Conversation.find({ userId }).sort({ createdAt: -1 }).limit(10);

    // Transformar los datos para devolver solo el prompt y un resumen
    const conversationSummary = conversations.map(conv => ({
      prompt: conv.prompt,
      resumen: conv.response.slice(0, 100) + "..." // Limita la respuesta a 100 caracteres y añade "..."
    }));

    res.json(conversationSummary);
  } catch (error) {
    console.error("Error al obtener el historial:", error);
    res.status(500).json({ error: "Error al obtener el historial de conversaciones" });
  }
};

export const logoutUser = (req, res) => {
  const { userId } = req.body;

  if (userActivityMap.has(userId)) {
    userActivityMap.delete(userId);
    console.log(`👋 Usuario ${userId} cerró sesión manualmente`);
  }

  res.json({ success: true, message: 'Sesión cerrada correctamente' });
};

//////////////////////////////////////////////////////////////////////////////         VALIDAR                 //////////////////////////////////////////////////////////////////////////

// Transportador SMTP para Zoho Mail
export const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: parseInt(process.env.MAIL_PORT || '465'),
  secure: process.env.MAIL_SECURE === 'true',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

// Verificación SMTP de Sommer una vez al inicio
export const verifySMTPConnection = () => {
  transporter.verify((error, success) => {
    if (error) {
      console.error('❌ Error de configuración SMTP:', error);
    } else {
      console.log('✅ Conexión SMTP con Zoho lista para enviar correos');
    }
  });
};

// Revisión de inactividad cada 1 minuto
export const startInactivityCheck = (PORT) => {
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
};

// Función para enviar el resumen por correo
export const sendSummaryEmail = async (to, resumen) => {
  await transporter.sendMail({
    from: `"Asistente Sommer" <${process.env.MAIL_USER}>`,
    to,
    subject: 'Resumen de tu conversación con Sommer',
    text: resumen
  });

  console.log(`📧 Resumen enviado a ${to}`);
};