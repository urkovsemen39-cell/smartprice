-- Назначить роль admin пользователю
UPDATE users 
SET role = 'admin' 
WHERE email = 'semenbrut007@yandex.ru';

-- Проверить результат
SELECT id, email, role, created_at 
FROM users 
WHERE email = 'semenbrut007@yandex.ru';
