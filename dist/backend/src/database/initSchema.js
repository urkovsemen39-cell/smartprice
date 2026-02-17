"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeDatabase = initializeDatabase;
const database_1 = __importDefault(require("../config/database"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
async function initializeDatabase() {
    try {
        console.log('🔍 Checking if database is initialized...');
        // Проверяем, существует ли таблица users
        const result = await database_1.default.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);
        const tableExists = result.rows[0].exists;
        if (tableExists) {
            console.log('✅ Database already initialized');
            return;
        }
        console.log('📊 Initializing database schema...');
        // Читаем SQL файл
        const schemaPath = path_1.default.join(__dirname, 'schema.sql');
        const schemaSql = fs_1.default.readFileSync(schemaPath, 'utf-8');
        // Выполняем SQL
        await database_1.default.query(schemaSql);
        console.log('✅ Database schema initialized successfully');
    }
    catch (error) {
        console.error('❌ Failed to initialize database:', error);
        throw error;
    }
}
