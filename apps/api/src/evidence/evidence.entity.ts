import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('evidence')
export class Evidence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  createdById: string;

  @Column({ type: 'varchar', length: 700, unique: true })
  objectKey: string;

  @Column({ type: 'varchar', length: 255 })
  originalName: string;

  @Column({ type: 'varchar', length: 160 })
  mimeType: string;

  @Column({ type: 'bigint' })
  sizeBytes: string;

  /** SHA-256 del archivo; no es un hash de hoja Merkle. */
  @Column({ type: 'char', length: 66 })
  sha256: string;

  @CreateDateColumn()
  createdAt: Date;
}
