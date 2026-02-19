-- Изменить роль на owner
UPDATE users 
SET role = 'owner' 
WHERE email = 'semenbrut007@yandex.ru';

-- Проверить результат
SELECT id, email, role, totp_secret IS NOT NULL as has_totp
FROM users 
WHERE email = 'semenbrut007@yandex.ru';
