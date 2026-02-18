#!/usr/bin/env node

/**
 * Скрипт проверки безопасности перед деплоем
 * Использование: node scripts/check-security.js
 */

const fs = require('fs');
const path = require('path');

let errors = [];
let warnings = [];
let passed = [];

console.log('🔒 Проверка безопасности проекта...\n');

// 1. Проверка .env файлов
function checkEnvFiles() {
  const envExample = path.join(__dirname, '../.env.example');
  const envFile = path.join(__dirname, '../.env');
  
  if (!fs.existsSync(envExample)) {
    errors.push('.env.example файл не найден');
  } else {
    passed.push('.env.example существует');
  }
  
  if (fs.existsSync(envFile)) {
    const content = fs.readFileSync(envFile, 'utf8');
    
    // Проверка на дефолтные секреты
    if (content.includes('your-secret-key') || content.includes('changeme')) {
      errors.push('.env содержит дефолтные секреты');
    }
    
    // Проверка длины JWT_SECRET
    const jwtMatch = content.match(/JWT_SECRET=(.+)/);
    if (jwtMatch && jwtMatch[1].length < 32) {
      errors.push('JWT_SECRET слишком короткий (минимум 32 символа)');
    } else if (jwtMatch) {
      passed.push('JWT_SECRET имеет достаточную длину');
    }
    
    // Проверка длины SESSION_SECRET
    const sessionMatch = content.match(/SESSION_SECRET=(.+)/);
    if (sessionMatch && sessionMatch[1].length < 32) {
      errors.push('SESSION_SECRET слишком короткий (минимум 32 символа)');
    } else if (sessionMatch) {
      passed.push('SESSION_SECRET имеет достаточную длину');
    }
  }
}

// 2. Проверка TypeScript конфигурации
function checkTypeScript() {
  const tsconfigPath = path.join(__dirname, '../tsconfig.json');
  
  if (fs.existsSync(tsconfigPath)) {
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
    
    if (tsconfig.compilerOptions.strict === true) {
      passed.push('TypeScript strict mode включен');
    } else {
      errors.push('TypeScript strict mode отключен');
    }
  } else {
    errors.push('tsconfig.json не найден');
  }
}

// 3. Проверка Docker конфигурации
function checkDocker() {
  const dockerfilePath = path.join(__dirname, '../Dockerfile');
  
  if (fs.existsSync(dockerfilePath)) {
    const content = fs.readFileSync(dockerfilePath, 'utf8');
    
    if (content.includes('USER node') || content.includes('USER nodejs')) {
      passed.push('Docker использует непривилегированного пользователя');
    } else {
      errors.push('Docker запускается от root пользователя');
    }
    
    if (content.includes('HEALTHCHECK')) {
      passed.push('Docker HEALTHCHECK настроен');
    } else {
      warnings.push('Docker HEALTHCHECK не настроен');
    }
  }
}

// 4. Проверка package.json на уязвимости
function checkPackageJson() {
  const packagePath = path.join(__dirname, '../package.json');
  
  if (fs.existsSync(packagePath)) {
    passed.push('package.json найден');
    warnings.push('Запустите "npm audit" для проверки уязвимостей');
  }
}

// 5. Проверка наличия критических файлов
function checkCriticalFiles() {
  const criticalFiles = [
    'src/middleware/securityMiddleware.ts',
    'src/middleware/auth.ts',
    'src/services/auth/authService.ts',
    'src/config/env.ts',
  ];
  
  criticalFiles.forEach(file => {
    const filePath = path.join(__dirname, '..', file);
    if (fs.existsSync(filePath)) {
      passed.push(`${file} существует`);
    } else {
      errors.push(`${file} не найден`);
    }
  });
}

// 6. Проверка .gitignore
function checkGitignore() {
  const gitignorePath = path.join(__dirname, '../.gitignore');
  
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf8');
    
    if (content.includes('.env')) {
      passed.push('.env файлы игнорируются Git');
    } else {
      errors.push('.env файлы НЕ игнорируются Git - КРИТИЧНО!');
    }
    
    if (content.includes('node_modules')) {
      passed.push('node_modules игнорируется Git');
    }
  } else {
    errors.push('.gitignore не найден');
  }
}

// Запуск всех проверок
checkEnvFiles();
checkTypeScript();
checkDocker();
checkPackageJson();
checkCriticalFiles();
checkGitignore();

// Вывод результатов
console.log('='.repeat(80));
console.log('РЕЗУЛЬТАТЫ ПРОВЕРКИ БЕЗОПАСНОСТИ');
console.log('='.repeat(80));
console.log('');

if (passed.length > 0) {
  console.log('✅ ПРОЙДЕНО (' + passed.length + '):');
  passed.forEach(msg => console.log('  ✓ ' + msg));
  console.log('');
}

if (warnings.length > 0) {
  console.log('⚠️  ПРЕДУПРЕЖДЕНИЯ (' + warnings.length + '):');
  warnings.forEach(msg => console.log('  ! ' + msg));
  console.log('');
}

if (errors.length > 0) {
  console.log('❌ ОШИБКИ (' + errors.length + '):');
  errors.forEach(msg => console.log('  ✗ ' + msg));
  console.log('');
}

console.log('='.repeat(80));
console.log('');

if (errors.length === 0) {
  console.log('✅ Все проверки безопасности пройдены!');
  console.log('');
  console.log('Рекомендации перед деплоем:');
  console.log('1. Запустите: npm audit');
  console.log('2. Запустите: npm test');
  console.log('3. Проверьте все переменные окружения');
  console.log('4. Убедитесь, что HTTPS включен');
  console.log('5. Настройте мониторинг и алерты');
  process.exit(0);
} else {
  console.log('❌ Обнаружены критические проблемы безопасности!');
  console.log('Исправьте ошибки перед деплоем в продакшен.');
  process.exit(1);
}
