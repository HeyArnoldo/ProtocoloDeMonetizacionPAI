import { Column, CreateDateColumn, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { Receivable } from './receivable.entity';

@Entity('assets')
export class Asset {
  /** bytes32 usado por AssetRegistry; no es un UUID de base de datos. */
  @PrimaryColumn({ type: 'char', length: 66 })
  id: string;

  @Column({ type: 'uuid' })
  createdById: string;

  @Column({ type: 'char', length: 66, unique: true })
  creationKey: string;

  @Column({ type: 'char', length: 66 })
  ownerIdHash: string;

  @Column({ type: 'char', length: 42 })
  controller: string;

  @Column({ type: 'char', length: 66 })
  debtorSalt: string;

  @Column({ type: 'char', length: 66 })
  merkleRoot: string;

  @Column({ type: 'char', length: 66, nullable: true })
  registrationTxHash: string | null;

  @Column({ type: 'boolean', default: false })
  registrationConfirmed: boolean;

  @Column({ type: 'bigint', nullable: true })
  registrationBlockNumber: string | null;

  @OneToMany(() => Receivable, (receivable) => receivable.asset, {
    cascade: ['insert'],
  })
  receivables: Receivable[];

  @CreateDateColumn()
  createdAt: Date;
}
