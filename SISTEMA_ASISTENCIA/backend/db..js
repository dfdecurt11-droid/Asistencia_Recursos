const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',           // tu usuario
  host: 'localhost',           // servidor DB
  database: 'asistencia-db',// nombre de tu BD
  password: 'database',     // tu contraseña
  port: 5432                   // puerto por defecto
});

module.exports = pool;