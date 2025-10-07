declare module 'qrcode' {
  export interface QRCodeRenderersOptions {
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    type?: 'image/png' | 'image/jpeg' | 'image/webp';
    quality?: number;
    margin?: number;
    color?: {
      dark?: string;
      light?: string;
    };
    width?: number;
    scale?: number;
    small?: boolean;
  }

  export interface QRCodeToDataURLOptions extends QRCodeRenderersOptions {
    rendererOpts?: {
      quality?: number;
    };
  }

  export interface QRCodeToFileOptions extends QRCodeRenderersOptions {
    rendererOpts?: {
      quality?: number;
    };
  }

  export function toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>;
  export function toDataURL(text: string, callback: (error: Error | null, url: string) => void): void;
  export function toDataURL(text: string, options: QRCodeToDataURLOptions, callback: (error: Error | null, url: string) => void): void;

  export function toFile(path: string, text: string, options?: QRCodeToFileOptions): Promise<void>;
  export function toFile(path: string, text: string, callback: (error: Error | null) => void): void;
  export function toFile(path: string, text: string, options: QRCodeToFileOptions, callback: (error: Error | null) => void): void;

  export function toString(text: string, options?: QRCodeRenderersOptions): Promise<string>;
  export function toString(text: string, callback: (error: Error | null, string: string) => void): void;
  export function toString(text: string, options: QRCodeRenderersOptions, callback: (error: Error | null, string: string) => void): void;

  export function toCanvas(canvas: HTMLCanvasElement, text: string, options?: QRCodeRenderersOptions): Promise<void>;
  export function toCanvas(canvas: HTMLCanvasElement, text: string, callback: (error: Error | null) => void): void;
  export function toCanvas(canvas: HTMLCanvasElement, text: string, options: QRCodeRenderersOptions, callback: (error: Error | null) => void): void;

  export function toCanvas(text: string, options?: QRCodeRenderersOptions): Promise<HTMLCanvasElement>;
  export function toCanvas(text: string, callback: (error: Error | null, canvas: HTMLCanvasElement) => void): void;
  export function toCanvas(text: string, options: QRCodeRenderersOptions, callback: (error: Error | null, canvas: HTMLCanvasElement) => void): void;

  export function toSVG(text: string, options?: QRCodeRenderersOptions): Promise<string>;
  export function toSVG(text: string, callback: (error: Error | null, svg: string) => void): void;
  export function toSVG(text: string, options: QRCodeRenderersOptions, callback: (error: Error | null, svg: string) => void): void;
}