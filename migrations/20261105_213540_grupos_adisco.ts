import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_integrantes_tipo_investigador" AS ENUM('titular', 'adherente');
  CREATE TYPE "public"."enum__integrantes_v_version_tipo_investigador" AS ENUM('titular', 'adherente');
  CREATE TABLE "landing_objetivos_especificos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"objetivo" varchar
  );
  
  CREATE TABLE "landing_servicios" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"servicio" varchar
  );
  
  CREATE TABLE "landing_lineas" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"codigo" varchar,
  	"linea" varchar
  );
  
  CREATE TABLE "landing_ambientes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"ambiente" varchar,
  	"ubicacion" varchar
  );
  
  CREATE TABLE "landing_equipos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"codigo" varchar,
  	"laboratorio" varchar,
  	"responsable" varchar
  );
  
  CREATE TABLE "_landing_v_version_objetivos_especificos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"objetivo" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_landing_v_version_servicios" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"servicio" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_landing_v_version_lineas" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"codigo" varchar,
  	"linea" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_landing_v_version_ambientes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"ambiente" varchar,
  	"ubicacion" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_landing_v_version_equipos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"codigo" varchar,
  	"laboratorio" varchar,
  	"responsable" varchar,
  	"_uuid" varchar
  );
  
  ALTER TABLE "landing" ADD COLUMN "objetivo_general" varchar;
  ALTER TABLE "landing" ADD COLUMN "correo_contacto" varchar;
  ALTER TABLE "_landing_v" ADD COLUMN "version_objetivo_general" varchar;
  ALTER TABLE "_landing_v" ADD COLUMN "version_correo_contacto" varchar;
  ALTER TABLE "integrantes" ADD COLUMN "tipo_investigador" "enum_integrantes_tipo_investigador";
  ALTER TABLE "integrantes" ADD COLUMN "coordinador" boolean DEFAULT false;
  ALTER TABLE "integrantes" ADD COLUMN "vinculo" varchar;
  ALTER TABLE "integrantes" ADD COLUMN "facultad" varchar;
  ALTER TABLE "_integrantes_v" ADD COLUMN "version_tipo_investigador" "enum__integrantes_v_version_tipo_investigador";
  ALTER TABLE "_integrantes_v" ADD COLUMN "version_coordinador" boolean DEFAULT false;
  ALTER TABLE "_integrantes_v" ADD COLUMN "version_vinculo" varchar;
  ALTER TABLE "_integrantes_v" ADD COLUMN "version_facultad" varchar;
  ALTER TABLE "landing_objetivos_especificos" ADD CONSTRAINT "landing_objetivos_especificos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landing"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landing_servicios" ADD CONSTRAINT "landing_servicios_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landing"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landing_lineas" ADD CONSTRAINT "landing_lineas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landing"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landing_ambientes" ADD CONSTRAINT "landing_ambientes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landing"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landing_equipos" ADD CONSTRAINT "landing_equipos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landing"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landing_v_version_objetivos_especificos" ADD CONSTRAINT "_landing_v_version_objetivos_especificos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landing_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landing_v_version_servicios" ADD CONSTRAINT "_landing_v_version_servicios_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landing_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landing_v_version_lineas" ADD CONSTRAINT "_landing_v_version_lineas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landing_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landing_v_version_ambientes" ADD CONSTRAINT "_landing_v_version_ambientes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landing_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landing_v_version_equipos" ADD CONSTRAINT "_landing_v_version_equipos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landing_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "landing_objetivos_especificos_order_idx" ON "landing_objetivos_especificos" USING btree ("_order");
  CREATE INDEX "landing_objetivos_especificos_parent_id_idx" ON "landing_objetivos_especificos" USING btree ("_parent_id");
  CREATE INDEX "landing_servicios_order_idx" ON "landing_servicios" USING btree ("_order");
  CREATE INDEX "landing_servicios_parent_id_idx" ON "landing_servicios" USING btree ("_parent_id");
  CREATE INDEX "landing_lineas_order_idx" ON "landing_lineas" USING btree ("_order");
  CREATE INDEX "landing_lineas_parent_id_idx" ON "landing_lineas" USING btree ("_parent_id");
  CREATE INDEX "landing_ambientes_order_idx" ON "landing_ambientes" USING btree ("_order");
  CREATE INDEX "landing_ambientes_parent_id_idx" ON "landing_ambientes" USING btree ("_parent_id");
  CREATE INDEX "landing_equipos_order_idx" ON "landing_equipos" USING btree ("_order");
  CREATE INDEX "landing_equipos_parent_id_idx" ON "landing_equipos" USING btree ("_parent_id");
  CREATE INDEX "_landing_v_version_objetivos_especificos_order_idx" ON "_landing_v_version_objetivos_especificos" USING btree ("_order");
  CREATE INDEX "_landing_v_version_objetivos_especificos_parent_id_idx" ON "_landing_v_version_objetivos_especificos" USING btree ("_parent_id");
  CREATE INDEX "_landing_v_version_servicios_order_idx" ON "_landing_v_version_servicios" USING btree ("_order");
  CREATE INDEX "_landing_v_version_servicios_parent_id_idx" ON "_landing_v_version_servicios" USING btree ("_parent_id");
  CREATE INDEX "_landing_v_version_lineas_order_idx" ON "_landing_v_version_lineas" USING btree ("_order");
  CREATE INDEX "_landing_v_version_lineas_parent_id_idx" ON "_landing_v_version_lineas" USING btree ("_parent_id");
  CREATE INDEX "_landing_v_version_ambientes_order_idx" ON "_landing_v_version_ambientes" USING btree ("_order");
  CREATE INDEX "_landing_v_version_ambientes_parent_id_idx" ON "_landing_v_version_ambientes" USING btree ("_parent_id");
  CREATE INDEX "_landing_v_version_equipos_order_idx" ON "_landing_v_version_equipos" USING btree ("_order");
  CREATE INDEX "_landing_v_version_equipos_parent_id_idx" ON "_landing_v_version_equipos" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "landing_objetivos_especificos" CASCADE;
  DROP TABLE "landing_servicios" CASCADE;
  DROP TABLE "landing_lineas" CASCADE;
  DROP TABLE "landing_ambientes" CASCADE;
  DROP TABLE "landing_equipos" CASCADE;
  DROP TABLE "_landing_v_version_objetivos_especificos" CASCADE;
  DROP TABLE "_landing_v_version_servicios" CASCADE;
  DROP TABLE "_landing_v_version_lineas" CASCADE;
  DROP TABLE "_landing_v_version_ambientes" CASCADE;
  DROP TABLE "_landing_v_version_equipos" CASCADE;
  ALTER TABLE "landing" DROP COLUMN "objetivo_general";
  ALTER TABLE "landing" DROP COLUMN "correo_contacto";
  ALTER TABLE "_landing_v" DROP COLUMN "version_objetivo_general";
  ALTER TABLE "_landing_v" DROP COLUMN "version_correo_contacto";
  ALTER TABLE "integrantes" DROP COLUMN "tipo_investigador";
  ALTER TABLE "integrantes" DROP COLUMN "coordinador";
  ALTER TABLE "integrantes" DROP COLUMN "vinculo";
  ALTER TABLE "integrantes" DROP COLUMN "facultad";
  ALTER TABLE "_integrantes_v" DROP COLUMN "version_tipo_investigador";
  ALTER TABLE "_integrantes_v" DROP COLUMN "version_coordinador";
  ALTER TABLE "_integrantes_v" DROP COLUMN "version_vinculo";
  ALTER TABLE "_integrantes_v" DROP COLUMN "version_facultad";
  DROP TYPE "public"."enum_integrantes_tipo_investigador";
  DROP TYPE "public"."enum__integrantes_v_version_tipo_investigador";`)
}
