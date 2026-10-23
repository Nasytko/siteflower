import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('admin delete and form routes stay wired', () => {
  it('exposes PATCH/DELETE for flower forms', () => {
    const source = readFileSync(join(__dirname, 'admin-flower-refs.controller.ts'), 'utf8');
    expect(source).toContain("@Patch('forms/:id')");
    expect(source).toContain("@Delete('forms/:id')");
    expect(source).toContain('deleteFormEmpty');
  });

  it('exposes unused taxonomy DELETE and delete-impact', () => {
    const source = readFileSync(join(__dirname, 'taxonomy.controller.ts'), 'utf8');
    expect(source).toContain("@Get(':kind/:id/delete-impact')");
    expect(source).toContain("@Delete(':kind/:id')");
    expect(source).toContain('deleteEmpty');
  });

  it('exposes bestseller group DELETE on CATALOG_UPDATE', () => {
    const source = readFileSync(join(__dirname, 'admin-bestsellers.controller.ts'), 'utf8');
    expect(source).toContain("@Delete(':id')");
    expect(source).toContain("@RequirePermissions('CATALOG_UPDATE')");
    expect(source).toContain('bestsellers.remove');
  });

  it('exposes catalog page unpublish and safe delete', () => {
    const source = readFileSync(join(__dirname, 'admin-catalog-pages.controller.ts'), 'utf8');
    expect(source).toContain("@Post(':id/unpublish')");
    expect(source).toContain("@Delete(':id')");
    expect(source).toContain('deletePage');
  });
});
