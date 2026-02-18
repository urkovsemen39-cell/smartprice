/**
 * Enhanced Password Validation
 * Проверка паролей на безопасность
 */

import { AUTH, VALIDATION } from '../config/constants';

interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
  strength: 'weak' | 'medium' | 'strong';
  score: number;
}

export class PasswordValidator {
  /**
   * Полная валидация пароля
   */
  static validate(password: string): PasswordValidationResult {
    const errors: string[] = [];
    let score = 0;

    // Проверка длины
    if (password.length < AUTH.PASSWORD_MIN_LENGTH) {
      errors.push(`Password must be at least ${AUTH.PASSWORD_MIN_LENGTH} characters long`);
    } else if (password.length >= 12) {
      score += 2;
    } else {
      score += 1;
    }

    if (password.length > AUTH.PASSWORD_MAX_LENGTH) {
      errors.push(`Password must not exceed ${AUTH.PASSWORD_MAX_LENGTH} characters`);
    }

    // Проверка на общие пароли
    if (this.isCommonPassword(password)) {
      errors.push('Password is too common');
    }

    // Проверка на последовательности
    if (this.hasSequentialCharacters(password)) {
      errors.push('Password contains sequential characters');
    }

    // Проверка на повторяющиеся символы
    if (this.hasRepeatedCharacters(password)) {
      errors.push('Password contains too many repeated characters');
    }

    // Проверка сложности
    const hasLowercase = /[a-z]/.test(password);
    const hasUppercase = /[A-Z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    if (!hasLowercase) {
      errors.push('Password must contain at least one lowercase letter');
    } else {
      score += 1;
    }

    if (!hasUppercase) {
      errors.push('Password must contain at least one uppercase letter');
    } else {
      score += 1;
    }

    if (!hasNumbers) {
      errors.push('Password must contain at least one number');
    } else {
      score += 1;
    }

    if (!hasSpecialChars) {
      errors.push('Password must contain at least one special character');
    } else {
      score += 2;
    }

    // Определение силы пароля
    let strength: 'weak' | 'medium' | 'strong' = 'weak';
    if (score >= 7) {
      strength = 'strong';
    } else if (score >= 4) {
      strength = 'medium';
    }

    return {
      valid: errors.length === 0,
      errors,
      strength,
      score,
    };
  }

  /**
   * Проверка на общие пароли
   */
  private static isCommonPassword(password: string): boolean {
    const lowerPassword = password.toLowerCase();
    return VALIDATION.COMMON_PASSWORDS.some(common => 
      lowerPassword.includes(common.toLowerCase())
    );
  }

  /**
   * Проверка на последовательные символы
   */
  private static hasSequentialCharacters(password: string): boolean {
    const lowerPassword = password.toLowerCase();
    
    // Проверка на последовательности из констант
    if (VALIDATION.SEQUENTIAL_PATTERNS.some(pattern => 
      lowerPassword.includes(pattern.toLowerCase())
    )) {
      return true;
    }

    // Проверка на числовые последовательности
    for (let i = 0; i < password.length - 2; i++) {
      const char1 = password.charCodeAt(i);
      const char2 = password.charCodeAt(i + 1);
      const char3 = password.charCodeAt(i + 2);

      if (char2 === char1 + 1 && char3 === char2 + 1) {
        return true;
      }
    }

    return false;
  }

  /**
   * Проверка на повторяющиеся символы
   */
  private static hasRepeatedCharacters(password: string): boolean {
    // Проверка на 3+ одинаковых символа подряд
    const repeatedPattern = /(.)\1{2,}/;
    if (repeatedPattern.test(password)) {
      return true;
    }

    // Проверка на слишком много одинаковых символов
    const charCount: { [key: string]: number } = {};
    for (const char of password) {
      charCount[char] = (charCount[char] || 0) + 1;
      if (charCount[char] > password.length / 3) {
        return true;
      }
    }

    return false;
  }

  /**
   * Проверка на схожесть с email
   */
  static isSimilarToEmail(password: string, email: string): boolean {
    const emailParts = email.toLowerCase().split('@')[0];
    const lowerPassword = password.toLowerCase();

    // Проверка на включение части email в пароль
    if (emailParts.length >= 4 && lowerPassword.includes(emailParts)) {
      return true;
    }

    // Проверка на обратное включение
    if (lowerPassword.length >= 4 && emailParts.includes(lowerPassword)) {
      return true;
    }

    return false;
  }

  /**
   * Генерация безопасного пароля
   */
  static generateSecurePassword(length: number = 16): string {
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    const allChars = lowercase + uppercase + numbers + special;
    
    let password = '';
    
    // Гарантируем наличие каждого типа символов
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];
    
    // Заполняем остальное случайными символами
    for (let i = password.length; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    // Перемешиваем символы
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }
}

export default PasswordValidator;
