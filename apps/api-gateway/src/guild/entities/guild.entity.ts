import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('guild')
export class Guild {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 60, unique: true })
  name: string;

  @Column({ type: 'varchar' })
  @Index()
  ownerCharacterId: string;

  @CreateDateColumn()
  createdAt: Date;
}
