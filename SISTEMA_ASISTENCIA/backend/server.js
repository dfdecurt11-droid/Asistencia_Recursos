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

// --- GESTIÓN DE PRACTICANTES ---

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

// --- GESTIÓN DE ASISTENCIA ---

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
                        (SUM(
                            CEIL(EXTRACT(EPOCH FROM (COALESCE(a.hora_salida, a.hora_entrada) - a.hora_entrada)) / 60)
                        ) * INTERVAL '1 minute'), 
                        'HH24:MI:SS'
                    ), 
                    '00:00:00'
                ) AS horas_acumuladas
            FROM practicantes p 
            LEFT JOIN asistencia a ON p.id_practicantes = a.id_practicantes
            GROUP BY p.id_practicantes, p.nombres, p.apellidos, p.area
            ORDER BY p.apellidos ASC`);
        res.json(result.rows);
    } catch (error) {
        console.error("Error en reporte SQL:", error);
        res.status(500).json({ error: 'Error en reporte' });
    }
});

app.delete('/api/reset', async (req, res) => {
    try {
        await pool.query('TRUNCATE TABLE asistencia RESTART IDENTITY CASCADE');
        res.json({ message: '🔄 Reiniciado' });
    } catch (error) {
        res.status(500).json({ error: 'Error al reiniciar' });
    }
});

// --- MÓDULO DE PAGOS Y ENTREGABLES ---

app.post('/api/pagos', async (req, res) => {
    const { nombre, entregables, monto_unidad, total } = req.body;
    
    try {
        const query = 'INSERT INTO pagos (practicante, cant_entregables, monto_por_entregable, total_pagado, fecha) VALUES ($1, $2, $3, $4, NOW())';
        const values = [nombre, entregables, monto_unidad, total];
        
        await pool.query(query, values); // Usando el mismo pool configurado arriba
        res.status(200).json({ message: "Pago guardado exitosamente" });
    } catch (err) {
        console.error("Error al registrar pago:", err);
        res.status(500).json({ error: "Error al registrar el pago" });
    }
});

// --- INICIO DEL SERVIDOR ---

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});