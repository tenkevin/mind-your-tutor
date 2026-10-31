import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AI_ROUTES } from './gateway.js';

// A7-F6: every route that reaches a model goes through the device layer on the student
// side and the backstop on the server. The server half is walked in gateway.test.ts
// (every entry of AI_ROUTES, against a raw name); this file pins the rest.

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const SOURCE = /\.(ts|tsx)$/;

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules') return [];
    return statSync(path).isDirectory() ? files(path) : SOURCE.test(name) ? [path] : [];
  });
}

describe('every model path is covered (A7-F6)', () => {
  it('lists the routes that reach a model; each is a gateway route with the backstop', () => {
    expect(AI_ROUTES.map((r) => r.url)).toEqual([
      '/api/classes/:classId/ai/tutor',
      '/api/classes/:classId/ai/peer',
      '/api/classes/:classId/ai/agent',
    ]);
    const gateway = readFileSync(join(ROOT, 'apps/api/src/ai/gateway.ts'), 'utf8');
    // The only call into the provider sits after backstop.blur in the shared handler.
    expect(gateway.match(/provider\.complete|callWithTimeout\(/g)?.length).toBeGreaterThan(0);
    expect(gateway.indexOf('backstop.blur(')).toBeLessThan(
      gateway.indexOf('await callWithTimeout('),
    );
  });

  it('lets the student app reach a model route only through askPersona, which blurs on the device', () => {
    const students = files(join(ROOT, 'apps/student/src')).filter((f) => !/\.test\./.test(f));
    const callers = students
      .filter((f) => /\}\/ai\/\$\{|\/ai\/(?:tutor|peer|agent)/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f));
    expect(callers).toEqual(['apps/student/src/ai.ts']);
    const ai = readFileSync(join(ROOT, 'apps/student/src/ai.ts'), 'utf8');
    expect(ai).toContain('anonymiser.blur(request.message)');
    expect(ai).toContain('anonymiser.refill(');
  });

  it('keeps the teacher app off model routes (staff text is not student text)', () => {
    const teacher = files(join(ROOT, 'apps/teacher/src')).filter((f) => !/\.test\./.test(f));
    expect(teacher.filter((f) => /\/ai\/(tutor|peer|agent)/.test(readFileSync(f, 'utf8')))).toEqual(
      [],
    );
  });
});
