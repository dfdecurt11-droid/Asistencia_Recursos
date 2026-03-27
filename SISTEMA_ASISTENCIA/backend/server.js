const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();

// --- CONFIGURACIÓN DE CORS ---
// Esto permite que tu frontend se comunique con el backend sin errores de seguridad
app.use(cors());
app.use(express.json());

// --- CONFIGURACIÓN DE CONEXIÓN (Render + Supabase) ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false 
    }
});

// Verificar conexión a la base de datos al iniciar
pool.connect((err, client, release) => {
    if (err) {
        return console.error('❌ Error adquiriendo el cliente de la DB', err.stack);
    }
    console.log('✅ Conexión a la base de datos establecida');
    release();
});

// --- 1. OBTENER LISTA SIMPLE (Para el registro) ---
app.get('/api/practicantes', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM practicantes ORDER BY apellidos ASC');
        res.json(result.rows);
    } catch (error) {
        console.error("ERROR AL OBTENER:", error);
        res.status(500).json({ error: 'Error al obtener datos' });
    }
});

// --- 2. REPORTE DETALLADO (Para reporte.html) ---
// Este es el que calcula las horas y muestra entradas/salidas
app.get('/api/reporte', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                p.id_practicantes,
                p.nombres,
                p.apellidos,
                p.area,
                (SELECT hora_entrada FROM asistencia WHERE id_practicantes = p.id_practicantes ORDER BY id DESC LIMIT 1) AS hora_entrada,
                (SELECT hora_salida FROM asistencia WHERE id_practicantes = p.id_practicantes ORDER BY id DESC LIMIT 1) AS hora_salida,
                COALESCE(
                    (SELECT TO_CHAR(SUM(hora_salida - hora_entrada), 'HH24:MI:SS') 
                     FROM asistencia 
                     WHERE id_practicantes = p.id_practicantes AND hora_salida IS NOT NULL),
                    '00:00:00'
                ) AS horas_acumuladas
            FROM practicantes p
            ORDER BY p.apellidos ASC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error("ERROR REPORTE:", error);
        res.status(500).json({ error: 'Error en generar reporte' });
    }
});

// --- 3. REGISTRAR NUEVO PRACTICANTE ---
app.post('/api/practicantes', async (req, res) => {
    const { nombres, apellidos, area } = req.body;
    if (!nombres || !apellidos || !area) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }
    try {
        const result = await pool.query(
            'INSERT INTO practicantes (nombres, apellidos, area) VALUES ($1, $2, $3) RETURNING *',
            [nombres, apellidos, area]
        );
        res.status(201).json({ message: '✅ Practicante registrado', practicante: result.rows[0] });
    } catch (error) {
        console.error("ERROR AL GUARDAR:", error);
        res.status(500).json({ error: 'Error al guardar practicante' });
    }
});

// --- 4. REGISTRAR ASISTENCIA (ENTRADA/SALIDA) ---
app.post('/api/asistencia/:id', async (req, res) => {
    const { id } = req.params;
    const { tipo } = req.body;

    try {
        if (tipo === 'entrada') {
            // Verificar si ya tiene una entrada sin salida
            const activa = await pool.query('SELECT id FROM asistencia WHERE id_practicantes = $1 AND hora_salida IS NULL', [id]);
            if (activa.rows.length > 0) {
                return res.status(400).json({ message: 'Ya tienes una entrada registrada sin marcar salida.' });
            }

            await pool.query(
                'INSERT INTO asistencia (id_practicantes, hora_entrada) VALUES ($1, CURRENT_TIMESTAMP)',
                [id]
            );
            res.json({ message: '🕒 Entrada registrada con éxito' });
        } else {
            const result = await pool.query(
                `UPDATE asistencia 
                 SET hora_salida = CURRENT_TIMESTAMP 
                 WHERE id_practicantes = $1 AND hora_salida IS NULL 
                 RETURNING id`,
                [id]
            );

            if (result.rows.length === 0) {
                return res.status(400).json({ message: 'No hay una entrada abierta para cerrar.' });
            }

            res.json({ message: '✅ Salida registrada con éxito' });
        }
    } catch (error) {
        console.error("ERROR ASISTENCIA:", error);
        res.status(500).json({ error: 'Error procesando asistencia' });
    }
});

// --- 5. EDITAR PRACTICANTE ---
app.put('/api/practicantes/:id', async (req, res) => {
    const { id } = req.params;
    const { nombres, apellidos, area } = req.body;
    try {
        const result = await pool.query(
            'UPDATE practicantes SET nombres=$1, apellidos=$2, area=$3 WHERE id_practicantes=$4',
            [nombres, apellidos, area, id]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
        res.json({ message: '✅ Actualizado correctamente' });
    } catch (error) {
        console.error("ERROR EDITAR:", error);
        res.status(500).json({ error: 'Error al actualizar' });
    }
});

// --- 6. ELIMINAR PRACTICANTE ---
app.delete('/api/practicantes/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // Primero borramos asistencias por la integridad referencial
        await pool.query('DELETE FROM asistencia WHERE id_practicantes=$1', [id]);
        const result = await pool.query('DELETE FROM practicantes WHERE id_practicantes=$1', [id]);
        
        if (result.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
        res.json({ message: '🗑️ Eliminado correctamente' });
    } catch (error) {
        console.error("ERROR ELIMINAR:", error);
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

// Puerto dinámico para Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor activo en puerto ${PORT}`);
});