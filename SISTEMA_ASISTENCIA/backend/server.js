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

// --- 1. OBTENER PRACTICANTES (LISTA BÁSICA) ---
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

// --- 2. REGISTRAR ASISTENCIA (EL MOTOR DEL SISTEMA) ---
app.post('/api/asistencia/:id', async (req, res) => {
    const { id } = req.params;
    // CORRECCIÓN: Acepta tipo_registro (nuevo) o tipo (antiguo)
    const tipo = req.body.tipo_registro || req.body.tipo;

    try {
        if (tipo === 'entrada') {
            await pool.query(
                'INSERT INTO asistencia (id_practicantes, hora_entrada) VALUES ($1, CURRENT_TIMESTAMP)',
                [id]
            );
            res.json({ message: '🕒 Entrada registrada con éxito' });
        } else {
            const check = await pool.query(
                `UPDATE asistencia 
                 SET hora_salida = CURRENT_TIMESTAMP 
                 WHERE id_practicantes = $1 AND hora_salida IS NULL 
                 RETURNING id`,
                [id]
            );
            if (check.rows.length === 0) {
                return res.status(400).json({ message: 'No hay una entrada abierta para este ID.' });
            }
            res.json({ message: '✅ Salida registrada con éxito' });
        }
    } catch (error) {
        console.error("ERROR ASISTENCIA:", error);
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

// --- 3. REPORTE GENERAL (CALCULA HORAS AUTOMÁTICAMENTE) ---
app.get('/api/reporte', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                p.id_practicantes, p.nombres, p.apellidos, p.area,
                MAX(a.hora_entrada) AS hora_entrada,
                MAX(a.hora_salida) AS hora_salida,
                COALESCE(
                    TO_CHAR(
                        SUM(
                            CASE 
                                WHEN a.hora_salida IS NOT NULL 
                                THEN a.hora_salida - a.hora_entrada
                                ELSE INTERVAL '0'
                            END
                        ),
                        'HH24:MI:SS'
                    ),
                    '00:00:00'
                ) AS horas_acumuladas
            FROM practicantes p
            LEFT JOIN asistencia a ON p.id_practicantes = a.id_practicantes
            GROUP BY p.id_practicantes, p.nombres, p.apellidos, p.area
            ORDER BY p.apellidos ASC
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error en reporte' });
    }
});

// (Mantén tus rutas de POST practicantes, PUT, DELETE y RESET igual...)

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor listo en puerto ${PORT}`));