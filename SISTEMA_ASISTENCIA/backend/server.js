const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIGURACIÓN DE CONEXIÓN (Render + Supabase) ---
const pool = new Pool({
    // Usa la URL de Supabase desde las variables de entorno
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Obligatorio para conexiones seguras externas
    }
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
        console.error("ERROR AL OBTENER:", error);
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
        console.error("ERROR AL GUARDAR:", error);
        res.status(500).json({ error: 'Error al guardar en la base de datos' });
    }
});

// --- 3. REGISTRAR ASISTENCIA (ENTRADA/SALIDA) ---
app.post('/api/asistencia/:id', async (req, res) => {
    const { id } = req.params;
    const { tipo } = req.body;

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
                return res.status(400).json({ message: 'No hay entrada abierta.' });
            }

            res.json({ message: '✅ Salida registrada con éxito' });
        }
    } catch (error) {
        console.error("ERROR ASISTENCIA:", error);
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

// --- 4. REPORTE GENERAL ---
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
            GROUP BY p.id_practicantes
            ORDER BY p.apellidos ASC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error("ERROR REPORTE:", error);
        res.status(500).json({ error: 'Error en reporte' });
    }
});

// --- 5. EDITAR PRACTICANTE ---
app.put('/api/practicantes/:id', async (req, res) => {
    const { id } = req.params;
    const { nombres, apellidos, area } = req.body;
    try {
        await pool.query(
            'UPDATE practicantes SET nombres=$1, apellidos=$2, area=$3 WHERE id_practicantes=$4',
            [nombres, apellidos, area, id]
        );
        res.json({ message: 'Actualizado correctamente' });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar' });
    }
});

// --- 6. ELIMINAR PRACTICANTE ---
app.delete('/api/practicantes/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // Al usar ON DELETE CASCADE en la base de datos, esto es más seguro
        await pool.query('DELETE FROM asistencia WHERE id_practicantes=$1', [id]);
        await pool.query('DELETE FROM practicantes WHERE id_practicantes=$1', [id]);
        res.json({ message: 'Eliminado correctamente' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar' });
    }
});

// --- 7. NUEVA QUINCENA (RESET TOTAL) ---
app.delete('/api/reset', async (req, res) => {
    try {
        await pool.query('DELETE FROM asistencia');
        res.json({ message: '🔄 Nueva quincena iniciada correctamente' });
    } catch (error) {
        console.error("ERROR RESET:", error);
        res.status(500).json({ error: 'Error al reiniciar la quincena' });
    }
});

// Escuchar en el puerto definido por Render o 3000 por defecto
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));