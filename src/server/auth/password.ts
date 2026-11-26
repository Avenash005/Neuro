/**
 * VIOLET Local Authentication: Password Hashing & Security
 * Uses Argon2id for cryptographic password hashing and enforces password complexity.
 */

import argon2 from 'argon2';

export interface PasswordValidationResult {
  valid: boolean;
  score: number;
  error?: string;
}

/**
 * Validates password strength and requirements:
 * - Minimum 8 characters
 * - Cannot be purely whitespace
 */
export function validatePasswordStrength(password: string): PasswordValidationResult {
  if (!password || typeof password !== 'string') {
    return { valid: false, score: 0, error: 'Password is required.' };
  }

  const trimmed = password.trim();
  if (trimmed.length < 8) {
    return {
      valid: false,
      score: 1,
      error: 'Password must be at least 8 characters long.',
    };
  }

  let score = 0;
  if (trimmed.length >= 8) score++;
  if (trimmed.length >= 12) score++;
  if (/[A-Z]/.test(trimmed)) score++;
  if (/[0-9]/.test(trimmed)) score++;
  if (/[^A-Za-z0-9]/.test(trimmed)) score++;

  return { valid: true, score };
}

/**
 * Hashes a plaintext password using Argon2id.
 * Never stores or returns plaintext passwords.
 */
export async function hashPassword(password: string): Promise<string> {
  const validation = validatePasswordStrength(password);
  if (!validation.valid) {
    throw new Error(validation.error || 'Password does not meet security requirements.');
  }

  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MB
    timeCost: 3,       // 3 iterations
    parallelism: 4,    // 4 threads
  });
}

/**
 * Verifies a plaintext password against an Argon2id hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) return false;
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
