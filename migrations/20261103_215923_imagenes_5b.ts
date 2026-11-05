import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media" ADD COLUMN "sizes_tarjeta_url" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_tarjeta_width" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_tarjeta_height" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_tarjeta_mime_type" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_tarjeta_filesize" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_tarjeta_filename" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_media_url" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_media_width" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_media_height" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_media_mime_type" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_media_filesize" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_media_filename" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_grande_url" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_grande_width" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_grande_height" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_grande_mime_type" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_grande_filesize" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_grande_filename" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_og_url" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_og_width" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_og_height" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_og_mime_type" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_og_filesize" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_og_filename" varchar;
  CREATE INDEX "media_sizes_tarjeta_sizes_tarjeta_filename_idx" ON "media" USING btree ("sizes_tarjeta_filename");
  CREATE INDEX "media_sizes_media_sizes_media_filename_idx" ON "media" USING btree ("sizes_media_filename");
  CREATE INDEX "media_sizes_grande_sizes_grande_filename_idx" ON "media" USING btree ("sizes_grande_filename");
  CREATE INDEX "media_sizes_og_sizes_og_filename_idx" ON "media" USING btree ("sizes_og_filename");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "media_sizes_tarjeta_sizes_tarjeta_filename_idx";
  DROP INDEX "media_sizes_media_sizes_media_filename_idx";
  DROP INDEX "media_sizes_grande_sizes_grande_filename_idx";
  DROP INDEX "media_sizes_og_sizes_og_filename_idx";
  ALTER TABLE "media" DROP COLUMN "sizes_tarjeta_url";
  ALTER TABLE "media" DROP COLUMN "sizes_tarjeta_width";
  ALTER TABLE "media" DROP COLUMN "sizes_tarjeta_height";
  ALTER TABLE "media" DROP COLUMN "sizes_tarjeta_mime_type";
  ALTER TABLE "media" DROP COLUMN "sizes_tarjeta_filesize";
  ALTER TABLE "media" DROP COLUMN "sizes_tarjeta_filename";
  ALTER TABLE "media" DROP COLUMN "sizes_media_url";
  ALTER TABLE "media" DROP COLUMN "sizes_media_width";
  ALTER TABLE "media" DROP COLUMN "sizes_media_height";
  ALTER TABLE "media" DROP COLUMN "sizes_media_mime_type";
  ALTER TABLE "media" DROP COLUMN "sizes_media_filesize";
  ALTER TABLE "media" DROP COLUMN "sizes_media_filename";
  ALTER TABLE "media" DROP COLUMN "sizes_grande_url";
  ALTER TABLE "media" DROP COLUMN "sizes_grande_width";
  ALTER TABLE "media" DROP COLUMN "sizes_grande_height";
  ALTER TABLE "media" DROP COLUMN "sizes_grande_mime_type";
  ALTER TABLE "media" DROP COLUMN "sizes_grande_filesize";
  ALTER TABLE "media" DROP COLUMN "sizes_grande_filename";
  ALTER TABLE "media" DROP COLUMN "sizes_og_url";
  ALTER TABLE "media" DROP COLUMN "sizes_og_width";
  ALTER TABLE "media" DROP COLUMN "sizes_og_height";
  ALTER TABLE "media" DROP COLUMN "sizes_og_mime_type";
  ALTER TABLE "media" DROP COLUMN "sizes_og_filesize";
  ALTER TABLE "media" DROP COLUMN "sizes_og_filename";`)
}
