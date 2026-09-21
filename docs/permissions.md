# Permissions (RBAC)

Permissions live in `@bouquet-one/contracts` (`PERMISSIONS`, `ROLE_PERMISSIONS`).

**Deny by default.** `@RequirePermissions(A, B)` means **AND** (both required).

## System roles

| Role | Intent |
| --- | --- |
| `SUPER_ADMIN` | Platform/store administrator — all permissions |
| `MANAGER` | Operations: orders, catalog edit/publish, delivery, limited settings/users read |
| `CONTENT_MANAGER` | Catalog/content/SEO create/update/publish |

See `ROLE_PERMISSIONS` in `packages/contracts/src/permissions.ts` for the exact matrix.

## Nest pattern for future modules

```ts
@Public() // only for explicitly public routes (health, login)

@Controller('admin/catalog')
export class CatalogAdminController {
  @Get()
  @RequirePermissions('CATALOG_READ')
  list() {}
}
```

Global guards (in order): throttler → session auth for `/admin` → permissions → CSRF.

Do **not** check `if (role === 'SUPER_ADMIN')` in business code — check permissions.
