import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_noticias_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__noticias_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "noticias" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"grupo_id" integer,
  	"titulo" varchar,
  	"fecha" timestamp(3) with time zone,
  	"categoria" varchar,
  	"resumen" varchar,
  	"texto" varchar,
  	"imagen_id" integer,
  	"url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_noticias_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_noticias_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_grupo_id" integer,
  	"version_titulo" varchar,
  	"version_fecha" timestamp(3) with time zone,
  	"version_categoria" varchar,
  	"version_resumen" varchar,
  	"version_texto" varchar,
  	"version_imagen_id" integer,
  	"version_url" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__noticias_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "noticias_id" integer;
  ALTER TABLE "noticias" ADD CONSTRAINT "noticias_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "noticias" ADD CONSTRAINT "noticias_imagen_id_media_id_fk" FOREIGN KEY ("imagen_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_noticias_v" ADD CONSTRAINT "_noticias_v_parent_id_noticias_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."noticias"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_noticias_v" ADD CONSTRAINT "_noticias_v_version_grupo_id_grupos_id_fk" FOREIGN KEY ("version_grupo_id") REFERENCES "public"."grupos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_noticias_v" ADD CONSTRAINT "_noticias_v_version_imagen_id_media_id_fk" FOREIGN KEY ("version_imagen_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "noticias_grupo_idx" ON "noticias" USING btree ("grupo_id");
  CREATE INDEX "noticias_imagen_idx" ON "noticias" USING btree ("imagen_id");
  CREATE INDEX "noticias_updated_at_idx" ON "noticias" USING btree ("updated_at");
  CREATE INDEX "noticias_created_at_idx" ON "noticias" USING btree ("created_at");
  CREATE INDEX "noticias__status_idx" ON "noticias" USING btree ("_status");
  CREATE INDEX "_noticias_v_parent_idx" ON "_noticias_v" USING btree ("parent_id");
  CREATE INDEX "_noticias_v_version_version_grupo_idx" ON "_noticias_v" USING btree ("version_grupo_id");
  CREATE INDEX "_noticias_v_version_version_imagen_idx" ON "_noticias_v" USING btree ("version_imagen_id");
  CREATE INDEX "_noticias_v_version_version_updated_at_idx" ON "_noticias_v" USING btree ("version_updated_at");
  CREATE INDEX "_noticias_v_version_version_created_at_idx" ON "_noticias_v" USING btree ("version_created_at");
  CREATE INDEX "_noticias_v_version_version__status_idx" ON "_noticias_v" USING btree ("version__status");
  CREATE INDEX "_noticias_v_created_at_idx" ON "_noticias_v" USING btree ("created_at");
  CREATE INDEX "_noticias_v_updated_at_idx" ON "_noticias_v" USING btree ("updated_at");
  CREATE INDEX "_noticias_v_latest_idx" ON "_noticias_v" USING btree ("latest");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_noticias_fk" FOREIGN KEY ("noticias_id") REFERENCES "public"."noticias"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_noticias_id_idx" ON "payload_locked_documents_rels" USING btree ("noticias_id");`)

  // Datos (06-11-2026): las actividades de los GRUPOS de investigación (grupos.padre_id IS NULL) pasan a noticias, cada una
  // con su versión (como las crea Payload), y salen de Actividades con sus versiones. Las de los subgrupos no se tocan.
  // tipo → categoría; lugar y hora, que una noticia no tiene, se conservan como último párrafo del cuerpo.
  await db.execute(sql`
  DO $$
  DECLARE
    a record;
    nid integer;
    cuerpo varchar;
    extra varchar;
  BEGIN
    FOR a IN
      SELECT act.* FROM "actividades" act JOIN "grupos" g ON g."id" = act."grupo_id" WHERE g."padre_id" IS NULL ORDER BY act."id"
    LOOP
      extra := concat_ws(' · ', CASE WHEN coalesce(btrim(a."lugar"), '') <> '' THEN 'Lugar: ' || btrim(a."lugar") END,
                                CASE WHEN coalesce(btrim(a."hora"), '') <> '' THEN 'Hora: ' || btrim(a."hora") END);
      cuerpo := CASE
        WHEN coalesce(extra, '') = '' THEN a."texto"
        WHEN coalesce(btrim(a."texto"), '') = '' THEN extra
        ELSE a."texto" || E'\n\n' || extra
      END;
      INSERT INTO "noticias" ("grupo_id", "titulo", "fecha", "categoria", "resumen", "texto", "imagen_id", "url", "updated_at", "created_at", "_status")
      VALUES (a."grupo_id", a."titulo", a."fecha", a."tipo", a."resumen", cuerpo, a."imagen_id", a."url", a."updated_at", a."created_at", a."_status"::text::"enum_noticias_status")
      RETURNING "id" INTO nid;
      INSERT INTO "_noticias_v" ("parent_id", "version_grupo_id", "version_titulo", "version_fecha", "version_categoria", "version_resumen", "version_texto",
        "version_imagen_id", "version_url", "version_updated_at", "version_created_at", "version__status", "created_at", "updated_at", "latest")
      VALUES (nid, a."grupo_id", a."titulo", a."fecha", a."tipo", a."resumen", cuerpo, a."imagen_id", a."url", a."updated_at", a."created_at",
        a."_status"::text::"enum__noticias_v_version_status", a."updated_at", a."updated_at", true);
      DELETE FROM "_actividades_v" WHERE "parent_id" = a."id";
      DELETE FROM "actividades" WHERE "id" = a."id";
    END LOOP;
  END $$;`)
}

// La reversión borraría las noticias sin devolverlas a Actividades. scripts/guardia-migraciones.ts bloquea siempre
// migrate:down; si hubiera que deshacer este cambio, se haría desde el respaldo previo.
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "noticias" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_noticias_v" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "noticias" CASCADE;
  DROP TABLE "_noticias_v" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_noticias_fk";
  
  DROP INDEX "payload_locked_documents_rels_noticias_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "noticias_id";
  DROP TYPE "public"."enum_noticias_status";
  DROP TYPE "public"."enum__noticias_v_version_status";`)
}
