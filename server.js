import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { router as chatRoutes } from './routes/chatRoutes.js';
import path from 'path';
import { fileURLToPath } from 'url';


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
    message: 'API de SOMMER funcionando correctamente',
    status: 'OpenAI configurado'
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});