import express from 'express';
import {loginUser,createUser,generateChatResponse,getUsuario,getConversationHistory} from '../controllers/chatController.js';
import { logoutUser } from '../controllers/chatController.js';

const router = express.Router();

router.post('/login', loginUser);
router.post('/usuarios', createUser);
router.get('/usuarios', getUsuario);
router.post('/logout', logoutUser);


// Ruta para generar respuestas de ChatGPT
router.post('/', generateChatResponse);

// Ruta para obtener el historial de conversaciones
router.get('/history/:userId', getConversationHistory);

export { router };
