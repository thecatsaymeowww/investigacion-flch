import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_grupos_escuela" AS ENUM('linguistica', 'literatura', 'filosofia', 'comunicacion-social', 'bibliotecologia', 'conservacion-restauracion', 'lenguas-traduccion', 'interdisciplinario');
  ALTER TABLE "grupos" ADD COLUMN "escuela" "enum_grupos_escuela";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "grupos" DROP COLUMN "escuela";
  DROP TYPE "public"."enum_grupos_escuela";`)
}
