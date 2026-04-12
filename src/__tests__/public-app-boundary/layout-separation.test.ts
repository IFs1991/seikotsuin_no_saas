import * as fs from 'fs';
import * as path from 'path';

/**
 * Layout Separation Test
 *
 * Verifies that (public) and (app) route groups have the correct
 * layout structure by inspecting file contents.
 */
describe('Layout Separation: (public) vs (app)', () => {
  const appDir = path.resolve(__dirname, '../../app');

  describe('(public)/layout.tsx', () => {
    const publicLayoutPath = path.join(appDir, '(public)', 'layout.tsx');

    it('should exist', () => {
      expect(fs.existsSync(publicLayoutPath)).toBe(true);
    });

    it('should NOT contain Sidebar', () => {
      const content = fs.readFileSync(publicLayoutPath, 'utf-8');
      expect(content).not.toContain('Sidebar');
    });

    it('should NOT contain Header component import', () => {
      const content = fs.readFileSync(publicLayoutPath, 'utf-8');
      expect(content).not.toContain("from '@/components/navigation/header'");
    });

    it('should NOT contain QueryProvider', () => {
      const content = fs.readFileSync(publicLayoutPath, 'utf-8');
      expect(content).not.toContain('QueryProvider');
    });
  });

  describe('(app)/layout.tsx', () => {
    const appLayoutPath = path.join(appDir, '(app)', 'layout.tsx');

    it('should exist', () => {
      expect(fs.existsSync(appLayoutPath)).toBe(true);
    });

    it('should contain Sidebar', () => {
      const content = fs.readFileSync(appLayoutPath, 'utf-8');
      expect(content).toContain('Sidebar');
    });

    it('should contain Header', () => {
      const content = fs.readFileSync(appLayoutPath, 'utf-8');
      expect(content).toContain('Header');
    });

    it('should contain QueryProvider', () => {
      const content = fs.readFileSync(appLayoutPath, 'utf-8');
      expect(content).toContain('QueryProvider');
    });

    it('should contain UserProfileProvider', () => {
      const content = fs.readFileSync(appLayoutPath, 'utf-8');
      expect(content).toContain('UserProfileProvider');
    });

    it('should be a client component', () => {
      const content = fs.readFileSync(appLayoutPath, 'utf-8');
      expect(content).toContain("'use client'");
    });
  });

  describe('Root layout.tsx', () => {
    const rootLayoutPath = path.join(appDir, 'layout.tsx');

    it('should exist', () => {
      expect(fs.existsSync(rootLayoutPath)).toBe(true);
    });

    it('should NOT import ClientLayout', () => {
      const content = fs.readFileSync(rootLayoutPath, 'utf-8');
      expect(content).not.toContain('ClientLayout');
      expect(content).not.toContain('client-layout');
    });

    it('should contain html and body tags', () => {
      const content = fs.readFileSync(rootLayoutPath, 'utf-8');
      expect(content).toContain('<html');
      expect(content).toContain('<body');
    });

    it('should import globals.css', () => {
      const content = fs.readFileSync(rootLayoutPath, 'utf-8');
      expect(content).toContain('globals.css');
    });
  });
});
