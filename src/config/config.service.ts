import { Injectable } from '@nestjs/common';

@Injectable()
export class ConfigService {
  get(key: string, defaultValue?: string): string {
    return process.env[key] ?? defaultValue ?? '';
  }

  getBoolean(key: string, defaultValue = false): boolean {
    const value = process.env[key];
    if (value === undefined) {
      return defaultValue;
    }

    return value === 'true' || value === '1';
  }

  getNumber(key: string, defaultValue = 0): number {
    const value = process.env[key];
    if (value === undefined) {
      return defaultValue;
    }

    const parsed = Number(value);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }

  getRecord(key: string, defaultValue: Record<string, string> = {}): Record<string, string> {
    const value = process.env[key];
    if (!value) {
      return defaultValue;
    }

    try {
      return JSON.parse(value) as Record<string, string>;
    } catch {
      return defaultValue;
    }
  }
}
