import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Define quais roles podem acessar o endpoint.
 *
 * Exemplo:
 *   @Roles(Role.owner, Role.admin)
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
