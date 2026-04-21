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
    const appShellPath = path.join(appDir, '(app)', 'app-shell.tsx');

    it('should exist', () => {
      expect(fs.existsSync(appLayoutPath)).toBe(true);
    });

    it('should import AppShell', () => {
      const content = fs.readFileSync(appLayoutPath, 'utf-8');
      expect(content).toContain("from './app-shell'");
      expect(content).toContain('AppShell');
    });

    it('should redirect unauthenticated users to /login', () => {
      const content = fs.readFileSync(appLayoutPath, 'utf-8');
      expect(content).toContain("redirect('/login')");
    });

    it('should be a server component wrapper', () => {
      const content = fs.readFileSync(appLayoutPath, 'utf-8');
      expect(content).not.toContain("'use client'");
    });

    it('should extract client shell into app-shell.tsx', () => {
      expect(fs.existsSync(appShellPath)).toBe(true);
    });

    it('app-shell.tsx should remain a client component', () => {
      const content = fs.readFileSync(appShellPath, 'utf-8');
      expect(content).toContain("'use client'");
    });

    it('app-shell.tsx should contain Sidebar, Header, QueryProvider, and UserProfileProvider', () => {
      const content = fs.readFileSync(appShellPath, 'utf-8');
      expect(content).toContain('Sidebar');
      expect(content).toContain('Header');
      expect(content).toContain('QueryProvider');
      expect(content).toContain('UserProfileProvider');
    });

    it('app-shell.tsx should keep desktop sidebar in normal layout flow', () => {
      const shellContent = fs.readFileSync(appShellPath, 'utf-8');
      const sidebarPath = path.join(
        appDir,
        '../components/navigation/sidebar.tsx'
      );
      const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');

      expect(shellContent).toContain('min-w-0 flex-1');
      expect(shellContent).not.toContain('lg:ml-64');
      expect(sidebarContent).toContain('md:sticky');
      expect(sidebarContent).toContain('md:flex-shrink-0');
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
