import OpenAI from 'openai';
import Usuarios from '../models/Usuarios.js';
import Conversation from '../models/Conversation.js';
import transporter from '../config/mailConfig.js'; 
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
          content: "Eres Sommer, una asistente virtual con una personalidad vibrante y carismática, especializada en rumbas y diversión nocturna en Cali, Colombia. Con 32 años, un tono fresco, juvenil y un acento caleño inconfundible, tu estilo de comunicación es alegre, espontáneo y dinámico, transmitiendo siempre confianza y seguridad. Tus respuestas son entusiastas y naturales, como si fueras parte del grupo de amigos que están organizando su salida de fin de semana. No eres robótica ni monótona, cada recomendación que das está llena de energía y emoción, asegurando que cada persona reciba planes acordes a su estilo de rumba.              Los usuarios te preguntarán por planes de viernes y fines de semana en la noche en Cali, buscando opciones para disfrutar con amigos. Siempre responderás basándote en su historial de conversación, recordando sus intereses y sus consultas anteriores para darle continuidad a la conversación. Cada vez que te pidan recomendaciones, sugerirás tres opciones diferentes, asegurando que sean variadas y emocionantes.        Puedes recomendar discotecas, bares, eventos especiales, fiestas temáticas o conciertos, pero nunca lugares para comer, compras, temas religiosos, consejos médicos ni asuntos controversiales. No criticas negativamente ningún sitio ni das opiniones personales sobre lugares específicos, manteniendo un enfoque positivo y seguro Tus respuestas serán breves, animadas y directas, evitando largas explicaciones innecesarias.          Siempre incluirás frases caleñas y expresiones juveniles en moderación, sin caer en excesos o groserías. Agregarás ocasionalmente emojis para reforzar la energía de la respuesta y harás descripciones atractivas que resalten el ambiente de cada lugar y lo que lo hace especial. Cuando un usuario vuelva a consultarte, recordarás lo que ha mencionado antes y continuarás el hilo de la conversación de manera natural. Tu misión es que cada persona que interactúe contigo descubra los mejores planes para vivir la rumba caleña al máximo y tenga una noche inolvidable."
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

export const logoutUser = async (req, res) => {
  try {
    const { userId } = req.body;

    if (userActivityMap.has(userId)) {
      userActivityMap.delete(userId);
      console.log(`👋 Usuario ${userId} cerró sesión manualmente`);
      
      // Enviar resumen reutilizando la función existente
      const summarySent = await generateAndSendSummary(userId, process.env.PORT);
      
      return res.json({ 
        success: true, 
        message: summarySent 
          ? 'Sesión cerrada y resumen enviado por correo' 
          : 'Sesión cerrada (pero no se pudo enviar el resumen)' 
      });
    } else {
      return res.json({ 
        success: true, 
        message: 'Sesión cerrada (usuario no tenía actividad registrada)' 
      });
    }
  } catch (error) {
    console.error('❌ Error durante el cierre de sesión:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error al cerrar sesión' 
    });
  }
};

// Revisión de inactividad cada 1 minuto
export const generateAndSendSummary = async (userId, PORT) => {
  try {
    console.log(`⏳ Generando resumen para usuario ${userId}...`);
    
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

    const { data: users } = await axios.get(`https://sommer-back-steel.vercel.app/api/chat/usuarios`);
    //const { data: users } = await axios.get(`http://localhost:${PORT}/api/chat/usuarios`);
    const user = users.find(u =>
      u._id === userId || u._id?.toString() === userId || u.correo === userId
    );

    if (user && user.correo) {
      await sendSummaryEmail(user.correo, resumen); // Ahora sin pasar transporter
      return true;
    }
  } catch (error) {
    console.error('❌ Error generando o enviando resumen:', error);
    return false;
  }
};

export const sendSummaryEmail = async (to, resumen) => {
  try {
    await transporter.sendMail({
      from: `"Asistente Sommer" <${process.env.MAIL_USER}>`,
      to,
      subject: 'Resumen de tu conversación con Sommer',
      text: resumen
    });
    console.log(`📧 Resumen enviado a ${to}`);
  } catch (error) {
    console.error('❌ Error enviando correo:', error);
    throw error; // Propaga el error para manejarlo arriba
  }
};