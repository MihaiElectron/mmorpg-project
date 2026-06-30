import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuctionService } from './auction.service';

@Injectable()
export class AuctionScheduler {
  private readonly logger = new Logger(AuctionScheduler.name);

  constructor(private readonly auction: AuctionService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredListings(): Promise<void> {
    try {
      const expired = await this.auction.processExpiredListings();
      if (expired.length > 0) {
        this.logger.log(`${expired.length} annonce(s) expirée(s) traitées.`);
      }
    } catch (err) {
      this.logger.error('Erreur scheduler expiration auction:', (err as Error).message);
    }
  }
}
