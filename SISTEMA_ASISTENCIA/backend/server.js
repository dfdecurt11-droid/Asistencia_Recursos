const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();

// --- MIDDLEWARES GLOBALES ---
app.use(cors());
app.use(express.json());

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '../frontend')));

const JWT_SECRET = 'rrhh_secret_key_2026';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- RUTA DE LOGIN (admin@rrhh.com / rrhh123) ---
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    if (email === 'admin@rrhh.com' && password === 'rrhh123') { 
        const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ success: true, token });
    } else {
        res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }
});

// --- RUTAS DE PRACTICANTES Y ASISTENCIA (Lógica existente) ---
app.get('/api/practicantes', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM practicantes ORDER BY apellidos ASC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener datos' });
    }
});

app.post('/api/asistencia/:id', async (req, res) => {
    const { id } = req.params;
    const { tipo } = req.body;
    try {
        if (tipo === 'entrada') {
            await pool.query('INSERT INTO asistencia (id_practicantes, hora_entrada) VALUES ($1, CURRENT_TIMESTAMP)', [id]);
            res.json({ message: '🕒 Entrada registrada' });
        } else {
            await pool.query('UPDATE asistencia SET hora_salida = CURRENT_TIMESTAMP WHERE id_practicantes = $1 AND hora_salida IS NULL', [id]);
            res.json({ message: '✅ Salida registrada' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Error en asistencia' });
    }
});

// --- CORRECCIÓN DEFINITIVA PARA NODE 22 ---
// En lugar de '*' o '(.*)', usamos esta expresión regular para capturar todo
app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));