import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

import type { MobileUiuxScreenResource } from '@/lib/mobile-uiux/bridge-manifest';
import {
  patchMobileUiuxDcScript,
  patchMobileUiuxDcScriptSource,
} from '@/lib/mobile-uiux/dc-script-patch';

const FIXTURE_ROOT = path.join(process.cwd(), 'private-assets', 'mobile-uiux');

const SCREEN_RESOURCES = [
  'home',
  'reservations',
  'patients',
  'daily-reports',
  'settings',
  'settings-detail',
] as const satisfies readonly MobileUiuxScreenResource[];

type ApplyReadData = (screen: string, payload: unknown) => boolean;

type EvaluatedWindow = {
  __MOBILE_UIUX_APPLY_READ_DATA__?: ApplyReadData & {
    __mobileUiuxHydrationOwner?: unknown;
  };
};

type EvaluatedComponent = {
  state: Record<string, unknown>;
  props: Record<string, unknown>;
  calls?: string[];
  renderVals: () => Record<string, unknown>;
  componentDidMount: () => void;
  componentWillUnmount: () => void;
};

type EvaluatedSandbox = {
  window: EvaluatedWindow;
  __Component?: new () => EvaluatedComponent;
  Date: DateConstructor;
};

function wrapDcScript(source: string): string {
  return `<script type="text/x-dc" data-dc-script>${source}</script>`;
}

function countRenderValsMethods(source: string): number {
  return source.match(/renderVals\(/g)?.length ?? 0;
}

function evaluatePatchedComponent(source: string): {
  component: EvaluatedComponent;
  window: EvaluatedWindow;
} {
  const sandbox: EvaluatedSandbox = {
    window: {},
    Date,
  };
  vm.runInNewContext(
    `
class DCLogic {
  constructor() {
    this.state = {};
    this.props = {};
  }
  setState(update) {
    this.state = { ...this.state, ...update };
  }
  forceUpdate() {
    this.forceUpdated = true;
  }
}
${source}
globalThis.__Component = Component;
`,
    sandbox
  );

  if (!sandbox.__Component) {
    throw new Error('Component was not evaluated');
  }

  return {
    component: new sandbox.__Component(),
    window: sandbox.window,
  };
}

function getRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected record value');
  }
  return value as Record<string, unknown>;
}

describe('patchMobileUiuxDcScript', () => {
  it.each(SCREEN_RESOURCES)(
    'renames and delegates renderVals for the real %s fixture',
    async resource => {
      const html = await readFile(
        path.join(FIXTURE_ROOT, `${resource}.dc.html`),
        'utf-8'
      );
      const patched = patchMobileUiuxDcScript(html, {
        screen: 'reservations',
      });

      expect(patched).toContain('class Component extends DCLogic');
      expect(patched).toContain('__mobileUiuxOriginalRenderVals');
      expect(patched).toContain('__mobileUiuxOriginalComponentDidMount');
      expect(patched).toContain('window.__MOBILE_UIUX_APPLY_READ_DATA__');
      expect(countRenderValsMethods(patched)).toBe(1);
    }
  );

  it('fails when renderVals is missing', () => {
    expect(() =>
      patchMobileUiuxDcScriptSource('class Component extends DCLogic {}', {
        screen: 'reservations',
      })
    ).toThrow('Expected exactly one renderVals(');
  });

  it('fails when renderVals appears more than once', () => {
    expect(() =>
      patchMobileUiuxDcScriptSource(
        `class Component extends DCLogic {
  renderVals() { return {}; }
  renderVals() { return {}; }
}`,
        { screen: 'reservations' }
      )
    ).toThrow('Expected exactly one renderVals(');
  });

  it('skips braces in strings, template literals, template expressions, and comments', () => {
    const source = `class Component extends DCLogic {
  renderVals() {
    const single = '}';
    const double = "{";
    const template = \`prefix \${(() => { return '}'; })()} suffix\`;
    // }
    /* { */
    return { single, double, template };
  }
}`;

    const patched = patchMobileUiuxDcScriptSource(source, {
      screen: 'reservations',
    });
    const { component } = evaluatePatchedComponent(patched);
    const vals = component.renderVals();

    expect(vals.single).toBe('}');
    expect(vals.double).toBe('{');
    expect(vals.template).toBe('prefix } suffix');
    expect(patched).toContain('__mobileUiuxOriginalRenderVals');
  });

  it('delegates lifecycle methods and unregisters the hydration bridge', () => {
    const patched = patchMobileUiuxDcScriptSource(
      `class Component extends DCLogic {
  constructor() {
    super();
    this.calls = [];
  }
  componentDidMount() {
    this.calls.push('mount');
  }
  componentWillUnmount() {
    this.calls.push('unmount');
  }
  renderVals() {
    return { sample: true };
  }
}`,
      { screen: 'reservations' }
    );
    const { component, window } = evaluatePatchedComponent(patched);

    component.componentDidMount();

    expect(component.calls).toEqual(['mount']);
    expect(typeof window.__MOBILE_UIUX_APPLY_READ_DATA__).toBe('function');

    component.componentWillUnmount();

    expect(component.calls).toEqual(['mount', 'unmount']);
    expect(window.__MOBILE_UIUX_APPLY_READ_DATA__).toBeUndefined();
  });

  it('merges reservations hydration overrides after the original renderVals result', () => {
    const patched = patchMobileUiuxDcScript(
      wrapDcScript(`class Component extends DCLogic {
  initial(name) {
    return name.trim().charAt(0);
  }
  renderVals() {
    return {
      dateLabel: 'sample-date',
      sumTotal: 99,
      sumConf: 99,
      sumUnc: 99,
      sumCancel: 99,
      rows: [{ patient: 'sample-patient' }]
    };
  }
}`),
      {
        screen: 'reservations',
      }
    );
    const script = patched
      .replace(/^<script[^>]*>/, '')
      .replace(/<\/script>$/, '');
    const { component, window } = evaluatePatchedComponent(script);

    component.componentDidMount();
    const applied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.('reservations', {
      success: true,
      data: {
        date: '2026-04-27',
        reservations: [
          {
            customerName: 'BFF 患者A',
            menuName: 'BFF メニューA',
            staffName: 'BFF 先生A',
            startTime: '2026-04-27T01:00:00.000Z',
            endTime: '2026-04-27T01:30:00.000Z',
            status: 'confirmed',
          },
          {
            customerName: 'BFF 患者B',
            menuName: 'BFF メニューB',
            staffName: 'BFF 先生B',
            startTime: '2026-04-27T02:00:00.000Z',
            endTime: '2026-04-27T02:30:00.000Z',
            status: 'unconfirmed',
          },
          {
            customerName: 'BFF 患者C',
            menuName: 'BFF メニューC',
            staffName: 'BFF 先生C',
            startTime: '2026-04-27T03:00:00.000Z',
            endTime: '2026-04-27T03:30:00.000Z',
            status: 'cancelled',
          },
        ],
      },
      generatedAt: '2026-04-27T00:00:00.000Z',
    });
    const vals = component.renderVals();
    const rows = Array.isArray(vals.rows) ? vals.rows : [];
    const firstRow = getRecord(rows[0]);

    expect(applied).toBe(true);
    expect(vals.dateLabel).toBe('4/27（月）');
    expect(vals.sumTotal).toBe(2);
    expect(vals.sumConf).toBe(1);
    expect(vals.sumUnc).toBe(1);
    expect(vals.sumCancel).toBe(1);
    expect(firstRow.patient).toBe('BFF 患者A');
    expect(firstRow.menu).toBe('BFF メニューA');
    expect(firstRow.ther).toBe('BFF 先生A');
    expect(firstRow.startT).toBe('10:00');
    expect(firstRow.endT).toBe('10:30');
    expect(firstRow.statusLabel).toBe('確定');
    expect(vals.rows).not.toEqual([{ patient: 'sample-patient' }]);
  });

  it('keeps sample values when the payload is invalid', () => {
    const patched = patchMobileUiuxDcScriptSource(
      `class Component extends DCLogic {
  renderVals() {
    return { dateLabel: 'sample-date', rows: [{ patient: 'sample-patient' }] };
  }
}`,
      { screen: 'reservations' }
    );
    const { component, window } = evaluatePatchedComponent(patched);

    component.componentDidMount();
    const applied = window.__MOBILE_UIUX_APPLY_READ_DATA__?.('reservations', {
      success: true,
      data: {
        reservations: [],
      },
    });
    const vals = component.renderVals();

    expect(applied).toBe(false);
    expect(vals.dateLabel).toBe('sample-date');
    expect(vals.rows).toEqual([{ patient: 'sample-patient' }]);
  });
});
