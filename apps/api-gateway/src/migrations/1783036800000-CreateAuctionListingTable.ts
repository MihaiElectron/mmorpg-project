import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuctionListingTable1783036800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE auction_listing_status AS ENUM (
        'LISTED',
        'SOLD_PENDING_CLAIM',
        'SOLD_CLAIMED',
        'EXPIRED_PENDING_CLAIM',
        'EXPIRED_CLAIMED',
        'CANCELLED_PENDING_CLAIM',
        'CANCELLED_CLAIMED',
        'ARCHIVED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE auction_listing (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        seller_character_id  VARCHAR NOT NULL,
        buyer_character_id   VARCHAR,
        item_instance_id     VARCHAR NOT NULL,
        item_id              VARCHAR NOT NULL,
        buyout_price_bronze  BIGINT NOT NULL,
        status               auction_listing_status NOT NULL DEFAULT 'LISTED',
        starts_at            TIMESTAMP NOT NULL,
        ends_at              TIMESTAMP NOT NULL,
        created_at           TIMESTAMP NOT NULL DEFAULT now(),
        updated_at           TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IDX_auction_listing_seller ON auction_listing(seller_character_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_auction_listing_buyer ON auction_listing(buyer_character_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_auction_listing_instance ON auction_listing(item_instance_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_auction_listing_status ON auction_listing(status)
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_auction_listing_ends_at ON auction_listing(ends_at)
    `);

    // Empêche qu'une même instance soit listée deux fois simultanément
    await queryRunner.query(`
      CREATE UNIQUE INDEX UQ_auction_listing_active_instance
        ON auction_listing(item_instance_id)
        WHERE status = 'LISTED'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS auction_listing`);
    await queryRunner.query(`DROP TYPE IF EXISTS auction_listing_status`);
  }
}
