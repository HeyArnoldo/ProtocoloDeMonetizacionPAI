import { keccak256, toBytes, type Hex } from 'viem';

export const ownerIdHash = (userId: string): Hex => keccak256(toBytes(userId));
