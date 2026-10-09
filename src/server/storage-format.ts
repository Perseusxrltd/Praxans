import type { DatabaseSync } from "node:sqlite";

export const STORAGE_VERSION = 3;
export type StorageColumns = [string, string, number, number][];

export function storageVersion(db: DatabaseSync): number {
  const version = Number(db.prepare("PRAGMA user_version").get()!.user_version);
  if (
    !Number.isSafeInteger(version) ||
    version < 0 ||
    version > STORAGE_VERSION
  )
    throw new Error(
      `Unsupported storage version ${version}; preserve the database and use compatible code.`,
    );
  return version;
}

export function requireColumns(
  db: DatabaseSync,
  table: "world_backups" | "world_backup_parts" | "chunks",
  expected: StorageColumns,
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
    type: string;
    pk: number;
    notnull: number;
  }[];
  if (
    columns.length !== expected.length ||
    expected.some(([name, type, pk, notnull], index) => {
      const actual = columns[index];
      return (
        actual.name !== name ||
        actual.type.toUpperCase() !== type ||
        actual.pk !== pk ||
        actual.notnull !== notnull
      );
    })
  )
    throw new Error(
      `World storage schema for ${table} is incompatible; preserve the database.`,
    );
}
