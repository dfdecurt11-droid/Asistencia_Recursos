const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- 1. OBTENER PRACTICANTES ---
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

// --- 2. REGISTRAR NUEVO PRACTICANTE ---
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

// --- 3. REGISTRAR ASISTENCIA ---
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

// --- 4. REPORTE GENERAL (CORREGIDO PARA REDONDEO DE MINUTOS) ---
app.get('/api/reporte', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                p.id_practicantes, 
                p.nombres, 
                p.apellidos, 
                p.area,
                MAX(a.hora_entrada) AS hora_entrada, 
                MAX(a.hora_salida) AS hora_salida,
                COALESCE(
                    TO_CHAR(
                        (CEIL(EXTRACT(EPOCH FROM SUM(CASE WHEN a.hora_salida IS NOT NULL THEN a.hora_salida - a.hora_entrada ELSE INTERVAL '0' END)) / 60) * 60) * INTERVAL '1 second', 
                        'HH24:MI:SS'
                    ), 
                    '00:00:00'
                ) AS horas_acumuladas
            FROM practicantes p 
            LEFT JOIN asistencia a ON p.id_practicantes = a.id_practicantes
            GROUP BY p.id_practicantes 
            ORDER BY p.apellidos ASC`);
        res.json(result.rows);
    } catch (error) {
        console.error("Error en reporte SQL:", error);
        res.status(500).json({ error: 'Error en reporte' });
    }
});

// --- 5. EDITAR ---
app.put('/api/practicantes/:id', async (req, res) => {
    const { id } = req.params;
    const { nombres, apellidos, area } = req.body;
    try {
        await pool.query('UPDATE practicantes SET nombres=$1, apellidos=$2, area=$3 WHERE id_practicantes=$4', [nombres, apellidos, area, id]);
        res.json({ message: 'Actualizado' });
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

// --- 6. ELIMINAR ---
app.delete('/api/practicantes/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM asistencia WHERE id_practicantes=$1', [id]);
        await pool.query('DELETE FROM practicantes WHERE id_practicantes=$1', [id]);
        res.json({ message: 'Eliminado' });
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

// --- 7. RESET ---
app.delete('/api/reset', async (req, res) => {
    try {
        await pool.query('TRUNCATE TABLE asistencia RESTART IDENTITY CASCADE');
        res.json({ message: '🔄 Reiniciado' });
    } catch (error) {
        res.status(500).json({ error: 'Error al reiniciar' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Puerto ${PORT}`));