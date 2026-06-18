require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

const { getDb } = require('./src/database/db');
const { seed, seedUsers } = require('./src/database/seed');
const authRouter        = require('./src/routes/auth');
const usersRouter       = require('./src/routes/users');
const departmentsRouter = require('./src/routes/departments');
const employeesRouter   = require('./src/routes/employees');
const scheduleRouter    = require('./src/routes/schedule');
const errorHandler      = require('./src/middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(compression());
app.use(cors({ origin: '*' }));
app.use(morgan('dev'));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api/auth',        authRouter);
app.use('/api/users',       usersRouter);
app.use('/api/departments', departmentsRouter);
app.use('/api/employees',   employeesRouter);
app.use('/api/schedule',    scheduleRouter);
app.use(errorHandler);

async function start() {
  await getDb();      // Initialize DB + create tables
  await seed();       // Seed initial data if empty
  await seedUsers();  // Ensure an admin user exists
  app.listen(PORT, () => {
    console.log(`\n🏥  Rol de Turno API → http://localhost:${PORT}/api/health\n`);
  });
}

start().catch(err => { console.error('Startup error:', err); process.exit(1); });
