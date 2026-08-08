import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Evidence } from '../evidence/evidence.entity';
import { Asset } from './asset.entity';

@Entity('receivables')
@Unique('UQ_receivables_asset_position', ['assetId', 'position'])
export class Receivable {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'char', length: 66 })
  assetId: string;

  @ManyToOne(() => Asset, (asset) => asset.receivables, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assetId' })
  asset: Asset;

  @Column({ type: 'uuid' })
  evidenceId: string;

  @ManyToOne(() => Evidence, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'evidenceId' })
  evidence: Evidence;

  @Column({ type: 'integer' })
  position: number;

  @Column({ type: 'varchar', length: 64 })
  debtorTaxId: string;

  @Column({ type: 'varchar', length: 120 })
  debtorLabel: string;

  /** Numeric se expone como string para no perder precisión monetaria. */
  @Column({ type: 'numeric', precision: 78, scale: 0 })
  amountMinor: string;

  @Column({ type: 'date' })
  dueDate: string;

  @Column({ type: 'smallint' })
  currency: number;

  /** Copia inmutable del SHA-256 usado al construir la hoja. */
  @Column({ type: 'char', length: 66 })
  docHash: string;
}
