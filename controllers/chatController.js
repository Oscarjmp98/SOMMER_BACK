import OpenAI from 'openai';
import dotenv from 'dotenv';
import Usuarios from '../models/Usuarios.js';
import Conversation from '../models/Conversation.js';
import { updateUserActivity, userActivityMap, transporter } from '../api/server.js';

dotenv.config();

/* ---------------- LOGIN ---------------- */
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
          _id: validateUser._id,
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

/* ---------------- REGISTRO ---------------- */
export const createUser = async (req, res) => {
  try {
    const { nombre, correo, contrasena, rol } = req.body;

    const nuevoUsuario = new Usuarios({ nombre, correo, contrasena, rol });
    await nuevoUsuario.save();

    res.status(201).json({ success: true, message: 'Usuario creado exitosamente', usuario: nuevoUsuario });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor' });
  }
};

/* ---------------- OBTENER USUARIOS ---------------- */
export const getUsuario = async (req, res) => {
  try {
    const usuarios = await Usuarios.find();
    res.json(usuarios);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener los usuarios' });
  }
};

/* ---------------- CONFIGURAR OPENAI ---------------- */
let openai;
try {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('La variable de entorno OPENAI_API_KEY no está definida');
  openai = new OpenAI({ apiKey });
  console.log('✅ OpenAI configurado correctamente');
} catch (error) {
  console.error('Error al inicializar OpenAI:', error);
}

/* ---------------- CHAT SOMMER ---------------- */
export const generateChatResponse = async (req, res) => {
  try {
    const { prompt, userId } = req.body;
    updateUserActivity(userId);

    if (!prompt) return res.status(400).json({ error: 'El prompt es requerido' });
    if (!openai) return res.status(500).json({ error: 'OpenAI no está configurado' });

    const conversations = await Conversation.find().sort({ createdAt: -1 }).limit(10);
    const conversationContext = conversations.flatMap(conv => ([
      { role: "user", content: conv.prompt },
      { role: "assistant", content: conv.response }
    ]));

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Eres una asistente de rumbas llamada Sommer, de 32 años, servicial, alegre, espontánea y carismática, con acento caleño y lenguaje juvenil. Solo recomiendas planes de rumba en Cali para amigos. No hablas de comida, religión, estudios ni temas médicos."
        },
        ...conversationContext,
        { role: "user", content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const response = completion.choices[0].message.content;
    const newConversation = new Conversation({ prompt, response, userId });
    await newConversation.save();

    res.json({ response });
  } catch (error) {
    console.error('Error al generar la respuesta:', error);
    res.status(500).json({ error: 'Error al procesar la solicitud', details: error.message });
  }
};

/* ---------------- HISTORIAL DE CHAT ---------------- */
export const getConversationHistory = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) return res.status(400).json({ error: "El userId es requerido" });

    const conversations = await Conversation.find({ userId }).sort({ createdAt: -1 }).limit(10);

    const conversationSummary = conversations.map(conv => ({
      prompt: conv.prompt,
      resumen: conv.response.slice(0, 100) + "..."
    }));

    res.json(conversationSummary);
  } catch (error) {
    console.error("Error al obtener el historial:", error);
    res.status(500).json({ error: "Error al obtener el historial de conversaciones" });
  }
};

/* ---------------- LOGOUT + ENVÍO DE CORREO ---------------- */
export const logoutUser = async (req, res) => {
  const { userId } = req.body;

  try {
    if (userActivityMap.has(userId)) {
      userActivityMap.delete(userId);
    }

    const user = await Usuarios.findById(userId);
    if (!user || !user.correo) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

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

    await transporter.sendMail({
      from: `"Sommer" <${process.env.MAIL_USER}>`,
      to: user.correo,
      subject: 'Resumen de tu conversación con Sommer',
      text: resumen
    });

    console.log(`📧 Correo enviado a ${user.correo}`);
    res.json({ success: true, message: 'Sesión cerrada y resumen enviado' });

  } catch (error) {
    console.error('❌ Error al cerrar sesión:', error);
    res.status(500).json({ success: false, message: 'Error al cerrar sesión' });
  }
};
