import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { GatewayModule } from './gateway/gateway.module';
import { CommonModule } from './common/common.module';

@Module({
  imports: [AuthModule, GatewayModule, CommonModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
