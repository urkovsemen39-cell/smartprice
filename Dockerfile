# Backend Dockerfile
FROM node:20-alpine

WORKDIR /app

# Копируем package files
COPY package*.json ./
COPY tsconfig.json ./

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем исходный код
COPY src ./src

# Компилируем TypeScript
RUN npm run build

# Открываем порт
EXPOSE 3001

# Запускаем приложение
CMD ["npm", "start"]
