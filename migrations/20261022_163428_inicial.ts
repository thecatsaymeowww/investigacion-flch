import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_landing_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__landing_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_integrantes_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__integrantes_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_publicaciones_tipo" AS ENUM('Libro', 'Artículo', 'Capítulo', 'Boletín');
  CREATE TYPE "public"."enum_publicaciones_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__publicaciones_v_version_tipo" AS ENUM('Libro', 'Artículo', 'Capítulo', 'Boletín');
  CREATE TYPE "public"."enum__publicaciones_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_actividades_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__actividades_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_eventos_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__eventos_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_media_visibilidad" AS ENUM('publica', 'privada');
  CREATE TYPE "public"."enum_mensajes_estado" AS ENUM('nuevo', 'atendido');
  CREATE TYPE "public"."enum_usuarios_roles" AS ENUM('superadmin', 'editor');
  CREATE TABLE "landing_aliados" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"nombre" varchar,
  	"url" varchar,
  	"logo_id" integer
  );
  
  CREATE TABLE "landing_galeria" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"imagen_id" integer,
  	"pie" varchar,
  	"alta" boolean
  );
  
  CREATE TABLE "landing_tipos_colaboracion" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tipo" varchar
  );
  
  CREATE TABLE "landing" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"grupo_id" integer,
  	"nombre" varchar,
  	"grupo_texto" varchar,
  	"universidad" varchar DEFAULT 'Universidad Nacional Mayor de San Marcos',
  	"sigla" varchar DEFAULT 'UNMSM',
  	"ciudad" varchar DEFAULT 'Lima',
  	"pais" varchar DEFAULT 'Perú',
  	"anio_fundacion" numeric,
  	"edicion" varchar DEFAULT 'Edición permanente',
  	"lema" varchar,
  	"editorial_etiqueta" varchar DEFAULT 'Editorial',
  	"titular" varchar,
  	"texto" varchar,
  	"foto_hero_id" integer,
  	"foto_pie" varchar,
  	"foto_credito" varchar,
  	"cifra_fundacion" varchar DEFAULT 'Año de fundación',
  	"nota_fundacion" varchar,
  	"cifra_integrantes" varchar DEFAULT 'Investigadores',
  	"nota_integrantes" varchar,
  	"cifra_publicaciones" varchar DEFAULT 'Publicaciones',
  	"nota_publicaciones" varchar,
  	"cifra_actividades" varchar DEFAULT 'Actividades',
  	"nota_actividades" varchar,
  	"integrantes_intro" varchar,
  	"colaborar_etiqueta" varchar DEFAULT 'Convocatoria abierta',
  	"colaborar_titular" varchar DEFAULT 'Escriba a la redacción',
  	"colaborar_texto" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_landing_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_landing_v_version_aliados" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar,
  	"url" varchar,
  	"logo_id" integer,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_landing_v_version_galeria" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"imagen_id" integer,
  	"pie" varchar,
  	"alta" boolean,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_landing_v_version_tipos_colaboracion" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"tipo" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_landing_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_grupo_id" integer,
  	"version_nombre" varchar,
  	"version_grupo_texto" varchar,
  	"version_universidad" varchar DEFAULT 'Universidad Nacional Mayor de San Marcos',
  	"version_sigla" varchar DEFAULT 'UNMSM',
  	"version_ciudad" varchar DEFAULT 'Lima',
  	"version_pais" varchar DEFAULT 'Perú',
  	"version_anio_fundacion" numeric,
  	"version_edicion" varchar DEFAULT 'Edición permanente',
  	"version_lema" varchar,
  	"version_editorial_etiqueta" varchar DEFAULT 'Editorial',
  	"version_titular" varchar,
  	"version_texto" varchar,
  	"version_foto_hero_id" integer,
  	"version_foto_pie" varchar,
  	"version_foto_credito" varchar,
  	"version_cifra_fundacion" varchar DEFAULT 'Año de fundación',
  	"version_nota_fundacion" varchar,
  	"version_cifra_integrantes" varchar DEFAULT 'Investigadores',
  	"version_nota_integrantes" varchar,
  	"version_cifra_publicaciones" varchar DEFAULT 'Publicaciones',
  	"version_nota_publicaciones" varchar,
  	"version_cifra_actividades" varchar DEFAULT 'Actividades',
  	"version_nota_actividades" varchar,
  	"version_integrantes_intro" varchar,
  	"version_colaborar_etiqueta" varchar DEFAULT 'Convocatoria abierta',
  	"version_colaborar_titular" varchar DEFAULT 'Escriba a la redacción',
  	"version_colaborar_texto" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__landing_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "integrantes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"grupo_id" integer,
  	"nombre" varchar,
  	"rol" varchar,
  	"foto_id" integer,
  	"bio" varchar,
  	"orden" numeric DEFAULT 100,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_integrantes_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_integrantes_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_grupo_id" integer,
  	"version_nombre" varchar,
  	"version_rol" varchar,
  	"version_foto_id" integer,
  	"version_bio" varchar,
  	"version_orden" numeric DEFAULT 100,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__integrantes_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "publicaciones" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"grupo_id" integer,
  	"titulo" varchar,
  	"autoria" varchar,
  	"tipo" "enum_publicaciones_tipo" DEFAULT 'Artículo',
  	"anio" numeric,
  	"codigo" varchar,
  	"portada_id" integer,
  	"pdf_id" integer,
  	"url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_publicaciones_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_publicaciones_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_grupo_id" integer,
  	"version_titulo" varchar,
  	"version_autoria" varchar,
  	"version_tipo" "enum__publicaciones_v_version_tipo" DEFAULT 'Artículo',
  	"version_anio" numeric,
  	"version_codigo" varchar,
  	"version_portada_id" integer,
  	"version_pdf_id" integer,
  	"version_url" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__publicaciones_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "actividades" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"grupo_id" integer,
  	"titulo" varchar,
  	"tipo" varchar DEFAULT 'Seminario',
  	"fecha" timestamp(3) with time zone,
  	"hora" varchar,
  	"lugar" varchar,
  	"resumen" varchar,
  	"texto" varchar,
  	"imagen_id" integer,
  	"url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_actividades_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_actividades_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_grupo_id" integer,
  	"version_titulo" varchar,
  	"version_tipo" varchar DEFAULT 'Seminario',
  	"version_fecha" timestamp(3) with time zone,
  	"version_hora" varchar,
  	"version_lugar" varchar,
  	"version_resumen" varchar,
  	"version_texto" varchar,
  	"version_imagen_id" integer,
  	"version_url" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__actividades_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "eventos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"grupo_id" integer,
  	"titulo" varchar,
  	"fecha" timestamp(3) with time zone,
  	"hora" varchar,
  	"tipo" varchar DEFAULT 'Seminario',
  	"lugar" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_eventos_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_eventos_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_grupo_id" integer,
  	"version_titulo" varchar,
  	"version_fecha" timestamp(3) with time zone,
  	"version_hora" varchar,
  	"version_tipo" varchar DEFAULT 'Seminario',
  	"version_lugar" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__eventos_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"grupo_id" integer,
  	"alt" varchar NOT NULL,
  	"visibilidad" "enum_media_visibilidad" DEFAULT 'privada',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "mensajes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"grupo_id" integer,
  	"nombre" varchar NOT NULL,
  	"correo" varchar NOT NULL,
  	"institucion" varchar,
  	"tipo" varchar,
  	"mensaje" varchar NOT NULL,
  	"estado" "enum_mensajes_estado" DEFAULT 'nuevo',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "grupos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"padre_id" integer,
  	"slug" varchar NOT NULL,
  	"ruta" varchar,
  	"activo" boolean DEFAULT true,
  	"orden" numeric DEFAULT 100,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "usuarios_roles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_usuarios_roles",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "usuarios_grupos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"grupo_id" integer NOT NULL
  );
  
  CREATE TABLE "usuarios_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "usuarios" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"reset_password_requested_at" timestamp(3) with time zone,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "registro_cambios" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"grupo_id" integer,
  	"coleccion" varchar NOT NULL,
  	"documento" varchar NOT NULL,
  	"operacion" varchar NOT NULL,
  	"actor" varchar NOT NULL,
  	"antes_hash" varchar,
  	"despues_hash" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"landing_id" integer,
  	"integrantes_id" integer,
  	"publicaciones_id" integer,
  	"actividades_id" integer,
  	"eventos_id" integer,
  	"media_id" integer,
  	"mensajes_id" integer,
  	"grupos_id" integer,
  	"usuarios_id" integer,
  	"registro_cambios_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"usuarios_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "landing_aliados" ADD CONSTRAINT "landing_aliados_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "landing_aliados" ADD CONSTRAINT "landing_aliados_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landing"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landing_galeria" ADD CONSTRAINT "landing_galeria_imagen_id_media_id_fk" FOREIGN KEY ("imagen_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "landing_galeria" ADD CONSTRAINT "landing_galeria_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landing"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landing_tipos_colaboracion" ADD CONSTRAINT "landing_tipos_colaboracion_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landing"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landing" ADD CONSTRAINT "landing_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "landing" ADD CONSTRAINT "landing_foto_hero_id_media_id_fk" FOREIGN KEY ("foto_hero_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_landing_v_version_aliados" ADD CONSTRAINT "_landing_v_version_aliados_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_landing_v_version_aliados" ADD CONSTRAINT "_landing_v_version_aliados_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landing_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landing_v_version_galeria" ADD CONSTRAINT "_landing_v_version_galeria_imagen_id_media_id_fk" FOREIGN KEY ("imagen_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_landing_v_version_galeria" ADD CONSTRAINT "_landing_v_version_galeria_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landing_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landing_v_version_tipos_colaboracion" ADD CONSTRAINT "_landing_v_version_tipos_colaboracion_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landing_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landing_v" ADD CONSTRAINT "_landing_v_parent_id_landing_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."landing"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_landing_v" ADD CONSTRAINT "_landing_v_version_grupo_id_grupos_id_fk" FOREIGN KEY ("version_grupo_id") REFERENCES "public"."grupos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_landing_v" ADD CONSTRAINT "_landing_v_version_foto_hero_id_media_id_fk" FOREIGN KEY ("version_foto_hero_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "integrantes" ADD CONSTRAINT "integrantes_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "integrantes" ADD CONSTRAINT "integrantes_foto_id_media_id_fk" FOREIGN KEY ("foto_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_integrantes_v" ADD CONSTRAINT "_integrantes_v_parent_id_integrantes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."integrantes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_integrantes_v" ADD CONSTRAINT "_integrantes_v_version_grupo_id_grupos_id_fk" FOREIGN KEY ("version_grupo_id") REFERENCES "public"."grupos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_integrantes_v" ADD CONSTRAINT "_integrantes_v_version_foto_id_media_id_fk" FOREIGN KEY ("version_foto_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "publicaciones" ADD CONSTRAINT "publicaciones_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "publicaciones" ADD CONSTRAINT "publicaciones_portada_id_media_id_fk" FOREIGN KEY ("portada_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "publicaciones" ADD CONSTRAINT "publicaciones_pdf_id_media_id_fk" FOREIGN KEY ("pdf_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_publicaciones_v" ADD CONSTRAINT "_publicaciones_v_parent_id_publicaciones_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."publicaciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_publicaciones_v" ADD CONSTRAINT "_publicaciones_v_version_grupo_id_grupos_id_fk" FOREIGN KEY ("version_grupo_id") REFERENCES "public"."grupos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_publicaciones_v" ADD CONSTRAINT "_publicaciones_v_version_portada_id_media_id_fk" FOREIGN KEY ("version_portada_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_publicaciones_v" ADD CONSTRAINT "_publicaciones_v_version_pdf_id_media_id_fk" FOREIGN KEY ("version_pdf_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "actividades" ADD CONSTRAINT "actividades_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "actividades" ADD CONSTRAINT "actividades_imagen_id_media_id_fk" FOREIGN KEY ("imagen_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_actividades_v" ADD CONSTRAINT "_actividades_v_parent_id_actividades_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."actividades"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_actividades_v" ADD CONSTRAINT "_actividades_v_version_grupo_id_grupos_id_fk" FOREIGN KEY ("version_grupo_id") REFERENCES "public"."grupos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_actividades_v" ADD CONSTRAINT "_actividades_v_version_imagen_id_media_id_fk" FOREIGN KEY ("version_imagen_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "eventos" ADD CONSTRAINT "eventos_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_eventos_v" ADD CONSTRAINT "_eventos_v_parent_id_eventos_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."eventos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_eventos_v" ADD CONSTRAINT "_eventos_v_version_grupo_id_grupos_id_fk" FOREIGN KEY ("version_grupo_id") REFERENCES "public"."grupos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media" ADD CONSTRAINT "media_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "grupos" ADD CONSTRAINT "grupos_padre_id_grupos_id_fk" FOREIGN KEY ("padre_id") REFERENCES "public"."grupos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "usuarios_roles" ADD CONSTRAINT "usuarios_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "usuarios_grupos" ADD CONSTRAINT "usuarios_grupos_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "usuarios_grupos" ADD CONSTRAINT "usuarios_grupos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "usuarios_sessions" ADD CONSTRAINT "usuarios_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "registro_cambios" ADD CONSTRAINT "registro_cambios_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_landing_fk" FOREIGN KEY ("landing_id") REFERENCES "public"."landing"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_integrantes_fk" FOREIGN KEY ("integrantes_id") REFERENCES "public"."integrantes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_publicaciones_fk" FOREIGN KEY ("publicaciones_id") REFERENCES "public"."publicaciones"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_actividades_fk" FOREIGN KEY ("actividades_id") REFERENCES "public"."actividades"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_eventos_fk" FOREIGN KEY ("eventos_id") REFERENCES "public"."eventos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_mensajes_fk" FOREIGN KEY ("mensajes_id") REFERENCES "public"."mensajes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_grupos_fk" FOREIGN KEY ("grupos_id") REFERENCES "public"."grupos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_usuarios_fk" FOREIGN KEY ("usuarios_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_registro_cambios_fk" FOREIGN KEY ("registro_cambios_id") REFERENCES "public"."registro_cambios"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_usuarios_fk" FOREIGN KEY ("usuarios_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "landing_aliados_order_idx" ON "landing_aliados" USING btree ("_order");
  CREATE INDEX "landing_aliados_parent_id_idx" ON "landing_aliados" USING btree ("_parent_id");
  CREATE INDEX "landing_aliados_logo_idx" ON "landing_aliados" USING btree ("logo_id");
  CREATE INDEX "landing_galeria_order_idx" ON "landing_galeria" USING btree ("_order");
  CREATE INDEX "landing_galeria_parent_id_idx" ON "landing_galeria" USING btree ("_parent_id");
  CREATE INDEX "landing_galeria_imagen_idx" ON "landing_galeria" USING btree ("imagen_id");
  CREATE INDEX "landing_tipos_colaboracion_order_idx" ON "landing_tipos_colaboracion" USING btree ("_order");
  CREATE INDEX "landing_tipos_colaboracion_parent_id_idx" ON "landing_tipos_colaboracion" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "landing_grupo_idx" ON "landing" USING btree ("grupo_id");
  CREATE INDEX "landing_foto_hero_idx" ON "landing" USING btree ("foto_hero_id");
  CREATE INDEX "landing_updated_at_idx" ON "landing" USING btree ("updated_at");
  CREATE INDEX "landing_created_at_idx" ON "landing" USING btree ("created_at");
  CREATE INDEX "landing__status_idx" ON "landing" USING btree ("_status");
  CREATE INDEX "_landing_v_version_aliados_order_idx" ON "_landing_v_version_aliados" USING btree ("_order");
  CREATE INDEX "_landing_v_version_aliados_parent_id_idx" ON "_landing_v_version_aliados" USING btree ("_parent_id");
  CREATE INDEX "_landing_v_version_aliados_logo_idx" ON "_landing_v_version_aliados" USING btree ("logo_id");
  CREATE INDEX "_landing_v_version_galeria_order_idx" ON "_landing_v_version_galeria" USING btree ("_order");
  CREATE INDEX "_landing_v_version_galeria_parent_id_idx" ON "_landing_v_version_galeria" USING btree ("_parent_id");
  CREATE INDEX "_landing_v_version_galeria_imagen_idx" ON "_landing_v_version_galeria" USING btree ("imagen_id");
  CREATE INDEX "_landing_v_version_tipos_colaboracion_order_idx" ON "_landing_v_version_tipos_colaboracion" USING btree ("_order");
  CREATE INDEX "_landing_v_version_tipos_colaboracion_parent_id_idx" ON "_landing_v_version_tipos_colaboracion" USING btree ("_parent_id");
  CREATE INDEX "_landing_v_parent_idx" ON "_landing_v" USING btree ("parent_id");
  CREATE INDEX "_landing_v_version_version_grupo_idx" ON "_landing_v" USING btree ("version_grupo_id");
  CREATE INDEX "_landing_v_version_version_foto_hero_idx" ON "_landing_v" USING btree ("version_foto_hero_id");
  CREATE INDEX "_landing_v_version_version_updated_at_idx" ON "_landing_v" USING btree ("version_updated_at");
  CREATE INDEX "_landing_v_version_version_created_at_idx" ON "_landing_v" USING btree ("version_created_at");
  CREATE INDEX "_landing_v_version_version__status_idx" ON "_landing_v" USING btree ("version__status");
  CREATE INDEX "_landing_v_created_at_idx" ON "_landing_v" USING btree ("created_at");
  CREATE INDEX "_landing_v_updated_at_idx" ON "_landing_v" USING btree ("updated_at");
  CREATE INDEX "_landing_v_latest_idx" ON "_landing_v" USING btree ("latest");
  CREATE INDEX "integrantes_grupo_idx" ON "integrantes" USING btree ("grupo_id");
  CREATE INDEX "integrantes_foto_idx" ON "integrantes" USING btree ("foto_id");
  CREATE INDEX "integrantes_updated_at_idx" ON "integrantes" USING btree ("updated_at");
  CREATE INDEX "integrantes_created_at_idx" ON "integrantes" USING btree ("created_at");
  CREATE INDEX "integrantes__status_idx" ON "integrantes" USING btree ("_status");
  CREATE INDEX "_integrantes_v_parent_idx" ON "_integrantes_v" USING btree ("parent_id");
  CREATE INDEX "_integrantes_v_version_version_grupo_idx" ON "_integrantes_v" USING btree ("version_grupo_id");
  CREATE INDEX "_integrantes_v_version_version_foto_idx" ON "_integrantes_v" USING btree ("version_foto_id");
  CREATE INDEX "_integrantes_v_version_version_updated_at_idx" ON "_integrantes_v" USING btree ("version_updated_at");
  CREATE INDEX "_integrantes_v_version_version_created_at_idx" ON "_integrantes_v" USING btree ("version_created_at");
  CREATE INDEX "_integrantes_v_version_version__status_idx" ON "_integrantes_v" USING btree ("version__status");
  CREATE INDEX "_integrantes_v_created_at_idx" ON "_integrantes_v" USING btree ("created_at");
  CREATE INDEX "_integrantes_v_updated_at_idx" ON "_integrantes_v" USING btree ("updated_at");
  CREATE INDEX "_integrantes_v_latest_idx" ON "_integrantes_v" USING btree ("latest");
  CREATE INDEX "publicaciones_grupo_idx" ON "publicaciones" USING btree ("grupo_id");
  CREATE INDEX "publicaciones_portada_idx" ON "publicaciones" USING btree ("portada_id");
  CREATE INDEX "publicaciones_pdf_idx" ON "publicaciones" USING btree ("pdf_id");
  CREATE INDEX "publicaciones_updated_at_idx" ON "publicaciones" USING btree ("updated_at");
  CREATE INDEX "publicaciones_created_at_idx" ON "publicaciones" USING btree ("created_at");
  CREATE INDEX "publicaciones__status_idx" ON "publicaciones" USING btree ("_status");
  CREATE INDEX "_publicaciones_v_parent_idx" ON "_publicaciones_v" USING btree ("parent_id");
  CREATE INDEX "_publicaciones_v_version_version_grupo_idx" ON "_publicaciones_v" USING btree ("version_grupo_id");
  CREATE INDEX "_publicaciones_v_version_version_portada_idx" ON "_publicaciones_v" USING btree ("version_portada_id");
  CREATE INDEX "_publicaciones_v_version_version_pdf_idx" ON "_publicaciones_v" USING btree ("version_pdf_id");
  CREATE INDEX "_publicaciones_v_version_version_updated_at_idx" ON "_publicaciones_v" USING btree ("version_updated_at");
  CREATE INDEX "_publicaciones_v_version_version_created_at_idx" ON "_publicaciones_v" USING btree ("version_created_at");
  CREATE INDEX "_publicaciones_v_version_version__status_idx" ON "_publicaciones_v" USING btree ("version__status");
  CREATE INDEX "_publicaciones_v_created_at_idx" ON "_publicaciones_v" USING btree ("created_at");
  CREATE INDEX "_publicaciones_v_updated_at_idx" ON "_publicaciones_v" USING btree ("updated_at");
  CREATE INDEX "_publicaciones_v_latest_idx" ON "_publicaciones_v" USING btree ("latest");
  CREATE INDEX "actividades_grupo_idx" ON "actividades" USING btree ("grupo_id");
  CREATE INDEX "actividades_imagen_idx" ON "actividades" USING btree ("imagen_id");
  CREATE INDEX "actividades_updated_at_idx" ON "actividades" USING btree ("updated_at");
  CREATE INDEX "actividades_created_at_idx" ON "actividades" USING btree ("created_at");
  CREATE INDEX "actividades__status_idx" ON "actividades" USING btree ("_status");
  CREATE INDEX "_actividades_v_parent_idx" ON "_actividades_v" USING btree ("parent_id");
  CREATE INDEX "_actividades_v_version_version_grupo_idx" ON "_actividades_v" USING btree ("version_grupo_id");
  CREATE INDEX "_actividades_v_version_version_imagen_idx" ON "_actividades_v" USING btree ("version_imagen_id");
  CREATE INDEX "_actividades_v_version_version_updated_at_idx" ON "_actividades_v" USING btree ("version_updated_at");
  CREATE INDEX "_actividades_v_version_version_created_at_idx" ON "_actividades_v" USING btree ("version_created_at");
  CREATE INDEX "_actividades_v_version_version__status_idx" ON "_actividades_v" USING btree ("version__status");
  CREATE INDEX "_actividades_v_created_at_idx" ON "_actividades_v" USING btree ("created_at");
  CREATE INDEX "_actividades_v_updated_at_idx" ON "_actividades_v" USING btree ("updated_at");
  CREATE INDEX "_actividades_v_latest_idx" ON "_actividades_v" USING btree ("latest");
  CREATE INDEX "eventos_grupo_idx" ON "eventos" USING btree ("grupo_id");
  CREATE INDEX "eventos_updated_at_idx" ON "eventos" USING btree ("updated_at");
  CREATE INDEX "eventos_created_at_idx" ON "eventos" USING btree ("created_at");
  CREATE INDEX "eventos__status_idx" ON "eventos" USING btree ("_status");
  CREATE INDEX "_eventos_v_parent_idx" ON "_eventos_v" USING btree ("parent_id");
  CREATE INDEX "_eventos_v_version_version_grupo_idx" ON "_eventos_v" USING btree ("version_grupo_id");
  CREATE INDEX "_eventos_v_version_version_updated_at_idx" ON "_eventos_v" USING btree ("version_updated_at");
  CREATE INDEX "_eventos_v_version_version_created_at_idx" ON "_eventos_v" USING btree ("version_created_at");
  CREATE INDEX "_eventos_v_version_version__status_idx" ON "_eventos_v" USING btree ("version__status");
  CREATE INDEX "_eventos_v_created_at_idx" ON "_eventos_v" USING btree ("created_at");
  CREATE INDEX "_eventos_v_updated_at_idx" ON "_eventos_v" USING btree ("updated_at");
  CREATE INDEX "_eventos_v_latest_idx" ON "_eventos_v" USING btree ("latest");
  CREATE INDEX "media_grupo_idx" ON "media" USING btree ("grupo_id");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "mensajes_grupo_idx" ON "mensajes" USING btree ("grupo_id");
  CREATE INDEX "mensajes_updated_at_idx" ON "mensajes" USING btree ("updated_at");
  CREATE INDEX "mensajes_created_at_idx" ON "mensajes" USING btree ("created_at");
  CREATE INDEX "grupos_padre_idx" ON "grupos" USING btree ("padre_id");
  CREATE INDEX "grupos_slug_idx" ON "grupos" USING btree ("slug");
  CREATE UNIQUE INDEX "grupos_ruta_idx" ON "grupos" USING btree ("ruta");
  CREATE INDEX "grupos_updated_at_idx" ON "grupos" USING btree ("updated_at");
  CREATE INDEX "grupos_created_at_idx" ON "grupos" USING btree ("created_at");
  CREATE INDEX "usuarios_roles_order_idx" ON "usuarios_roles" USING btree ("order");
  CREATE INDEX "usuarios_roles_parent_idx" ON "usuarios_roles" USING btree ("parent_id");
  CREATE INDEX "usuarios_grupos_order_idx" ON "usuarios_grupos" USING btree ("_order");
  CREATE INDEX "usuarios_grupos_parent_id_idx" ON "usuarios_grupos" USING btree ("_parent_id");
  CREATE INDEX "usuarios_grupos_grupo_idx" ON "usuarios_grupos" USING btree ("grupo_id");
  CREATE INDEX "usuarios_sessions_order_idx" ON "usuarios_sessions" USING btree ("_order");
  CREATE INDEX "usuarios_sessions_parent_id_idx" ON "usuarios_sessions" USING btree ("_parent_id");
  CREATE INDEX "usuarios_updated_at_idx" ON "usuarios" USING btree ("updated_at");
  CREATE INDEX "usuarios_created_at_idx" ON "usuarios" USING btree ("created_at");
  CREATE UNIQUE INDEX "usuarios_email_idx" ON "usuarios" USING btree ("email");
  CREATE INDEX "registro_cambios_grupo_idx" ON "registro_cambios" USING btree ("grupo_id");
  CREATE INDEX "registro_cambios_updated_at_idx" ON "registro_cambios" USING btree ("updated_at");
  CREATE INDEX "registro_cambios_created_at_idx" ON "registro_cambios" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_landing_id_idx" ON "payload_locked_documents_rels" USING btree ("landing_id");
  CREATE INDEX "payload_locked_documents_rels_integrantes_id_idx" ON "payload_locked_documents_rels" USING btree ("integrantes_id");
  CREATE INDEX "payload_locked_documents_rels_publicaciones_id_idx" ON "payload_locked_documents_rels" USING btree ("publicaciones_id");
  CREATE INDEX "payload_locked_documents_rels_actividades_id_idx" ON "payload_locked_documents_rels" USING btree ("actividades_id");
  CREATE INDEX "payload_locked_documents_rels_eventos_id_idx" ON "payload_locked_documents_rels" USING btree ("eventos_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_mensajes_id_idx" ON "payload_locked_documents_rels" USING btree ("mensajes_id");
  CREATE INDEX "payload_locked_documents_rels_grupos_id_idx" ON "payload_locked_documents_rels" USING btree ("grupos_id");
  CREATE INDEX "payload_locked_documents_rels_usuarios_id_idx" ON "payload_locked_documents_rels" USING btree ("usuarios_id");
  CREATE INDEX "payload_locked_documents_rels_registro_cambios_id_idx" ON "payload_locked_documents_rels" USING btree ("registro_cambios_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_usuarios_id_idx" ON "payload_preferences_rels" USING btree ("usuarios_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "landing_aliados" CASCADE;
  DROP TABLE "landing_galeria" CASCADE;
  DROP TABLE "landing_tipos_colaboracion" CASCADE;
  DROP TABLE "landing" CASCADE;
  DROP TABLE "_landing_v_version_aliados" CASCADE;
  DROP TABLE "_landing_v_version_galeria" CASCADE;
  DROP TABLE "_landing_v_version_tipos_colaboracion" CASCADE;
  DROP TABLE "_landing_v" CASCADE;
  DROP TABLE "integrantes" CASCADE;
  DROP TABLE "_integrantes_v" CASCADE;
  DROP TABLE "publicaciones" CASCADE;
  DROP TABLE "_publicaciones_v" CASCADE;
  DROP TABLE "actividades" CASCADE;
  DROP TABLE "_actividades_v" CASCADE;
  DROP TABLE "eventos" CASCADE;
  DROP TABLE "_eventos_v" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "mensajes" CASCADE;
  DROP TABLE "grupos" CASCADE;
  DROP TABLE "usuarios_roles" CASCADE;
  DROP TABLE "usuarios_grupos" CASCADE;
  DROP TABLE "usuarios_sessions" CASCADE;
  DROP TABLE "usuarios" CASCADE;
  DROP TABLE "registro_cambios" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_landing_status";
  DROP TYPE "public"."enum__landing_v_version_status";
  DROP TYPE "public"."enum_integrantes_status";
  DROP TYPE "public"."enum__integrantes_v_version_status";
  DROP TYPE "public"."enum_publicaciones_tipo";
  DROP TYPE "public"."enum_publicaciones_status";
  DROP TYPE "public"."enum__publicaciones_v_version_tipo";
  DROP TYPE "public"."enum__publicaciones_v_version_status";
  DROP TYPE "public"."enum_actividades_status";
  DROP TYPE "public"."enum__actividades_v_version_status";
  DROP TYPE "public"."enum_eventos_status";
  DROP TYPE "public"."enum__eventos_v_version_status";
  DROP TYPE "public"."enum_media_visibilidad";
  DROP TYPE "public"."enum_mensajes_estado";
  DROP TYPE "public"."enum_usuarios_roles";`)
}
