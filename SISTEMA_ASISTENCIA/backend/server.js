const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path'); // <-- IMPORTANTE: Para manejar rutas de carpetas

const app = express();

// --- MIDDLEWARES GLOBALES ---
app.use(cors());
app.use(express.json());

// --- SERVIR FRONTEND ---
// Esto permite que al abrir la URL de Render se cargue tu index.html
app.use(express.static(path.join(__dirname, '../frontend')));

// CONFIGURACIÓN JWT
const JWT_SECRET = 'rrhh_secret_key_2026';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- MIDDLEWARE DE AUTENTICACIÓN ---
const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(403).json({ error: 'Acceso denegado. Inicie sesión.' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Sesión expirada o inválida' });
    }
};

// --- RUTA DE LOGIN (CORREGIDA) ---
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    // Validación con tus nuevas credenciales
    if (email === 'admin@rrhh.com' && password === 'rrhh123') {
        const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ success: true, token });
    } else {
        res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }
});

// --- RUTAS DE PRACTICANTES ---
app.get('/api/practicantes', async (req, res) => {
    const { area } = req.query;
    try {
        let query = 'SELECT * FROM practicantes';
        let params = [];
        if (area) {
            query += ' WHERE area = $1';
            params.push(area);
        }
        query += ' ORDER BY apellidos ASC';
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener datos' });
    }
});

app.post('/api/practicantes', async (req, res) => {
    const { nombres, apellidos, area } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO practicantes (nombres, apellidos, area) VALUES ($1, $2, $3) RETURNING *',
            [nombres, apellidos, area]
        );
        res.status(201).json({ message: '✅ Practicante registrado', practicante: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: 'Error al guardar' });
    }
});

app.post('/api/asistencia/:id', async (req, res) => {
    const { id } = req.params;
    const tipo = req.body.tipo_registro || req.body.tipo;

    try {
        if (tipo === 'entrada') {
            await pool.query(
                'INSERT INTO asistencia (id_practicantes, hora_entrada) VALUES ($1, CURRENT_TIMESTAMP)',
                [id]
            );
            res.json({ message: '🕒 Entrada registrada' });
        } else {
            const check = await pool.query(
                `UPDATE asistencia SET hora_salida = CURRENT_TIMESTAMP 
                 WHERE id_practicantes = $1 AND hora_salida IS NULL RETURNING id`,
                [id]
            );
            if (check.rows.length === 0) return res.status(400).json({ message: 'No hay entrada abierta' });
            res.json({ message: '✅ Salida registrada' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Error en asistencia' });
    }
});

// --- RUTAS PROTEGIDAS (Solo Admin) ---
app.get('/api/reporte', verificarToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                p.id_practicantes, p.nombres, p.apellidos, p.area,
                MAX(a.hora_entrada) AS hora_entrada, 
                MAX(a.hora_salida) AS hora_salida,
                COALESCE(TO_CHAR((SUM(CEIL(EXTRACT(EPOCH FROM (COALESCE(a.hora_salida, a.hora_entrada) - a.hora_entrada)) / 60)) * INTERVAL '1 minute'), 'HH24:MI:SS'), '00:00:00') AS horas_acumuladas
            FROM practicantes p 
            LEFT JOIN asistencia a ON p.id_practicantes = a.id_practicantes
            GROUP BY p.id_practicantes, p.nombres, p.apellidos, p.area
            ORDER BY p.apellidos ASC`);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error en reporte' });
    }
});

app.put('/api/practicantes/:id', verificarToken, async (req, res) => {
    const { id } = req.params;
    const { nombres, apellidos, area } = req.body;
    try {
        await pool.query('UPDATE practicantes SET nombres=$1, apellidos=$2, area=$3 WHERE id_practicantes=$4', [nombres, apellidos, area, id]);
        res.json({ message: 'Actualizado' });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar' });
    }
});

app.delete('/api/practicantes/:id', verificarToken, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM asistencia WHERE id_practicantes=$1', [id]);
        await pool.query('DELETE FROM practicantes WHERE id_practicantes=$1', [id]);
        res.json({ message: 'Eliminado correctamente' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar' });
    }
});

app.delete('/api/reset', verificarToken, async (req, res) => {
    try {
        await pool.query('TRUNCATE TABLE asistencia RESTART IDENTITY CASCADE');
        res.json({ message: '🔄 Sistema reiniciado' });
    } catch (error) {
        res.status(500).json({ error: 'Error al reiniciar' });
    }
});

// --- MANEJO DE RUTAS DEL NAVEGADOR ---
// Esto evita errores al recargar la página
app.get('(.*)', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));