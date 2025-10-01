import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv'; 
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

dotenv.config();

const app = express();

// CORS para produção
app.use(cors({
  origin: [
    'https://gerador-times.netlify.app',
    'http://localhost:8100',
    'http://localhost:3000'
  ],
  credentials: true
}));

app.use(express.json());

// Conexão MongoDB
const connectDB = async () => {
  try {
    console.log('🔄 Conectando ao MongoDB Atlas...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Atlas conectado!');
  } catch (error) {
    console.error('❌ Erro MongoDB:', error.message);
    process.exit(1);
  }
};

connectDB();

// Schema e Model
const groupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  members: [{
    name: String,
    active: { type: Boolean, default: true }
  }],
  userId: { type: String, required: true }
}, {
  timestamps: true
});

const Group = mongoose.model('Group', groupSchema);

// 🔐 MIDDLEWARE DE AUTENTICAÇÃO
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Token de acesso necessário' });
  }

  try {
    // Decodificar o token JWT (em produção, valide com a chave pública do Auth0)
    const decoded = jwt.decode(token, { complete: true });
    
    if (!decoded) {
      return res.status(403).json({ error: 'Token inválido' });
    }

    // Extrair o userId do token (sub claim)
    req.user = {
      sub: decoded.payload.sub,
      email: decoded.payload.email,
      name: decoded.payload.name
    };
    
    next();
  } catch (error) {
    console.error('❌ Erro na autenticação:', error);
    return res.status(403).json({ error: 'Token inválido' });
  }
};

// 🔒 ROTAS PROTEGIDAS
app.get('/api/groups', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.sub; // ID único do usuário do Auth0
    const groups = await Group.find({ userId });
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/groups', authenticateToken, async (req, res) => {
  try {
    const groupData = {
      ...req.body,
      userId: req.user.sub // Adiciona o userId automaticamente do token
    };
    
    const group = new Group(groupData);
    await group.save();
    res.status(201).json(group);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/groups/:id', authenticateToken, async (req, res) => {
  try {
    const group = await Group.findOne({ 
      _id: req.params.id, 
      userId: req.user.sub // Só permite atualizar grupos do próprio usuário
    });
    
    if (!group) {
      return res.status(404).json({ error: 'Grupo não encontrado' });
    }

    // Atualiza apenas os campos permitidos
    group.name = req.body.name || group.name;
    group.members = req.body.members || group.members;
    
    await group.save();
    res.json(group);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/groups/:id', authenticateToken, async (req, res) => {
  try {
    const group = await Group.findOneAndDelete({ 
      _id: req.params.id, 
      userId: req.user.sub // Só permite deletar grupos do próprio usuário
    });
    
    if (!group) {
      return res.status(404).json({ error: 'Grupo não encontrado' });
    }
    
    res.json({ message: 'Grupo deletado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🔓 ROTAS PÚBLICAS (não precisam de autenticação)
app.get('/health', async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState === 1 ? 'Conectado' : 'Desconectado';
    res.json({ 
      status: 'OK', 
      database: dbStatus,
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date() 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 Backend do Gerador de Times funcionando!',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      api: '/api/groups (PROTEGIDO)',
      documentation: 'Veja o README para mais informações'
    },
    timestamp: new Date()
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Backend rodando na porta ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔐 Rotas /api/* protegidas por JWT`);
});