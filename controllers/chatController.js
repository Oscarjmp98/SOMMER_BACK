import OpenAI from 'openai';
import Usuarios from '../models/Usuarios.js';
import Conversation from '../models/Conversation.js';
import dotenv from 'dotenv';

dotenv.config();

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

/*Obtener Datos del Usuario */

export const getUsuario = async (req, res) => {
  try {
    const Usuarios = await Usuarios.find();
    res.json(Usuarios);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener las ventas' });
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
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'El prompt es requerido' });
    }
    
    if (!openai) {
      return res.status(500).json({ 
        error: 'No se ha configurado correctamente la API de OpenAI',
        message: 'Error interno del servidor al configurar OpenAI'
      });
    }
    
    // Obtener el historial de conversaciones recientes
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
    const newConversation = new Conversation({ prompt, response });
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

// Obtener historial de conversaciones
export const getConversationHistory = async (req, res) => {
  try {
    const conversations = await Conversation.find().sort({ createdAt: -1 }).limit(10);
    res.json(conversations);
  } catch (error) {
    console.error('Error al obtener el historial:', error);
    res.status(500).json({ error: 'Error al obtener el historial de conversaciones' });
  }
};
