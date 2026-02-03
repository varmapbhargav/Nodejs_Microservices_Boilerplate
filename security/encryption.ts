import crypto from 'crypto';
import bcrypt from 'bcryptjs';

// Enterprise Encryption Configuration
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32;
  private readonly ivLength = 16;
  private readonly tagLength = 16;
  private readonly saltLength = 32;

  // Get encryption key from environment or generate
  private getEncryptionKey(): Buffer {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }
    return Buffer.from(key, 'hex');
  }

  // Generate secure random key
  static generateKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // Encrypt sensitive data
  encrypt(text: string): { encrypted: string; iv: string; tag: string } {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(this.ivLength);
    
    const cipher = crypto.createCipher(this.algorithm, key);
    cipher.setAAD(Buffer.from('additional-data'));
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
    };
  }

  // Decrypt sensitive data
  decrypt(encryptedData: { encrypted: string; iv: string; tag: string }): string {
    const key = this.getEncryptionKey();
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const tag = Buffer.from(encryptedData.tag, 'hex');
    
    const decipher = crypto.createDecipher(this.algorithm, key);
    decipher.setAAD(Buffer.from('additional-data'));
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  // Hash password with bcrypt
  static async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  // Verify password
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  // Generate secure random token
  static generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  // Generate UUID v4
  static generateUUID(): string {
    return crypto.randomUUID();
  }

  // Create HMAC signature
  createHMAC(data: string, secret?: string): string {
    const hmacSecret = secret || process.env.HMAC_SECRET;
    if (!hmacSecret) {
      throw new Error('HMAC_SECRET environment variable is required');
    }
    
    return crypto
      .createHmac('sha256', hmacSecret)
      .update(data)
      .digest('hex');
  }

  // Verify HMAC signature
  verifyHMAC(data: string, signature: string, secret?: string): boolean {
    const expectedSignature = this.createHMAC(data, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  // Derive key from password using PBKDF2
  static deriveKey(password: string, salt: string, iterations: number = 100000): string {
    return crypto
      .pbkdf2Sync(password, salt, iterations, 32, 'sha256')
      .toString('hex');
  }

  // Generate secure random salt
  static generateSalt(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // Encrypt JWT payload
  encryptJWTPayload(payload: any): string {
    const jsonString = JSON.stringify(payload);
    const encrypted = this.encrypt(jsonString);
    return Buffer.from(JSON.stringify(encrypted)).toString('base64');
  }

  // Decrypt JWT payload
  decryptJWTPayload(encryptedPayload: string): any {
    const encryptedData = JSON.parse(Buffer.from(encryptedPayload, 'base64').toString());
    const decrypted = this.decrypt(encryptedData);
    return JSON.parse(decrypted);
  }

  // Mask sensitive data for logging
  static maskSensitiveData(data: any): any {
    const sensitiveFields = [
      'password',
      'token',
      'secret',
      'key',
      'creditCard',
      'ssn',
      'apiKey',
      'accessToken',
      'refreshToken',
    ];

    if (typeof data !== 'object' || data === null) {
      return data;
    }

    const masked = { ...data };
    
    for (const field of sensitiveFields) {
      if (masked[field]) {
        masked[field] = '***MASKED***';
      }
    }

    return masked;
  }

  // Validate password strength
  static validatePasswordStrength(password: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  // Generate time-based one-time password (TOTP) secret
  static generateTOTPSecret(): string {
    return crypto.randomBytes(20).toString('base64');
  }

  // Verify TOTP token (simplified implementation)
  static verifyTOTP(token: string, secret: string): boolean {
    // This is a simplified implementation
    // In production, use a proper TOTP library like 'otplib'
    const timeWindow = Math.floor(Date.now() / 1000 / 30);
    const expectedToken = this.generateTOTP(secret, timeWindow);
    return token === expectedToken;
  }

  private static generateTOTP(secret: string, timeWindow: number): string {
    // Simplified TOTP generation
    // In production, use a proper TOTP library
    const hash = crypto
      .createHmac('sha1', Buffer.from(secret, 'base64'))
      .update(Buffer.from(timeWindow.toString()))
      .digest();
    
    const offset = hash[hash.length - 1] & 0x0f;
    const code =
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff);
    
    return (code % 1000000).toString().padStart(6, '0');
  }
}

export default EncryptionService;
