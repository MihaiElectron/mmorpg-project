// Module utilitaire destiné à regrouper les providers partagés (guards,
// pipes, filtres, helpers). Ajoutez-y les composants réutilisés dans tout le
// backend.
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { WsAuthService } from './ws-auth.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [WsAuthService],
  exports: [WsAuthService],
})
export class CommonModule {}
