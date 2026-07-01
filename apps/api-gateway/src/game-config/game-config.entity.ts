import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('game_config')
export class GameConfig {
  @PrimaryColumn()
  id: number;

  @Column('int', { default: 100, name: 'character_base_xp_per_level' })
  characterBaseXpPerLevel: number;

  @Column('float', { default: 1.5, name: 'character_xp_curve_exponent' })
  characterXpCurveExponent: number;

  @Column('int', { default: 100, name: 'character_max_level' })
  characterMaxLevel: number;
}
