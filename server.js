import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';

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

// Rotas
app.get('/api/groups', async (req, res) => {
  try {
    const { userId } = req.query;
    const groups = await Group.find({ userId });
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/groups', async (req, res) => {
  try {
    const group = new Group(req.body);
    await group.save();
    res.status(201).json(group);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/groups/:id', async (req, res) => {
  try {
    const group = await Group.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { new: true }
    );
    if (!group) {
      return res.status(404).json({ error: 'Grupo não encontrado' });
    }
    res.json(group);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/groups/:id', async (req, res) => {
  try {
    const group = await Group.findByIdAndDelete(req.params.id);
    if (!group) {
      return res.status(404).json({ error: 'Grupo não encontrado' });
    }
    res.json({ message: 'Grupo deletado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check melhorado
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
      api: '/api/groups',
      documentation: 'Veja o README para mais informações'
    },
    timestamp: new Date()
  });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Backend rodando na porta ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});

