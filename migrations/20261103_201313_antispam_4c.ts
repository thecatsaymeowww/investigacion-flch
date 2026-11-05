import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_mensajes_estado" ADD VALUE 'posible-spam' BEFORE 'atendido';
  ALTER TABLE "mensajes" ADD COLUMN "duplicado_de_id" integer;
  ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_duplicado_de_id_mensajes_id_fk" FOREIGN KEY ("duplicado_de_id") REFERENCES "public"."mensajes"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "mensajes_duplicado_de_idx" ON "mensajes" USING btree ("duplicado_de_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "mensajes" DROP CONSTRAINT "mensajes_duplicado_de_id_mensajes_id_fk";
  
  ALTER TABLE "mensajes" ALTER COLUMN "estado" SET DATA TYPE text;
  ALTER TABLE "mensajes" ALTER COLUMN "estado" SET DEFAULT 'nuevo'::text;
  DROP TYPE "public"."enum_mensajes_estado";
  CREATE TYPE "public"."enum_mensajes_estado" AS ENUM('nuevo', 'atendido');
  ALTER TABLE "mensajes" ALTER COLUMN "estado" SET DEFAULT 'nuevo'::"public"."enum_mensajes_estado";
  ALTER TABLE "mensajes" ALTER COLUMN "estado" SET DATA TYPE "public"."enum_mensajes_estado" USING "estado"::"public"."enum_mensajes_estado";
  DROP INDEX "mensajes_duplicado_de_idx";
  ALTER TABLE "mensajes" DROP COLUMN "duplicado_de_id";`)
}
