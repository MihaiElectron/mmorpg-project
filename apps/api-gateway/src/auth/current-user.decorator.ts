/**
 * CurrentUser Decorator
 * -----------------------------------------------------------------------------
 * Rôle :
 * - Permet de récupérer l'utilisateur authentifié injecté par la stratégie JWT.
 * - Simplifie l'accès à `request.user` dans les controllers.
 *
 * Fonctionnement :
 * - La JwtStrategy attache un objet `user` à la requête HTTP :
 *     request.user = { userId, username }
 *
 * - Ce décorateur renvoie cet objet tel quel.
 * - Dans un controller, on peut donc écrire :
 *     @CurrentUser() user
 *   et accéder à :
 *     user.userId
 *     user.username
 *
 * Paramètres :
 * - data : non utilisé ici (permettrait d'extraire une propriété spécifique)
 * - ctx  : contexte d'exécution NestJS (permet d'accéder à la requête)
 *
 * Retour :
 * - L'objet utilisateur attaché à la requête.
 * -----------------------------------------------------------------------------
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();

    // L'utilisateur injecté par JwtStrategy :
    // { userId, username }
    return request.user;
  },
);
