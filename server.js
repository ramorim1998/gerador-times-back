import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv'; 
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

dotenv.config();

const app = express();
app.use(cors({
  origin: [
    'https://gerador-times.netlify.app',
    'http://localhost:8100',
    'http://localhost:3000'
  ],
  credentials: true
}));

app.use(express.json());

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

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acesso necessário' });
  }

  try {
    const decoded = jwt.decode(token, { complete: true });
    
    if (!decoded) {
      return res.status(403).json({ error: 'Token inválido' });
    }

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

app.get('/api/groups', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.sub;
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
      userId: req.user.sub
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
      userId: req.user.sub
    });
    
    if (!group) {
      return res.status(404).json({ error: 'Grupo não encontrado' });
    }

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
      userId: req.user.sub
    });
    
    if (!group) {
      return res.status(404).json({ error: 'Grupo não encontrado' });
    }
    
    res.json({ message: 'Grupo deletado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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

const matchSchema = new mongoose.Schema({
  teamA: { type: [String], required: true },
  teamB: { type: [String], required: true },
  scoreA: { type: Number, required: true, min: 0 },
  scoreB: { type: Number, required: true, min: 0 },
  date: { type: Date, default: Date.now },
  userId: { type: String, required: true }
}, {
  timestamps: true
});

const Match = mongoose.model('Match', matchSchema);

app.get('/api/matches', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.sub;
    const matches = await Match.find({ userId }).sort({ date: -1 });
    res.json(matches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/matches', authenticateToken, async (req, res) => {
  try {
    const matchData = {
      ...req.body,
      userId: req.user.sub
    };
    
    const match = new Match(matchData);
    await match.save();
    res.status(201).json(match);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.sub;
    const matches = await Match.find({ userId });
    
    const stats = calculateTeamStats(matches);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function calculateTeamStats(matches) {
  const teamStats = {};
  
  matches.forEach(match => {
    const teamAKey = match.teamA.sort().join(',');
    const teamBKey = match.teamB.sort().join(',');
    
    // Time A
    if (!teamStats[teamAKey]) {
      teamStats[teamAKey] = {
        team: match.teamA,
        wins: 0,
        losses: 0,
        draws: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        matches: 0
      };
    }
    
    // Time B  
    if (!teamStats[teamBKey]) {
      teamStats[teamBKey] = {
        team: match.teamB,
        wins: 0,
        losses: 0,
        draws: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        matches: 0
      };
    }
    
    // Atualizar estatísticas
    teamStats[teamAKey].matches++;
    teamStats[teamBKey].matches++;
    
    teamStats[teamAKey].goalsFor += match.scoreA;
    teamStats[teamAKey].goalsAgainst += match.scoreB;
    
    teamStats[teamBKey].goalsFor += match.scoreB;
    teamStats[teamBKey].goalsAgainst += match.scoreA;
    
    if (match.scoreA > match.scoreB) {
      teamStats[teamAKey].wins++;
      teamStats[teamBKey].losses++;
    } else if (match.scoreA < match.scoreB) {
      teamStats[teamAKey].losses++;
      teamStats[teamBKey].wins++;
    } else {
      teamStats[teamAKey].draws++;
      teamStats[teamBKey].draws++;
    }
  });
  
  return Object.values(teamStats).map(stat => ({
    ...stat,
    points: (stat.wins * 3) + stat.draws,
    goalDifference: stat.goalsFor - stat.goalsAgainst
  })).sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Backend rodando na porta ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔐 Rotas /api/* protegidas por JWT`);
});