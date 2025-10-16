declare module 'speakeasy' {
  export interface GenerateSecretOptions {
    length?: number;
    name?: string;
    issuer?: string;
    symbols?: boolean;
  }

  export interface Secret {
    ascii: string;
    hex: string;
    base32: string;
    otpauth_url: string;
  }

  export interface VerifyOptions {
    secret: string;
    token: string;
    window?: number;
    time?: number;
    step?: number;
    encoding?: string;
  }

  export interface TOTPOptions {
    secret: string;
    time?: number;
    step?: number;
    encoding?: string;
  }

  export function generateSecret(options?: GenerateSecretOptions): Secret;

  export const totp: {
    verify(options: VerifyOptions): boolean;
    generate(options: TOTPOptions): string;
  };

  export const hotp: {
    verify(options: VerifyOptions & { counter: number }): boolean;
    generate(options: TOTPOptions & { counter: number }): string;
  };
}
