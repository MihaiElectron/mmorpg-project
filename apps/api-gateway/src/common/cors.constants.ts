// Ce module peut etre evalue avant que ConfigModule charge le .env (les
// decorateurs de gateway sont evalues au chargement du module). On charge
// dotenv explicitement ici pour garantir que CLIENT_ORIGIN est disponible.
import * as dotenv from 'dotenv';
dotenv.config();

// CLIENT_ORIGIN peut contenir plusieurs origines separees par une virgule.
// Ex: CLIENT_ORIGIN=http://localhost:5173,http://192.168.1.110:5173
const raw = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
export const CLIENT_ORIGIN: string | string[] =
  raw.includes(',') ? raw.split(',').map((o) => o.trim()) : raw;
