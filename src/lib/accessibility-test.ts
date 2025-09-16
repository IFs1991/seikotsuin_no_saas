// アクセシビリティ自動テスト
export interface AccessibilityIssue {
  element: Element;
  issue: string;
  severity: 'error' | 'warning' | 'info';
  wcag: string;
}

export class AccessibilityTester {
  private issues: AccessibilityIssue[] = [];

  testPage(): AccessibilityIssue[] {
    this.issues = [];
    
    if (typeof window === 'undefined') {
      return this.issues;
    }

    this.checkTouchTargets();
    this.checkColorContrast();
    this.checkAriaLabels();
    this.checkFocusManagement();
    this.checkHeadingStructure();
    this.checkFormLabels();
    
    return this.issues;
  }

  private addIssue(element: Element, issue: string, severity: AccessibilityIssue['severity'], wcag: string) {
    this.issues.push({ element, issue, severity, wcag });
  }

  private checkTouchTargets() {
    const interactiveElements = document.querySelectorAll(
      'button, a, input, select, textarea, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])'
    );

    interactiveElements.forEach(element => {
      const rect = element.getBoundingClientRect();
      const minSize = 24; // WCAG 2.2 minimum
      
      if (rect.width < minSize || rect.height < minSize) {
        this.addIssue(
          element, 
          `Touch target too small: ${rect.width.toFixed(1)}x${rect.height.toFixed(1)}px (minimum: ${minSize}px)`,
          'error',
          'WCAG 2.2 - 2.5.8'
        );
      }
    });
  }

  private checkColorContrast() {
    // 基本的なコントラストチェック（完全な実装には色分析ライブラリが必要）
    const textElements = document.querySelectorAll('p, span, h1, h2, h3, h4, h5, h6, button, a, label');
    
    textElements.forEach(element => {
      const styles = window.getComputedStyle(element);
      const backgroundColor = styles.backgroundColor;
      const color = styles.color;
      
      // 透明または継承された色はスキップ
      if (backgroundColor === 'rgba(0, 0, 0, 0)' || backgroundColor === 'transparent') {
        return;
      }
      
      // 簡易的な警告（詳細な計算は省略）
      if (backgroundColor === color) {
        this.addIssue(
          element,
          'Text and background color are identical',
          'error',
          'WCAG 2.1 - 1.4.3'
        );
      }
    });
  }

  private checkAriaLabels() {
    // aria-label, aria-labelledby, aria-describedby のチェック
    const interactiveElements = document.querySelectorAll(
      'button, a, input, select, textarea, [role="button"], [role="link"]'
    );

    interactiveElements.forEach(element => {
      const hasAriaLabel = element.hasAttribute('aria-label');
      const hasAriaLabelledBy = element.hasAttribute('aria-labelledby');
      const hasTextContent = element.textContent?.trim();
      const hasAltText = element.hasAttribute('alt');
      const tagName = element.tagName.toLowerCase();

      if (!hasAriaLabel && !hasAriaLabelledBy && !hasTextContent && !hasAltText) {
        if (tagName === 'button' || tagName === 'a') {
          this.addIssue(
            element,
            `${tagName} element has no accessible name`,
            'error',
            'WCAG 2.1 - 4.1.2'
          );
        }
      }
    });

    // 画像のalt属性チェック
    const images = document.querySelectorAll('img');
    images.forEach(img => {
      if (!img.hasAttribute('alt')) {
        this.addIssue(img, 'Image missing alt attribute', 'error', 'WCAG 2.1 - 1.1.1');
      }
    });
  }

  private checkFocusManagement() {
    // フォーカス可能要素のチェック
    const focusableElements = document.querySelectorAll(
      'button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    focusableElements.forEach((element, index) => {
      const tabIndex = element.getAttribute('tabindex');
      
      // 正の tabindex は避けるべき
      if (tabIndex && parseInt(tabIndex) > 0) {
        this.addIssue(
          element,
          'Positive tabindex found - can cause confusing tab order',
          'warning',
          'WCAG 2.1 - 2.4.3'
        );
      }

      // フォーカス表示の確認（スタイルベース）
      const styles = window.getComputedStyle(element);
      if (styles.outline === 'none' && !styles.boxShadow.includes('ring')) {
        this.addIssue(
          element,
          'Element may not have visible focus indicator',
          'warning',
          'WCAG 2.1 - 2.4.7'
        );
      }
    });
  }

  private checkHeadingStructure() {
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    let previousLevel = 0;
    
    headings.forEach(heading => {
      const currentLevel = parseInt(heading.tagName.substring(1));
      
      if (currentLevel > previousLevel + 1) {
        this.addIssue(
          heading,
          `Heading level jumps from h${previousLevel} to h${currentLevel}`,
          'error',
          'WCAG 2.1 - 1.3.1'
        );
      }
      
      previousLevel = currentLevel;
    });

    // h1が複数または0個の場合
    const h1Count = document.querySelectorAll('h1').length;
    if (h1Count === 0) {
      this.addIssue(
        document.body,
        'Page should have exactly one h1 element',
        'warning',
        'WCAG 2.1 - 1.3.1'
      );
    } else if (h1Count > 1) {
      this.addIssue(
        document.body,
        'Page has multiple h1 elements',
        'warning',
        'WCAG 2.1 - 1.3.1'
      );
    }
  }

  private checkFormLabels() {
    const formControls = document.querySelectorAll('input, select, textarea');
    
    formControls.forEach(control => {
      const id = control.getAttribute('id');
      const hasLabel = id && document.querySelector(`label[for="${id}"]`);
      const hasAriaLabel = control.hasAttribute('aria-label');
      const hasAriaLabelledBy = control.hasAttribute('aria-labelledby');
      
      if (!hasLabel && !hasAriaLabel && !hasAriaLabelledBy) {
        this.addIssue(
          control,
          'Form control has no associated label',
          'error',
          'WCAG 2.1 - 1.3.1'
        );
      }
    });
  }

  generateReport(): string {
    const errorCount = this.issues.filter(i => i.severity === 'error').length;
    const warningCount = this.issues.filter(i => i.severity === 'warning').length;
    const infoCount = this.issues.filter(i => i.severity === 'info').length;

    let report = `🔍 Accessibility Test Report\n`;
    report += `Total Issues: ${this.issues.length}\n`;
    report += `Errors: ${errorCount}, Warnings: ${warningCount}, Info: ${infoCount}\n\n`;

    if (this.issues.length === 0) {
      report += '✅ No accessibility issues found!\n';
      return report;
    }

    const groupedIssues = this.issues.reduce((groups, issue) => {
      if (!groups[issue.severity]) groups[issue.severity] = [];
      groups[issue.severity].push(issue);
      return groups;
    }, {} as Record<string, AccessibilityIssue[]>);

    Object.entries(groupedIssues).forEach(([severity, issues]) => {
      report += `${severity.toUpperCase()} (${issues.length}):\n`;
      issues.forEach((issue, index) => {
        report += `  ${index + 1}. ${issue.issue} (${issue.wcag})\n`;
      });
      report += '\n';
    });

    return report;
  }
}

// 開発用のヘルパー関数
export const runAccessibilityTest = () => {
  const tester = new AccessibilityTester();
  const issues = tester.testPage();
  const report = tester.generateReport();
  
  console.log(report);
  return { issues, report };
};