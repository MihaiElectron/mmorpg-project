import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from './entities/wallet.entity';
import { EconomicTransaction } from './entities/economic-transaction.entity';
import { LedgerEntry } from './entities/ledger-entry.entity';
import { EconomyService } from './economy.service';

@Module({
  imports: [TypeOrmModule.forFeature([Wallet, EconomicTransaction, LedgerEntry])],
  providers: [EconomyService],
  exports: [EconomyService],
})
export class EconomyModule {}
